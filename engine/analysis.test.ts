import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  acquire, allocate, buildLadder, costOf, evaluateRecipe, findBargain, heatmap, itemStats, rollingMedian,
} from './analysis.ts';
import type { Economy, ItemStats, Ladder, Market, Point, Recipe, Thresholds } from './analysis.ts';

const th = JSON.parse(readFileSync(new URL('../config/thresholds.json', import.meta.url), 'utf8')) as Thresholds;
const eco: Economy = { cut: 0.05, depositRate: 0.6, depositMin: 1 };
const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 20, 12);

/** Serie horaria de `hours` horas que termina en NOW. */
const series = (hours: number, f: (i: number) => Partial<Point>): Point[] =>
  Array.from({ length: hours + 1 }, (_, i) => ({
    t: NOW - (hours - i) * H, min: 100, market: 100, qty: 1000, sold: 10, ...f(i),
  }));

const stats = (over: Partial<ItemStats> = {}): ItemStats => ({
  hours: 200, ref: 100, stability: 0.05, trend: 0, soldPerDay: 100, reliability: 'alta', signal: null, ...over,
});

function market(over: Partial<Market> & { ladders?: Record<number, Ladder> } = {}): Market {
  const ladders = over.ladders ?? {};
  return {
    ladder: (i) => ladders[i] ?? [],
    vendorPrice: () => null,
    recipesFor: () => [],
    vendorSell: () => 0,
    stats: () => stats(),
    marketPrice: () => null,
    listed: () => 0,
    ...over,
  };
}

test('escalera y coste real de comprar N unidades', () => {
  const ladder = buildLadder([{ unit: 10, qty: 5 }, { unit: 12, qty: 5 }, { unit: 10, qty: 5 }, { unit: 0, qty: 9 }]);
  assert.deepEqual(ladder, [[10, 10], [12, 5]]);
  assert.equal(costOf(ladder, 12), 10 * 10 + 2 * 12);
  assert.equal(costOf(ladder, 16), null);
});

test('con menos de 48 h de datos no hay fiabilidad ni señal', () => {
  const s = itemStats(series(30, () => ({})), NOW, th);
  assert.equal(s.reliability, 'sin_datos');
  assert.equal(s.signal, null);
  assert.equal(s.ref, 100);
});

test('fiabilidad alta: 72 h, estable y con ventas; ventas al día con prudencia', () => {
  const s = itemStats(series(100, () => ({})), NOW, th);
  assert.equal(s.reliability, 'alta');
  assert.equal(Math.round(s.soldPerDay!), Math.round(10 * 24 * 0.7));
});

test('fiabilidad baja si el precio es inestable', () => {
  const s = itemStats(series(100, (i) => ({ market: i % 2 ? 40 : 160 })), NOW, th);
  assert.equal(s.reliability, 'baja');
});

test('referencia: mediana de las últimas 72 h, no del histórico', () => {
  const s = itemStats(series(240, (i) => ({ market: i < 160 ? 300 : 100 })), NOW, th);
  assert.equal(s.ref, 100);
});

test('señal comprar en el cuartil barato de 7 días; esperar si el precio se desploma', () => {
  const flat = series(200, (i) => ({ min: i === 200 ? 80 : 100 + (i % 5) }));
  assert.equal(itemStats(flat, NOW, th).signal, 'comprar');
  const crash = series(200, (i) => ({ min: 400 - i * 1.8, market: 400 - i * 1.8 }));
  const s = itemStats(crash, NOW, th);
  assert.ok(s.trend! < -0.05);
  assert.equal(s.signal, 'esperar');
});

test('mediana móvil y mapa de calor', () => {
  const pts = series(200, (i) => ({ market: i }));
  const med = rollingMedian(pts, 72);
  assert.equal(med[200], 165); // mediana de 129..200, redondeada
  assert.equal(heatmap(series(100, () => ({})), NOW, th, () => ({ dow: 0, hour: 0 })), null);
  const hm = heatmap(pts, NOW, th, (t) => ({ dow: new Date(t).getUTCDay(), hour: new Date(t).getUTCHours() }))!;
  assert.equal(hm.length, 7);
  assert.equal(hm[0]!.length, 24);
});

test('ganga: descuento, aislamiento y tope del 25% de las ventas', () => {
  const ladder: Ladder = [[50, 10], [55, 30], [95, 500]];
  const b = findBargain(ladder, stats({ soldPerDay: 80 }), 10, eco, th)!;
  assert.equal(b.units, 20); // 40 baratas, tope 25% de 80
  assert.equal(b.avgCost, (10 * 50 + 10 * 55) / 20);
  assert.equal(b.nextPrice, 95);
  assert.ok(b.profitPerUnit > 0 && b.profitPerUnit <= 100 * 0.95 - b.avgCost);
});

test('no es ganga si todo el mercado ha bajado, si es poco fiable o si no hay salida', () => {
  assert.equal(findBargain([[50, 10], [60, 500]], stats(), 10, eco, th), null);
  assert.equal(findBargain([[50, 10], [95, 500]], stats({ reliability: 'baja' }), 10, eco, th), null);
  assert.equal(findBargain([[50, 10], [95, 500]], stats({ soldPerDay: 3 }), 10, eco, th), null);
  assert.equal(findBargain([[70, 10], [95, 500]], stats(), 10, eco, th), null);
});

