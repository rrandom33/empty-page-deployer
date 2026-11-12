/**
 * Cálculo de las secciones 5.2 a 5.8 de SPEC.md. Funciones puras.
 * Precios en cobre y por unidad; tiempos en milisegundos desde epoch.
 */
import { median } from './aggregate.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Una observación horaria de un objeto en una casa. */
export interface Point {
  t: number;
  min: number;
  market: number;
  qty: number;
  /** Unidades vendidas desde la foto anterior; null si no se pudo estimar. */
  sold: number | null;
}

export type Reliability = 'alta' | 'media' | 'baja' | 'sin_datos';
export type Signal = 'comprar' | 'esperar' | 'vender' | null;

export interface Thresholds {
  sales: { window_days: number; prudence: number; min_hours: number };
  reference: { window_hours: number; min_hours_for_signals: number; trend_days: number };
  reliability: {
    high: { min_hours: number; max_stability: number; min_sold_per_day: number };
    medium: { min_hours: number; max_stability: number; min_sold_per_day: number };
  };
  bargain: {
    max_price_vs_ref: number;
    next_price_min_vs_ref: number;
    min_sold_per_day: number;
    buy_below_vs_ref: number;
    max_share_of_daily_sales: number;
  };
  recipe: {
    max_depth: number;
    max_share_of_daily_sales: number;
    max_material_cost_increase: number;
    target_margin: number;
  };
  buy_timing: { min_days: number; max_drop_per_day: number; quartile: number };
}

export interface Economy {
  cut: number;
  /** Fracción del precio de venta al vendedor que se paga de depósito a 24 h. */
  depositRate: number;
  depositMin: number;
}

export interface ItemStats {
  /** Horas entre la primera observación y la última. */
  hours: number;
  ref: number | null;
  stability: number | null;
  /** Pendiente de la mediana diaria, en fracción por día (−0,05 = −5% al día). */
  trend: number | null;
  soldPerDay: number | null;
  reliability: Reliability;
  signal: Signal;
}

// ---------------------------------------------------------------- escalera

/** Escalera de precios: [precio, unidades], ordenada de menor a mayor precio. */
export type Ladder = [number, number][];

export function buildLadder(listings: readonly { unit: number; qty: number }[]): Ladder {
  const byPrice = new Map<number, number>();
  for (const l of listings) {
    if (l.unit > 0 && l.qty > 0) byPrice.set(l.unit, (byPrice.get(l.unit) ?? 0) + l.qty);
  }
  return [...byPrice.entries()].sort((a, b) => a[0] - b[0]);
}

/** Coste total de comprar `n` unidades empezando por las más baratas; null si no hay tantas. */
export function costOf(ladder: Ladder, n: number): number | null {
  let left = n;
  let cost = 0;
  for (const [price, qty] of ladder) {
    const take = Math.min(qty, left);
    cost += take * price;
    left -= take;
    if (left <= 0) return cost;
  }
  return n <= 0 ? 0 : null;
}

export function unitsAtOrBelow(ladder: Ladder, price: number): number {
  let units = 0;
  for (const [p, qty] of ladder) {
    if (p > price) break;
    units += qty;
  }
  return units;
}

// ------------------------------------------------------------ estadísticas

function mad(values: readonly number[], center: number): number {
  return median(values.map((v) => Math.abs(v - center)));
}

/** Mediana de `market` por día natural (UTC), de más antiguo a más reciente. */
function dailyMedians(points: readonly Point[]): { day: number; value: number }[] {
  const byDay = new Map<number, number[]>();
  for (const p of points) {
    const day = Math.floor(p.t / DAY);
    const list = byDay.get(day);
    if (list) list.push(p.market);
    else byDay.set(day, [p.market]);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, v]) => ({ day, value: median(v) }));
}

