import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { aggregateHouse } from '../../engine/aggregate.ts';
import { estimateSales } from '../../engine/sales.ts';
import type { AggregateOptions, Listing } from '../../engine/types.ts';
import { BlizzardClient, fetchHouse, loadHousesConfig, resolveHouses } from './blizzard.ts';
import type { HouseSnapshot } from './blizzard.ts';
import {
  DAILY_COLS, HOURLY_COLS, fromRows, hourlyRow, readJson, summarizeDay, toRows, writeJson,
} from './store.ts';
import type { DailyFile, HourlyFile, HourlySnap, Meta, SnapshotState } from './store.ts';

const ROOT = resolve(import.meta.dirname, '../..');
/** Por encima de este hueco entre fotos no se estiman ventas. */
const MAX_GAP_MIN = 150;

interface Thresholds {
  market: { cheapest_share: number; ladder_break: number };
  depth_steps: number[];
}

function setOutput(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** Huella de una foto: no depende del orden en que lleguen los anuncios. */
function snapshotHash(listings: readonly Listing[]): string {
  const keys = listings.map((l) => `${l.id}:${l.qty}`).sort();
  return createHash('sha256').update(keys.join(',')).digest('hex');
}

export async function collect(dataDir: string, now = new Date()): Promise<boolean> {
  const config = loadHousesConfig(join(ROOT, 'config/houses.json'));
  const thresholds = readJson<Thresholds>(join(ROOT, 'config/thresholds.json'))!;
  const options: AggregateOptions = {
    cheapestShare: thresholds.market.cheapest_share,
    ladderBreak: thresholds.market.ladder_break,
    depthSteps: thresholds.depth_steps,
  };
  const metaPath = join(dataDir, 'meta.json');
  const prevMeta = readJson<Meta>(metaPath);

  const client = new BlizzardClient(config.host);
  await client.authenticate();
  const houses = await resolveHouses(client, config);
  const first = houses[0]!;

  // ¿Hay foto nueva? Primero If-Modified-Since; si el servidor no lo respeta,
  // se compara la huella de los anuncios de la primera casa.
  const probe = await fetchHouse(client, config, first.id, prevMeta?.last_modified ?? undefined);
  if (!probe) {
    console.log('Sin foto nueva (304).');
    return false;
  }
  const hash = snapshotHash(probe.listings);
  if (prevMeta?.snapshot_hash === hash) {
    console.log('Sin foto nueva (misma huella).');
    return false;
  }

  const snapshots = new Map<number, HouseSnapshot>([[first.id, probe]]);
  for (const house of houses.slice(1)) {
    const snap = await fetchHouse(client, config, house.id);
    if (!snap) throw new Error(`Casa ${house.id}: 304 inesperado.`);
    snapshots.set(house.id, snap);
  }

  const headerDate = probe.lastModified ? new Date(probe.lastModified) : null;
  const when = headerDate && !Number.isNaN(headerDate.getTime()) ? headerDate : now;
  const t = when.toISOString();
  const date = t.slice(0, 10);

  const statePath = join(dataDir, 'state/last_snapshot.json.gz');
  const prevState = readJson<SnapshotState>(statePath);
  const gapMin = prevState ? Math.round((when.getTime() - Date.parse(prevState.t)) / 60000) : null;
  const comparable = gapMin !== null && gapMin > 0 && gapMin <= MAX_GAP_MIN;

  const snap: HourlySnap = { t, gap_min: gapMin, houses: {} };
  const state: SnapshotState = { t, houses: {} };
  const metaHouses: Meta['houses'] = [];
  for (const house of houses) {
    const { listings, counts } = snapshots.get(house.id)!;
    const prevRows = comparable ? prevState!.houses[house.id] : undefined;
    const sold = prevRows ? estimateSales(fromRows(prevRows), listings).sold : null;
    const rows: HourlySnap['houses'][string] = {};
    const aggregates = aggregateHouse(listings, options);
    for (const [item, agg] of aggregates) {
      rows[item] = hourlyRow(agg, sold ? (sold.get(item) ?? 0) : null);
    }
    snap.houses[house.id] = rows;
    state.houses[house.id] = toRows(listings);
    metaHouses.push({ ...house, listings: listings.length, items: aggregates.size });
    console.log(
      `Casa ${house.id} (${house.kind}): ${counts.auctions} anuncios, ${counts.commodities} materiales, ${aggregates.size} objetos.`,
    );
  }

  const hourlyPath = join(dataDir, `hourly/${date}.json.gz`);
  const hourly = readJson<HourlyFile>(hourlyPath) ?? { version: 1, date, cols: HOURLY_COLS, snaps: [] };
  hourly.snaps = hourly.snaps.filter((s) => s.t !== t);
  hourly.snaps.push(snap);
  hourly.snaps.sort((a, b) => a.t.localeCompare(b.t));
  writeJson(hourlyPath, hourly);

  const month = date.slice(0, 7);
  const dailyPath = join(dataDir, `daily/${month}.json.gz`);
  const daily = readJson<DailyFile>(dailyPath) ?? { version: 1, month, cols: DAILY_COLS, days: {} };
  daily.days[date] = summarizeDay(hourly);
  writeJson(dailyPath, daily);

  writeJson(statePath, state);

  const firstSnapshot = prevMeta?.first_snapshot ?? t;
  const meta: Meta = {
    version: 1,
    last_snapshot: t,
    first_snapshot: firstSnapshot,
    last_modified: probe.lastModified,
    snapshot_hash: hash,
    last_run: now.toISOString(),
    history_days: Math.round(((when.getTime() - Date.parse(firstSnapshot)) / 86_400_000) * 10) / 10,
    snapshots_saved: (prevMeta?.snapshots_saved ?? 0) + 1,
    houses: metaHouses,
    houses_provisional: config.houses.length === 0,
    sources: {
      ...prevMeta?.sources,
      blizzard_auctions: { ok: true, at: now.toISOString() },
    },
  };
  writeJson(metaPath, meta);
  console.log(`Foto ${t} guardada (${houses.length} casas).`);
  return true;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const dataDir = resolve(process.env.DATA_DIR ?? 'data-branch');
  collect(dataDir).then(
    (changed) => setOutput('changed', String(changed)),
    (err: Error) => {
      console.error(`::error::${err.message}`);
      process.exit(1);
    },
  );
}
