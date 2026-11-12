import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect } from './main.ts';
import { parseListings, ShapeError } from './blizzard.ts';
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