/** Pendiente por mínimos cuadrados de la mediana diaria, relativa a su media. */
export function trendPerDay(points: readonly Point[], now: number, days: number): number | null {
  const daily = dailyMedians(points.filter((p) => p.t > now - days * DAY));
  if (daily.length < 3) return null;
  const n = daily.length;
  const mx = daily.reduce((s, d) => s + d.day, 0) / n;
  const my = daily.reduce((s, d) => s + d.value, 0) / n;
  let num = 0;
  let den = 0;
  for (const d of daily) {
    num += (d.day - mx) * (d.value - my);
    den += (d.day - mx) ** 2;
  }
  return den === 0 || my === 0 ? null : num / den / my;
}

/**
 * Ventas al día: media de la ventana, con el factor de prudencia aplicado.
 * Solo cuentan las horas en que se pudo estimar (`sold` no nulo).
 */
export function soldPerDay(points: readonly Point[], now: number, th: Thresholds): number | null {
  let units = 0;
  let hours = 0;
  let prev: Point | undefined;
  for (const p of points) {
    if (p.t > now - th.sales.window_days * DAY && p.sold !== null) {
      units += p.sold;
      hours += prev ? Math.min(3, (p.t - prev.t) / HOUR) : 1;
    }
    prev = p;
  }
  if (hours < th.sales.min_hours) return null;
  return (units / hours) * 24 * th.sales.prudence;
}

export function itemStats(points: readonly Point[], now: number, th: Thresholds): ItemStats {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return { hours: 0, ref: null, stability: null, trend: null, soldPerDay: null, reliability: 'sin_datos', signal: null };
  }
  const hours = (last.t - first.t) / HOUR;
  const recent = points.filter((p) => p.t > now - th.reference.window_hours * HOUR).map((p) => p.market);
  const ref = recent.length ? median(recent) : null;
  const stability = ref && recent.length >= 3 ? mad(recent, ref) / ref : null;
  const trend = trendPerDay(points, now, th.reference.trend_days);
  const sold = soldPerDay(points, now, th);

  let reliability: Reliability = 'sin_datos';
  if (hours >= th.reference.min_hours_for_signals && ref !== null && stability !== null) {
    const fits = (r: { min_hours: number; max_stability: number; min_sold_per_day: number }) =>
      hours >= r.min_hours && stability <= r.max_stability && (sold ?? 0) >= r.min_sold_per_day;
    reliability = fits(th.reliability.high) ? 'alta' : fits(th.reliability.medium) ? 'media' : 'baja';
  }

  // Señal de la sección 5.6: cuartil barato de los últimos 7 días y sin desplome.
  let signal: Signal = null;
  const week = points.filter((p) => p.t > now - 7 * DAY).map((p) => p.min).sort((a, b) => a - b);
  if (reliability !== 'sin_datos' && hours >= th.buy_timing.min_days * 24 && week.length >= 8) {
    const q = th.buy_timing.quartile;
    const low = week[Math.floor((week.length - 1) * q)]!;
    const high = week[Math.ceil((week.length - 1) * (1 - q))]!;
    if (trend !== null && trend < th.buy_timing.max_drop_per_day) signal = 'esperar';
    else if (last.min <= low && low < high) signal = 'comprar';
    else if (last.min >= high && low < high) signal = 'vender';
    else signal = 'esperar';
  }
  return { hours, ref, stability, trend, soldPerDay: sold, reliability, signal };
}

/** Mediana móvil de `market` en la ventana anterior a cada punto. */
export function rollingMedian(points: readonly Point[], windowHours: number): number[] {
  const out: number[] = [];
  let start = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    while (points[start]!.t <= p.t - windowHours * HOUR) start++;
    const win: number[] = [];
    for (let j = start; j <= i; j++) win.push(points[j]!.market);
    out.push(Math.round(median(win)));
  }
  return out;
}

/**
 * Mapa de calor de la sección 5.6: mediana de `market` por día de la semana y hora
 * (en la zona horaria indicada por `offsetHours`), relativa a la mediana semanal.
 * Filas de lunes a domingo; null en las franjas sin datos. Null si faltan días.
 */
