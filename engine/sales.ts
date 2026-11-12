import type { Listing } from './types.ts';

export interface SalesEstimate {
  /** Unidades vendidas (o canceladas) por objeto entre las dos fotos. */
  sold: Map<number, number>;
  /** Unidades caducadas por objeto; no cuentan como venta. */
  expired: Map<number, number>;
}

/**
 * Ventas estimadas comparando dos fotos consecutivas de una casa (sección 5.2).
 * No aplica el factor de prudencia: eso se hace al calcular `sold_per_day`.
 */
export function estimateSales(prev: readonly Listing[], curr: readonly Listing[]): SalesEstimate {
  const now = new Map<number, Listing>();
  for (const l of curr) now.set(l.id, l);

  const sold = new Map<number, number>();
  const expired = new Map<number, number>();
  const add = (map: Map<number, number>, item: number, n: number) =>
    map.set(item, (map.get(item) ?? 0) + n);

  for (const before of prev) {
    const after = now.get(before.id);
    if (!after) {
      add(before.timeLeft === 'SHORT' ? expired : sold, before.item, before.qty);
    } else if (after.qty < before.qty) {
      add(sold, before.item, before.qty - after.qty);
    }
  }
  return { sold, expired };
}
