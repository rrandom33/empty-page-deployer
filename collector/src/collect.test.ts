import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect } from './main.ts';
import { parseListings, ShapeError } from './blizzard.ts';
import { parseForeverDbRecipes, parseForeverDbVendors } from './catalog.ts';
import { readJson } from './store.ts';
import type { DailyFile, HourlyFile, Meta } from './store.ts';

// Servidor que imita la API: dos casas que interesan y una de Horda.
let server: Server;
let auctions110: unknown[] = [];
let commodities110: unknown = { auctions: [] };
let failNext = 0;
const requested: string[] = [];

before(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://x').pathname;
    requested.push(path);
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (failNext > 0) { failNext--; return json({}, 503); }
    if (path === '/token') return json({ access_token: 't' });
    if (path === '/data/wow/ruleset/1/auctions/') {
      return json({ auctions: [
        { id: 110, name: 'Alliance Auction House' },
        { id: 111, name: 'Horde Auction House' },
        { id: 112, name: 'Blackwater Auction House' },
      ] });
    }
    if (path === '/data/wow/ruleset/1/auctions/110') return json({ id: 110, auctions: auctions110, commodities: { href: 'x' } });
    if (path === '/data/wow/ruleset/1/auctions/110/commodities') return json(commodities110);
    if (path === '/data/wow/ruleset/1/auctions/112') {
      return json({ id: 112, auctions: [{ id: 9, item: { id: 5 }, buyout: 300, quantity: 3, time_left: 'LONG' }] });
    }
    json({}, 404);
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  process.env.BLIZZARD_API_HOST = `http://127.0.0.1:${port}`;
  process.env.BLIZZARD_OAUTH_URL = `http://127.0.0.1:${port}/token`;
  process.env.BLIZZARD_CLIENT_ID = 'id';
  process.env.BLIZZARD_CLIENT_SECRET = 'secret';
  process.env.RETRY_BASE_MS = '1';
});
after(() => server.close());

test('recoge dos fotos, estima ventas y no repite una foto ya guardada', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'collect-'));
  auctions110 = [
    { id: 1, item: { id: 5 }, buyout: 1000, quantity: 10, time_left: 'LONG' },
    { id: 2, item: { id: 5 }, bid: 10, quantity: 1, time_left: 'LONG' },
    { id: 3, item: { id: 6 }, buyout: 50, quantity: 1, time_left: 'SHORT' },
  ];
  commodities110 = { auctions: [{ id: 4, item: { id: 7 }, quantity: 20, unit_price: 12, time_left: 'VERY_LONG' }] };

  failNext = 1; // un 503 inicial se reintenta
  assert.equal(await collect(dir, new Date('2026-11-12T10:05:00Z')), true);
  assert.ok(!requested.some((p) => p.endsWith('/111')), 'no se descarga la casa de Horda');

  const hourlyPath = join(dir, 'hourly/2026-11-12.json.gz');
  let hourly = readJson<HourlyFile>(hourlyPath)!;
  assert.equal(hourly.snaps.length, 1);
  assert.deepEqual(hourly.snaps[0]!.houses['110']!['5'], [100, 10, 1, 100, 10, 10, 10, 10, 10, null, null]);
  assert.equal(hourly.snaps[0]!.houses['110']!['7']![0], 12);
  assert.equal(hourly.snaps[0]!.houses['112']!['5']![0], 100);

  // Misma foto: no escribe.
  assert.equal(await collect(dir, new Date('2026-11-12T10:15:00Z')), false);

  // Foto siguiente: se venden 4 del anuncio 1 y 5 del material, desaparece el
  // anuncio 2 (cuenta como venta) y el 3 caduca.
  auctions110 = [{ id: 1, item: { id: 5 }, buyout: 600, quantity: 6, time_left: 'LONG' }];
  commodities110 = { auctions: [{ id: 4, item: { id: 7 }, quantity: 15, unit_price: 12, time_left: 'LONG' }] };
  assert.equal(await collect(dir, new Date('2026-11-12T11:05:00Z')), true);

  hourly = readJson<HourlyFile>(hourlyPath)!;
  assert.equal(hourly.snaps.length, 2);
  const second = hourly.snaps[1]!;
  assert.equal(second.gap_min, 60);
  assert.equal(second.houses['110']!['5']![10], 5);
  assert.equal(second.houses['110']!['7']![10], 5);
  assert.equal(second.houses['110']!['6'], undefined);

  const daily = readJson<DailyFile>(join(dir, 'daily/2026-11.json.gz'))!;
  assert.deepEqual(daily.days['2026-11-12']!['110']!['5'], [100, 100, 8, 5, 2]);

  const meta = readJson<Meta>(join(dir, 'meta.json'))!;
  assert.equal(meta.snapshots_saved, 2);
  assert.equal(meta.houses_provisional, true);
  assert.equal(meta.last_snapshot, '2026-11-12T11:05:00.000Z');
});