export function heatmap(
  points: readonly Point[],
  now: number,
  th: Thresholds,
  hourOf: (t: number) => { dow: number; hour: number },
): (number | null)[][] | null {
  const first = points[0];
  if (!first || now - first.t < th.buy_timing.min_days * DAY) return null;
  const all = points.map((p) => p.market);
  const base = median(all);
  if (!base) return null;
  const cells: number[][][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));
  for (const p of points) {
    const { dow, hour } = hourOf(p.t);
    cells[dow]![hour]!.push(p.market);
  }
  return cells.map((row) => row.map((c) => (c.length ? Math.round((median(c) / base) * 1000) / 1000 : null)));
}

// ------------------------------------------------------------------ ganga

export interface Bargain {
  units: number;
  /** Coste medio por unidad de las unidades a comprar. */
  avgCost: number;
  /** Precio del siguiente anuncio tras comprar las unidades baratas. */
  nextPrice: number | null;
  discount: number;
  profitPerUnit: number;
  profit: number;
}

/** Sección 5.4. Devuelve null si el objeto no cumple las cuatro condiciones. */
export function findBargain(
  ladder: Ladder,
  stats: ItemStats,
  vendorSell: number,
  eco: Economy,
  th: Thresholds,
): Bargain | null {
  const b = th.bargain;
  const cheapest = ladder[0];
  const { ref, soldPerDay: sold } = stats;
  if (!cheapest || ref === null || sold === null) return null;
  if (cheapest[0] > ref * b.max_price_vs_ref) return null;
  if (stats.reliability !== 'alta' && stats.reliability !== 'media') return null;
  if (sold < b.min_sold_per_day) return null;

  const cheapUnits = unitsAtOrBelow(ladder, ref * b.buy_below_vs_ref);
  const next = ladder.find(([p]) => p > ref * b.buy_below_vs_ref)?.[0] ?? null;
  // Aislamiento: si lo siguiente también está barato, o no queda nada más caro que
  // confirme la referencia, es el mercado el que ha bajado.
  if (next === null || next < ref * b.next_price_min_vs_ref) return null;

  const units = Math.min(cheapUnits, Math.floor(sold * b.max_share_of_daily_sales));
  if (units < 1) return null;
  const avgCost = costOf(ladder, units)! / units;
  const pNoSale = Math.max(0, 1 - sold / (unitsAtOrBelow(ladder, ref) + units));
  const profitPerUnit = ref * (1 - eco.cut) - avgCost - deposit(vendorSell, eco) * pNoSale;
  if (profitPerUnit <= 0) return null;
  return {
    units,
    avgCost,
    nextPrice: next,
    discount: 1 - cheapest[0] / ref,
    profitPerUnit,
    profit: profitPerUnit * units,
  };
}

export function deposit(vendorSell: number, eco: Economy): number {
  return Math.max(eco.depositMin, vendorSell * eco.depositRate);
}

// ----------------------------------------------------------------- receta

export interface Recipe {
  id: number;
  item: number;
  /** Unidades que salen de cada fabricación. */
  yield: number;
  reagents: [number, number][];
}

export interface Market {
  ladder(item: number): Ladder;
  /** Precio de compra al vendedor, o null si no lo vende. */
  vendorPrice(item: number): number | null;
  /** Recetas utilizables que producen el objeto. */
  recipesFor(item: number): Recipe[];
  /** Precio de venta al vendedor del objeto (base del depósito). */
  vendorSell(item: number): number;
  stats(item: number): ItemStats | undefined;
  /** `market` actual del objeto, o null si no hay anuncios. */
  marketPrice(item: number): number | null;
  /** Unidades anunciadas ahora. */
  listed(item: number): number;
}

