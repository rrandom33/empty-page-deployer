import type { AggregateOptions, ItemAggregate, Listing } from './types.ts';
import { DEFAULT_AGGREGATE_OPTIONS } from './types.ts';

/**
 * Agregados de un objeto a partir de sus anuncios en una casa (sección 5.1).
 * Los anuncios sin compra directa (unit <= 0) se ignoran.
 * Devuelve null si no queda ningún anuncio con compra directa.
 */
export function aggregateItem(
  listings: readonly Listing[],
  options: AggregateOptions = DEFAULT_AGGREGATE_OPTIONS,
): ItemAggregate | null {
  const ladder = listings
    .filter((l) => l.unit > 0 && l.qty > 0)
    .sort((a, b) => a.unit - b.unit);
  const first = ladder[0];
  if (!first) return null;

  const min = first.unit;
  let qty = 0;
  for (const l of ladder) qty += l.qty;

  // Precio de mercado: media ponderada del tramo más barato, cortando la
  // escalera en el primer salto mayor que `ladderBreak`.
  const target = Math.max(1, Math.ceil(qty * options.cheapestShare));
  let taken = 0;
  let cost = 0;
  let prev = min;
  for (const l of ladder) {
    if (taken >= target) break;
    if (l.unit > prev * options.ladderBreak) break;
    const n = Math.min(l.qty, target - taken);
    taken += n;
    cost += n * l.unit;
    prev = l.unit;
  }
  const market = Math.round(cost / taken);

  const depth = options.depthSteps.map((step) => {
    const limit = min * step;
    let units = 0;
    for (const l of ladder) {
      if (l.unit > limit) break;
      units += l.qty;
    }
    return units;
  });

  const above = ladder.find((l) => l.unit > min);
  const nextGap = above ? round(above.unit / min, 3) : null;

  return { min, qty, listings: ladder.length, market, depth, nextGap };
}

/** Agrupa los anuncios de una casa por objeto y calcula sus agregados. */
export function aggregateHouse(
  listings: readonly Listing[],
  options: AggregateOptions = DEFAULT_AGGREGATE_OPTIONS,
): Map<number, ItemAggregate> {
  const byItem = new Map<number, Listing[]>();
  for (const l of listings) {
    const group = byItem.get(l.item);
    if (group) group.push(l);
    else byItem.set(l.item, [l]);
  }
  const out = new Map<number, ItemAggregate>();
  for (const [item, group] of byItem) {
    const agg = aggregateItem(group, options);
    if (agg) out.set(item, agg);
  }
  return out;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