// Tienda de campaña = 5 Cuero ligero (1); Cuero ligero = 3 Restos (2). Hilo (3) de vendedor.
const TENT: Recipe = { id: 10, item: 100, yield: 1, reagents: [[1, 5]] };
const LEATHER: Recipe = { id: 11, item: 1, yield: 1, reagents: [[2, 3]] };

test('ruta de material más barata: subasta, vendedor o fabricar', () => {
  const m = market({
    ladders: { 1: [[210, 10_000]], 2: [[60, 10_000]], 3: [[30, 100]] },
    vendorPrice: (i) => (i === 3 ? 10 : null),
    recipesFor: (i) => (i === 1 ? [LEATHER] : []),
  });
  const leather = acquire(m, 1, 5, 2)!;
  assert.equal(leather.route, 'fabricar'); // 3 × 60 = 180 < 210
  assert.equal(leather.unitCost, 180);
  assert.equal(leather.via, 11);
  assert.deepEqual(leather.alternatives.map((a) => a.route), ['fabricar', 'subasta']);
  assert.equal(acquire(m, 3, 5, 2)!.route, 'vendedor');
  assert.equal(acquire(m, 1, 5, 0)!.route, 'subasta'); // sin recursión
  assert.equal(acquire(m, 99, 1, 2), null);
});

test('receta: comisión, depósito, margen y precios límite', () => {
  const m = market({
    ladders: { 1: [[210, 100_000]] },
    marketPrice: (i) => (i === 100 ? 1800 : null),
    vendorSell: () => 100,
    listed: () => 64,
    stats: () => stats({ soldPerDay: 190 }),
  });
  const r = evaluateRecipe(TENT, m, eco, th)!;
  assert.equal(r.cost, 1050);
  assert.equal(r.netSale, 1800 * 0.95);
  assert.equal(r.units, 47); // 25% de 190
  // Se venden más al día de las que hay anunciadas: probabilidad de no vender 0.
  assert.equal(r.profitPerUnit, 1710 - 1050);
  assert.ok(Math.abs(r.margin! - 660 / 1050) < 1e-9);
  assert.equal(r.goldPerDay, 660 * 47);
  // Margen del 40%: 1710 / 1,4 / 5 unidades.
  assert.ok(Math.abs(r.buyBelow!.price - 1710 / 1.4 / 5) < 1e-9);
  assert.equal(r.buyBelow!.item, 1);
  assert.ok(Math.abs(r.stopBelow! - 1050 / 0.95) < 1e-9);
});

test('receta: el depósito pesa cuando el mercado está saturado', () => {
  const m = market({
    ladders: { 1: [[210, 100_000]] },
    marketPrice: () => 1800,
    vendorSell: () => 100,
    listed: () => 400,
    stats: () => stats({ soldPerDay: 100 }),
  });
  const r = evaluateRecipe(TENT, m, eco, th)!;
  const pNoSale = 1 - 100 / (400 + 25);
  assert.ok(Math.abs(r.profitPerUnit! - (1710 - 1050 - 60 * pNoSale)) < 1e-9);
});

test('receta: las unidades se limitan si el material se encarece más de un 10%', () => {
  const m = market({
    ladders: { 1: [[200, 50], [300, 100_000]] },
    marketPrice: () => 3000,
    stats: () => stats({ soldPerDay: 1000 }),
  });
  const r = evaluateRecipe(TENT, m, eco, th)!;
  // 10 tiendas agotan el cuero a 200; a partir de ahí el coste medio sube.
  assert.ok(r.units >= 10 && r.units < 250, `unidades: ${r.units}`);
  assert.ok(r.cost <= 1000 * 1.1 + 1e-9);
  assert.equal(r.unitsDepthCap, r.units);
});

test('receta sin datos de ventas: se calcula el coste pero no el oro al día', () => {
  const m = market({ ladders: { 1: [[210, 1000]] }, marketPrice: () => 1800, stats: () => undefined });
  const r = evaluateRecipe(TENT, m, eco, th)!;
  assert.equal(r.units, 0);
  assert.equal(r.goldPerDay, null);
  assert.equal(r.cost, 1050);
  assert.equal(evaluateRecipe(TENT, market(), eco, th), null);
});

test('reparto del oro por orden de rendimiento y sin pasar de las unidades recomendadas', () => {
  const plan = allocate(
    [
      { unitInvest: 1000, unitProfit: 600, maxUnits: 40, soldPerDay: 190 },
      { unitInvest: 600, unitProfit: 300, maxUnits: 60, soldPerDay: 30 },
      { unitInvest: 50_000, unitProfit: 9000, maxUnits: 5, soldPerDay: 10 },
      { unitInvest: 100, unitProfit: 10, maxUnits: 5, soldPerDay: 10 },
    ],
    60_000,
    5,
  );
  assert.deepEqual(plan.map((p) => [p.index, p.units]), [[0, 40], [1, 33], [3, 2]]);
  assert.equal(plan[0]!.goldPerDay, 24_000);
  assert.equal(plan[1]!.goldPerDay, (33 * 300) / (33 / 30));
});