export type Route = 'subasta' | 'vendedor' | 'fabricar';
export interface MaterialCost {
  item: number;
  /** Unidades por fabricación. */
  qty: number;
  route: Route;
  /** Coste por unidad de material por la ruta elegida. */
  unitCost: number;
  /** Coste por unidad de las rutas alternativas disponibles. */
  alternatives: { route: Route; unitCost: number; via?: number }[];
  via?: number;
}

/**
 * Coste por unidad de conseguir `units` unidades de un objeto por la ruta más barata.
 * `depth` limita la recursión por recetas intermedias.
 */
export function acquire(
  market: Market,
  item: number,
  units: number,
  depth: number,
  seen: ReadonlySet<number> = new Set(),
): { route: Route; unitCost: number; via?: number; alternatives: MaterialCost['alternatives'] } | null {
  const options: MaterialCost['alternatives'] = [];
  const total = costOf(market.ladder(item), units);
  if (total !== null && units > 0) options.push({ route: 'subasta', unitCost: total / units });
  const vendor = market.vendorPrice(item);
  if (vendor !== null) options.push({ route: 'vendedor', unitCost: vendor });
  if (depth > 0 && !seen.has(item)) {
    const nextSeen = new Set(seen).add(item);
    for (const recipe of market.recipesFor(item)) {
      const crafts = Math.ceil(units / recipe.yield);
      let cost = 0;
      let ok = true;
      for (const [reagent, qty] of recipe.reagents) {
        const sub = acquire(market, reagent, qty * crafts, depth - 1, nextSeen);
        if (!sub) { ok = false; break; }
        cost += sub.unitCost * qty * crafts;
      }
      if (ok) options.push({ route: 'fabricar', unitCost: cost / (crafts * recipe.yield), via: recipe.id });
    }
  }
  options.sort((a, b) => a.unitCost - b.unitCost);
  const best = options[0];
  return best ? { ...best, alternatives: options } : null;
}

export interface RecipeResult {
  /** Coste de materiales por unidad fabricada, a las unidades recomendadas. */
  cost: number;
  materials: MaterialCost[];
  /** Precio de venta por unidad (`market`). */
  sale: number | null;
  netSale: number | null;
  profitPerUnit: number | null;
  /** Beneficio dividido entre el coste de materiales. */
  margin: number | null;
  soldPerDay: number | null;
  /** Unidades recomendadas sin contar el oro disponible. */
  units: number;
  /** Tope por profundidad del material: fabricar más sube su coste por encima del límite. */
  unitsDepthCap: number;
  daysToSell: number | null;
  goldPerDay: number | null;
  /** Material principal y precio por debajo del cual la receta deja el margen objetivo. */
  buyBelow: { item: number; price: number } | null;
  /** Precio de venta con el que el beneficio es cero. */
  stopBelow: number | null;
  reliability: Reliability;
}