test('una respuesta con forma inesperada falla sin guardar nada', async () => {
  assert.throws(() => parseListings([{ id: 1, item: 5 }], 'Casa'), ShapeError);
  assert.throws(() => parseListings({}, 'Casa'), ShapeError);
  const dir = mkdtempSync(join(tmpdir(), 'collect-'));
  auctions110 = [{ id: 1, item: { id: 5 }, buyout: 'caro', quantity: 1, time_left: 'LONG' }];
  await assert.rejects(collect(dir), ShapeError);
  assert.equal(readJson(join(dir, 'meta.json')), null);
});

test('lee los niveles de receta del fichero de ForeverDB', () => {
  const lua = 'ns.recipes = {Leatherworking={{2881,"Light Leather",1,20,30,40,2318,1,"2934:3","a",0,0,0},' +
    '{1229432,"Camp Tent",0,20,22,25,279978,1,"2318:5","t",1,1,0},' +
    '{2163,"White \\"Leather\\" Jerkin",40,70,85,100,2311,1,"2318:8,2320:2,2324:1","i2407",0,0,0,1,3},' +
    '{9,"Otra para el mismo objeto",90,95,97,99,2311,1,"2318:1","t",0,0,1}}}';
  const rows = parseForeverDbRecipes(lua);
  assert.deepEqual(Object.keys(rows).sort(), ['2311', '2318', '279978']);
  assert.deepEqual(rows['2318'], { orange: 1, yellow: 20, green: 30, grey: 40, learn: 'a', isNew: false, classic: false });
  assert.equal(rows['279978']!.orange, null); // nivel de aprendizaje desconocido
  assert.equal(rows['279978']!.isNew, true);
  assert.equal(rows['2311']!.orange, 40); // gana la receta que se aprende antes
  assert.equal(rows['2311']!.learn, 'i2407');
});

test('lee los materiales de vendedor de ForeverDB: sin Horda, sin existencias limitadas, por unidad', () => {
  const lua = [
    'ns.npcs = {[1]={"Ana","Suministros",1429,41.7,67,"A",1},[2]={"Bo","Suministros",1637,1,2,"H",1},' +
      '[3]={"Cid","Suministros",1,1,1,"",0},[4]={"Dan","Raro",1,1,1,"A",1}}',
    'ns.sold = {[2320]={2,5,1,0,1,10,1,0},[3371]={1,20,5,0},[14341]={4,100,1,1},[2678]={3,8,1,0,2,1,1,0}}',
  ].join('\n');
  const v = parseForeverDbVendors(lua);
  assert.deepEqual(v['2320'], { price: 10, npc: 'Ana', seen: true });
  assert.equal(v['3371']!.price, 4); // 20c por 5 unidades
  assert.equal(v['14341'], undefined); // existencias limitadas
  assert.equal(v['2678']!.price, 8); // solo un vendedor neutral no visto en Forever
});
