import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { median } from '../../engine/aggregate.ts';
import type { ItemAggregate, Listing } from '../../engine/types.ts';

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path);
  return JSON.parse((path.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')) as T;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const text = JSON.stringify(value);
  writeFileSync(path, path.endsWith('.gz') ? gzipSync(text, { level: 9 }) : text + '\n');
}

export interface Meta {
  version: 1;
  /** Hora de la última foto guardada (ISO, UTC). */
  last_snapshot: string | null;
  first_snapshot: string | null;
  last_modified: string | null;
  snapshot_hash: string | null;
  last_run: string;
  history_days: number;
  snapshots_saved: number;
  houses: { id: number; kind: string; name: string; listings: number; items: number }[];
  houses_provisional: boolean;
  sources: Record<string, { ok: boolean; at: string; detail?: string }>;
}

/** state/last_snapshot.json.gz: anuncios como tuplas [id, objeto, precio, cantidad, time_left]. */
export type ListingRow = [number, number, number, number, string];
export interface SnapshotState {
  t: string;
  houses: Record<string, ListingRow[]>;
}

export const toRows = (listings: readonly Listing[]): ListingRow[] =>
  listings.map((l) => [l.id, l.item, l.unit, l.qty, l.timeLeft]);
export const fromRows = (rows: readonly ListingRow[]): Listing[] =>
  rows.map(([id, item, unit, qty, timeLeft]) => ({ id, item, unit, qty, timeLeft }));

/**
 * hourly/AAAA-MM-DD.json.gz. Una entrada por foto; por casa, una fila por objeto
 * con las columnas de HOURLY_COLS. `sold` es null en la primera foto o tras un hueco.
 */
export const HOURLY_COLS = [
  'min', 'qty', 'listings', 'market', 'd0', 'd5', 'd20', 'd35', 'd50', 'next_gap', 'sold',
] as const;
export type HourlyRow = (number | null)[];
export interface HourlySnap {
  t: string;
  /** Minutos desde la foto anterior; null si no la había. */
  gap_min: number | null;
  houses: Record<string, Record<string, HourlyRow>>;
}
export interface HourlyFile {
  version: 1;
  date: string;
  cols: readonly string[];
  snaps: HourlySnap[];
}

export function hourlyRow(agg: ItemAggregate, sold: number | null): HourlyRow {
  return [agg.min, agg.qty, agg.listings, agg.market, ...agg.depth, agg.nextGap, sold];
}

/** daily/AAAA-MM.json.gz: por día y casa, una fila por objeto con DAILY_COLS. */
export const DAILY_COLS = ['min', 'market_median', 'qty_median', 'sold', 'snaps'] as const;
export interface DailyFile {
  version: 1;
  month: string;
  cols: readonly string[];
  days: Record<string, Record<string, Record<string, number[]>>>;
}

/** Resume un día a partir de su fichero horario. */
export function summarizeDay(hourly: HourlyFile): Record<string, Record<string, number[]>> {
  const acc = new Map<string, Map<string, { min: number; market: number[]; qty: number[]; sold: number; n: number }>>();
  for (const snap of hourly.snaps) {
    for (const [house, rows] of Object.entries(snap.houses)) {
      let items = acc.get(house);
      if (!items) acc.set(house, (items = new Map()));
      for (const [item, row] of Object.entries(rows)) {
        let a = items.get(item);
        if (!a) items.set(item, (a = { min: Infinity, market: [], qty: [], sold: 0, n: 0 }));
        a.min = Math.min(a.min, row[0]!);
        a.qty.push(row[1]!);
        a.market.push(row[3]!);
        a.sold += row[10] ?? 0;
        a.n++;
      }
    }
  }
  const out: Record<string, Record<string, number[]>> = {};
  for (const [house, items] of acc) {
    const rows: Record<string, number[]> = {};
    for (const [item, a] of items) {
      rows[item] = [a.min, Math.round(median(a.market)), Math.round(median(a.qty)), a.sold, a.n];
    }
    out[house] = rows;
  }
  return out;
}
