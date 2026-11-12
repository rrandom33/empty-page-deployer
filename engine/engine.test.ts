import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateHouse, aggregateItem, median } from './aggregate.ts';
import { estimateSales } from './sales.ts';
import { formatCopper } from './money.ts';
import type { Listing } from './types.ts';

let nextId = 1;
const l = (unit: number, qty: number, extra: Partial<Listing> = {}): Listing => ({
  id: nextId++, item: 1, unit, qty, timeLeft: 'LONG', ...extra,
});

test('agregados básicos: mínimo, cantidad, anuncios y salto', () => {
  const agg = aggregateItem([l(120, 10), l(100, 5), l(100, 5), l(0, 99)])!;
  assert.equal(agg.min, 100);
  assert.equal(agg.qty, 20);
  assert.equal(agg.listings, 3);
  assert.equal(agg.nextGap, 1.2);
});

test('los anuncios solo con puja se ignoran; sin compra directa no hay agregado', () => {
  assert.equal(aggregateItem([l(0, 5)]), null);
});

test('market: media ponderada del 15% más barato de las unidades', () => {
  // 100 unidades → 15 unidades: 10 a 100 y 5 a 110.
  const agg = aggregateItem([l(100, 10), l(110, 20), l(130, 70)])!;
  assert.equal(agg.market, Math.round((10 * 100 + 5 * 110) / 15));
});

test('market: un anuncio aislado muy barato no arrastra más allá del salto de 1,5×', () => {
  // 1 unidad a 10 y el resto a 100: la escalera se corta tras la primera.
  const agg = aggregateItem([l(10, 1), l(100, 99)])!;
  assert.equal(agg.market, 10);
  assert.equal(agg.min, 10);
  assert.equal(agg.nextGap, 10);
});

test('depth: unidades acumuladas por escalón', () => {
  const agg = aggregateItem([l(100, 1), l(105, 2), l(120, 3), l(135, 4), l(150, 5), l(151, 6)])!;
  assert.deepEqual(agg.depth, [1, 3, 6, 10, 15]);
});

test('aggregateHouse agrupa por objeto', () => {
  const map = aggregateHouse([l(100, 1), l(50, 2, { item: 2 }), l(0, 1, { item: 3 })]);
  assert.deepEqual([...map.keys()].sort(), [1, 2]);
  assert.equal(map.get(2)!.min, 50);
});

test('ventas: desaparecido vende, SHORT caduca, menos cantidad vende la diferencia', () => {
  const prev = [
    l(100, 5, { id: 1001 }),
    l(100, 4, { id: 1002, timeLeft: 'SHORT' }),
    l(100, 10, { id: 1003 }),
    l(100, 7, { id: 1004 }),
  ];
  const curr = [l(100, 6, { id: 1003 }), l(100, 7, { id: 1004 }), l(100, 9, { id: 1005 })];
  const { sold, expired } = estimateSales(prev, curr);
  assert.equal(sold.get(1), 5 + 4);
  assert.equal(expired.get(1), 4);
});

test('mediana', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('formato de precios', () => {
  assert.equal(formatCopper(124050), '12o 40p 50c');
  assert.equal(formatCopper(120000), '12o');
  assert.equal(formatCopper(4000), '40p');
  assert.equal(formatCopper(0), '0c');
  assert.equal(formatCopper(100050), '10o 50c');
});