/** Sección 5.5. Devuelve null si algún material no se puede conseguir. */
export function evaluateRecipe(recipe: Recipe, market: Market, eco: Economy, th: Thresholds): RecipeResult | null {
  const r = th.recipe;
  const costAt = (crafts: number) => {
    const materials: MaterialCost[] = [];
    let total = 0;
    for (const [item, qty] of recipe.reagents) {
      const got = acquire(market, item, qty * crafts, r.max_depth - 1, new Set([recipe.item]));
      if (!got) return null;
      materials.push({ item, qty, route: got.route, unitCost: got.unitCost, alternatives: got.alternatives, via: got.via });
      total += got.unitCost * qty;
    }
    return { cost: total / recipe.yield, materials };
  };

  const base = costAt(1);
  if (!base) return null;
  const stats = market.stats(recipe.item);
  const sold = stats?.soldPerDay ?? null;

  // Unidades: el 25% de las ventas diarias, sin que el material suba más del límite.
  const bySales = sold === null ? 0 : Math.floor(sold * r.max_share_of_daily_sales);
  const limit = base.cost * (1 + r.max_material_cost_increase);
  const fits = (units: number) => {
    const c = costAt(Math.ceil(units / recipe.yield));
    return c !== null && c.cost <= limit;
  };
  // Búsqueda del mayor número de unidades que no encarece el material (tope 100.000).
  let lo = recipe.yield;
  let hi = recipe.yield;
  while (hi < 100_000 && fits(hi * 2)) hi *= 2;
  if (hi < 100_000) {
    lo = hi;
    hi = hi * 2;
    while (hi - lo > recipe.yield) {
      const mid = Math.floor((lo + hi) / 2 / recipe.yield) * recipe.yield;
      if (mid === lo) break;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
  } else lo = hi;
  const unitsDepthCap = lo;
  const units = Math.min(bySales, unitsDepthCap);

  const at = (units > 0 ? costAt(Math.ceil(units / recipe.yield)) : null) ?? base;
  const sale = market.marketPrice(recipe.item);
  const dep = deposit(market.vendorSell(recipe.item), eco);
  let netSale: number | null = null;
  let profitPerUnit: number | null = null;
  let margin: number | null = null;
  let stopBelow: number | null = null;
  let buyBelow: RecipeResult['buyBelow'] = null;
  let daysToSell: number | null = null;
  let goldPerDay: number | null = null;
  const pNoSale = sold === null ? 1 : Math.max(0, 1 - sold / (market.listed(recipe.item) + Math.max(units, 1)));
  if (sale !== null) {
    netSale = sale * (1 - eco.cut);
    profitPerUnit = netSale - at.cost - dep * pNoSale;
    margin = at.cost > 0 ? profitPerUnit / at.cost : null;
    const main = [...at.materials].sort((a, b) => b.unitCost * b.qty - a.unitCost * a.qty)[0];
    if (main) {
      const others = at.cost * recipe.yield - main.unitCost * main.qty;
      const price = (((netSale - dep * pNoSale) * recipe.yield) / (1 + r.target_margin) - others) / main.qty;
      if (price > 0) buyBelow = { item: main.item, price };
    }
    if (sold !== null && sold > 0 && units > 0) {
      daysToSell = units / sold;
      goldPerDay = (profitPerUnit * units) / Math.max(1, daysToSell);
    }
  }
  stopBelow = (at.cost + dep * pNoSale) / (1 - eco.cut);
  return {
    cost: at.cost,
    materials: at.materials,
    sale,
    netSale,
    profitPerUnit,
    margin,
    soldPerDay: sold,
    units,
    unitsDepthCap,
    daysToSell,
    goldPerDay,
    buyBelow,
    stopBelow,
    reliability: stats?.reliability ?? 'sin_datos',
  };
}

// -------------------------------------------------------------------- hoy

export interface Action {
  /** Oro que cuesta cada unidad. */
  unitInvest: number;
  unitProfit: number;
  maxUnits: number;
  /** Ventas al día del objeto que se vende, para calcular el plazo. */
  soldPerDay: number;
}

export interface Allocation { index: number; units: number; invest: number; profit: number; days: number; goldPerDay: number }

/**
 * Sección 5.7: reparte el oro entre las acciones, ya ordenadas de mayor a menor
 * rendimiento, sin pasar de las unidades recomendadas de cada una.
 */
export function allocate(actions: readonly Action[], gold: number, maxActions: number): Allocation[] {
  const out: Allocation[] = [];
  let left = gold;
  actions.forEach((a, index) => {
    if (out.length >= maxActions || a.unitInvest <= 0) return;
    const units = Math.min(a.maxUnits, Math.floor(left / a.unitInvest));
    if (units < 1) return;
    const invest = units * a.unitInvest;
    const profit = units * a.unitProfit;
    const days = a.soldPerDay > 0 ? units / a.soldPerDay : Infinity;
    left -= invest;
    out.push({ index, units, invest, profit, days, goldPerDay: profit / Math.max(1, days) });
  });
  return out;
}
