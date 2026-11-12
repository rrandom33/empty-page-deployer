/**
 * Verificaciones de la sección 3.1 de SPEC.md contra la API real.
 * Solo lee. Escribe un informe en Markdown en la salida estándar y en el
 * resumen del trabajo de Actions. El repositorio es público: del personaje
 * se imprime únicamente la forma de la respuesta, nunca valores.
 */
import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { aggregateItem } from '../../engine/aggregate.ts';
import { formatCopper } from '../../engine/money.ts';
import type { Listing } from '../../engine/types.ts';
import { BlizzardClient, loadHousesConfig, parseHouseIndex, parseListings } from './blizzard.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const out: string[] = [];
const say = (line = '') => { out.push(line); console.log(line); };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Forma de un valor: claves y tipos, sin contenido. */
function shape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return depth > 5 ? 'array' : [`×${value.length}`, ...(value.length ? [shape(value[0], depth + 1)] : [])];
  if (isObj(value)) {
    if (depth > 5) return 'object';
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
  }
  return value === null ? 'null' : typeof value;
}

const count = (values: string[]) => {
  const c: Record<string, number> = {};
  for (const v of values) c[v] = (c[v] ?? 0) + 1;
  return c;
};

async function main(): Promise<void> {
  const config = loadHousesConfig(join(ROOT, 'config/houses.json'));
  const dyn = config.namespaces.dynamic;
  const items = (process.env.VERIFY_ITEMS || '2318,2934,2589,2319,4234')
    .split(',').map((s) => Number(s.trim())).filter((n) => n > 0);

  say(`# Verificación de la API — ${new Date().toISOString()}`);
  if (!process.env.BLIZZARD_CLIENT_ID || !process.env.BLIZZARD_CLIENT_SECRET) {
    say();
    say('No se ha podido verificar nada: faltan los secretos `BLIZZARD_CLIENT_ID` y `BLIZZARD_CLIENT_SECRET` en el repositorio.');
    console.log('::warning::Faltan los secretos de Blizzard; la verificación no se ha ejecutado.');
    return;
  }
  const client = new BlizzardClient(config.host);
  await client.authenticate();

  say('\n## Rulesets y casas');
  const rulesets = await client.get('/data/wow/ruleset/index', dyn);
  say('```json\n' + JSON.stringify(rulesets.body, null, 1).slice(0, 3000) + '\n```');
  const indexes: Record<string, string> = {};
  for (const id of [1, 2, 3, 15]) {
    try {
      const res = await client.get(`/data/wow/ruleset/${id}/auctions/`, dyn);
      if (id === 1) {
        const list = isObj(res.body) && Array.isArray(res.body.auctions) ? res.body.auctions : res.body;
        say('Forma del índice de casas (ruleset 1), dos primeras entradas:');
        say('```json\n' + JSON.stringify(Array.isArray(list) ? list.slice(0, 2) : list, null, 1).slice(0, 1500) + '\n```');
      }
      indexes[id] = res.status === 200
        ? parseHouseIndex(res.body).map((h) => `${h.id}:${h.name}`).join(' | ')
        : `respuesta ${res.status}`;
    } catch (err) { indexes[id] = `error: ${(err as Error).message}`; }
    say(`- Ruleset ${id}: ${indexes[id]}`);
  }
  say(`- ¿Mismo índice en todos los rulesets? ${new Set(Object.values(indexes)).size === 1 ? 'sí' : 'no'}`);

  const index = parseHouseIndex((await client.get(`/data/wow/ruleset/${config.ruleset}/auctions/`, dyn)).body);
  const wanted = Object.values(config.provisional.names);
  const houses = index.filter((h) => wanted.includes(h.name));

  say('\n## Casas de Alianza y Blackwater (verificaciones 1 a 5)');
  const idsByHouse = new Map<number, Set<number>>();
  let firstDetail = true;
  for (const house of houses) {
    const base = `/data/wow/ruleset/${config.ruleset}/auctions/${house.id}`;
    say(`\n### ${house.id} — ${house.name}`);
    try {
      const res = await client.get(base, dyn);
      if (!isObj(res.body)) { say(`Respuesta ${res.status} sin cuerpo.`); continue; }
      const body = res.body;
      const rawAuctions = Array.isArray(body.auctions) ? body.auctions : [];
      const sub = Array.isArray(body.commodities) ? null : await client.get(`${base}/commodities`, dyn);
      const rawCommodities = Array.isArray(body.commodities)
        ? body.commodities
        : isObj(sub?.body) && Array.isArray(sub.body.auctions) ? sub.body.auctions : [];

      if (firstDetail) {
        firstDetail = false;
        const headers = ['last-modified', 'etag', 'cache-control', 'date', 'content-encoding', 'age']
          .map((h) => `${h}: ${res.headers.get(h) ?? '—'}`).join('\n');
        say('Cabeceras de la casa:\n```\n' + headers + '\n```');
        say('Claves de la respuesta: `' + Object.keys(body).join(', ') + '`');
        say('`commodities` en la casa: `' + JSON.stringify(shape(body.commodities)) + '`; subrecurso `/commodities`: ' + (sub ? `respuesta ${sub.status}` : 'no consultado'));
        if (sub?.status === 200) say('Cabecera last-modified de `/commodities`: ' + (sub.headers.get('last-modified') ?? '—'));
        say('Ejemplos de anuncio normal:\n```json\n' + JSON.stringify(rawAuctions.slice(0, 3), null, 1) + '\n```');
        say('Ejemplos de material:\n```json\n' + JSON.stringify(rawCommodities.slice(0, 3), null, 1) + '\n```');
        const lm = res.headers.get('last-modified');
        if (lm) {
          const again = await client.get(base, dyn, { ifModifiedSince: lm });
          say(`If-Modified-Since con el mismo Last-Modified: respuesta ${again.status} (304 = se respeta).`);
        } else {
          say('Sin cabecera Last-Modified: la foto nueva se detecta por huella.');
        }
      }

      const auctions = parseListings(rawAuctions, 'anuncios');
      const commodities = parseListings(rawCommodities, 'materiales');
      const all: Listing[] = [...auctions, ...commodities];
      idsByHouse.set(house.id, new Set(all.map((l) => l.id)));
      say(`Anuncios normales: ${auctions.length}; materiales: ${commodities.length}; last-modified: ${res.headers.get('last-modified') ?? '—'}`);
      say('time_left: `' + JSON.stringify(count(all.map((l) => l.timeLeft))) + '`');
      const stacked = auctions.filter((l) => l.qty > 1).length;
      const withBuyout = auctions.filter((l) => l.unit > 0).length;
      say(`Anuncios normales con cantidad > 1: ${stacked}; con compra directa: ${withBuyout}`);

      say('\n| Objeto | Vía | Precio mínimo (valor crudo) | Como oro | Unidades | Anuncios |');
      say('|---|---|---|---|---|---|');
      for (const item of items) {
        for (const [via, list] of [['auctions', auctions], ['commodities', commodities]] as const) {
          const agg = aggregateItem(list.filter((l) => l.item === item));
          if (agg) say(`| ${item} | ${via} | ${agg.min} | ${formatCopper(agg.min)} | ${agg.qty} | ${agg.listings} |`);
        }
      }
    } catch (err) {
      say(`Error: ${(err as Error).message}`);
    }
  }

  say('\n### Solapamiento de anuncios entre casas (fracción de IDs compartidos)');
  const ids = [...idsByHouse.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = idsByHouse.get(ids[i]!)!, b = idsByHouse.get(ids[j]!)!;
      let shared = 0;
      for (const id of a) if (b.has(id)) shared++;
      if (shared > 0) say(`- ${ids[i]} y ${ids[j]}: ${(shared / Math.min(a.size, b.size) * 100).toFixed(1)}%`);
    }
  }
  say('- Las parejas no listadas no comparten ningún anuncio.');

  say('\n## Nombres de objeto (es_ES)');
  for (const item of items) {
    try {
      const res = await client.get(`/data/wow/item/${item}`, config.namespaces.static, { locale: 'es_ES' });
      const name = isObj(res.body) ? JSON.stringify(res.body.name) : '—';
      say(`- ${item}: respuesta ${res.status}, name = ${name}`);
    } catch (err) { say(`- ${item}: ${(err as Error).message}`); }
  }

  say('\n## Profesiones del personaje (verificación 6)');
  const slug = process.env.CHARACTER_SLUG;
  if (!slug) {
    say('Falta el secreto `CHARACTER_SLUG`: no verificado.');
  } else {
    try {
      const res = await client.get(`/profile/wow/character/${slug}/professions`, config.namespaces.profile);
      say(`Respuesta ${res.status}. Forma (sin valores):`);
      say('```json\n' + JSON.stringify(shape(res.body), null, 1) + '\n```');
    } catch (err) {
      say(`Error: ${(err as Error).message.replaceAll(slug, '<personaje>')}`);
    }
  }
}

main()
  .catch((err: Error) => {
    say(`\nError: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
  });
