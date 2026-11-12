/**
 * Calcula los datos que publica la web a partir de la rama data:
 * latest.json, recipes.json, today.json e items/{id}.json (sección 4.3).
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildLadder, costOf, evaluateRecipe, findBargain, heatmap, itemStats, rollingMedian, unitsAtOrBelow,
} from '../../engine/analysis.ts';
import type { Economy, ItemStats, Ladder, Market, Point, Recipe, RecipeResult, Thresholds } from '../../engine/analysis.ts';
import { median } from '../../engine/aggregate.ts';
import type { CharacterFile, ItemsFile, RecipeEntry, RecipesFile, SkillsFile, VendorsFile } from './catalog.ts';
import type { HousesConfig } from './blizzard.ts';
import { readJson, writeJson } from './store.ts';
import type { HourlyFile, Meta, SnapshotState } from './store.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const HOUR = 3_600_000;
const round = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d;

const REL = { sin_datos: 0, baja: 1, media: 2, alta: 3 } as const;
const SIG = { comprar: 1, esperar: 2, vender: 3 } as const;

/** Día de la semana (0 = lunes) y hora en la zona horaria del jugador. */
function localHour(zone: string): (t: number) => { dow: number; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (t) => {
    const parts = fmt.formatToParts(t);
    return {
      dow: days.indexOf(parts.find((p) => p.type === 'weekday')!.value),
      hour: Number(parts.find((p) => p.type === 'hour')!.value) % 24,
    };
  };
}

/** Reduce una serie a `buckets` puntos con la mediana de cada tramo. */
function spark(points: readonly Point[], now: number, days: number, buckets: number): number[] {
  const from = now - days * 24 * HOUR;
  const groups: number[][] = Array.from({ length: buckets }, () => []);
  for (const p of points) {
    if (p.t <= from) continue;
    const i = Math.min(buckets - 1, Math.floor(((p.t - from) / (now - from)) * buckets));
    groups[i]!.push(p.min);
  }
  return groups.filter((g) => g.length).map((g) => Math.round(median(g)));
}

export function derive(dataDir: string, outDir: string): void {
  const config = readJson<HousesConfig>(join(ROOT, 'config/houses.json'))!;
  const th = readJson<Thresholds & { today: { max_actions: number; min_sold_per_day: number } }>(join(ROOT, 'config/thresholds.json'))!;
  const ecoFile = readJson<{ cut: Record<string, number>; deposit: { rate_by_hours: Record<string, number>; min_copper: number } }>(
    join(ROOT, 'config/economy.json'),
  )!;
  const eco: Economy = {
    cut: ecoFile.cut.alliance!,
    depositRate: ecoFile.deposit.rate_by_hours['24']!,
    depositMin: ecoFile.deposit.min_copper,
  };
  const meta = readJson<Meta>(join(dataDir, 'meta.json'));
  const alliance = config.houses.find((h) => h.kind === 'alliance');
  if (!alliance) throw new Error('config/houses.json no fija la casa de Alianza.');
  const bwFixed = config.houses.filter((h) => h.kind === 'blackwater');
  const bw = bwFixed.length === 1 ? String(bwFixed[0]!.id) : null;
  const house = String(alliance.id);

  // Historial: una serie por objeto, a partir de los ficheros horarios.
  const series = new Map<number, Point[]>();
  const snapshots: number[] = [];
  let lastBw: Record<string, (number | null)[]> = {};
  const hourlyDir = join(dataDir, 'hourly');
  const files = existsSync(hourlyDir) ? readdirSync(hourlyDir).filter((f) => f.endsWith('.json.gz')).sort() : [];
  for (const file of files) {
    const hourly = readJson<HourlyFile>(join(hourlyDir, file))!;
    for (const snap of hourly.snaps) {
      const rows = snap.houses[house];
      if (!rows) continue;
      const t = Date.parse(snap.t);
      snapshots.push(t);
      for (const [id, row] of Object.entries(rows)) {
        const point: Point = { t, min: row[0]!, market: row[3]!, qty: row[1]!, sold: row[10] ?? null };
        const list = series.get(Number(id));
        if (list) list.push(point);
        else series.set(Number(id), [point]);
      }
      if (bw) lastBw = snap.houses[bw] ?? {};
    }
  }
  const now = snapshots[snapshots.length - 1];
  if (now === undefined) throw new Error('No hay ninguna foto guardada todavía.');
  const historyHours = (now - snapshots[0]!) / HOUR;

  // Escaleras de la última foto.
  const state = readJson<SnapshotState>(join(dataDir, 'state/last_snapshot.json.gz'));
  const byItem = new Map<number, { unit: number; qty: number }[]>();
  for (const [, item, unit, qty] of state?.houses[house] ?? []) {
    const list = byItem.get(item);
    if (list) list.push({ unit, qty });
    else byItem.set(item, [{ unit, qty }]);
  }
  const ladders = new Map<number, Ladder>();
  for (const [item, list] of byItem) ladders.set(item, buildLadder(list));

  const catalog = readJson<ItemsFile>(join(dataDir, 'catalog/items.json'))?.items ?? {};
  const recipesFile = readJson<RecipesFile>(join(dataDir, 'catalog/recipes.json'));
  const vendors = readJson<VendorsFile>(join(dataDir, 'catalog/vendors.json'))?.items ?? {};
  const character = readJson<CharacterFile>(join(dataDir, 'catalog/character.json'));
  const known = character ? new Set(character.known) : null;
  const skills = readJson<SkillsFile>(join(dataDir, 'catalog/skills.json'));
  /** Nivel que pide la receta: el de aprendizaje o, si no se conoce, el nivel en que pasa a amarilla. */
  const skillOf = (r: RecipeEntry) => {
    const row = skills?.byItem[r.item];
    return row ? { level: row.orange ?? row.yellow, exact: row.orange !== null, row } : null;
  };

  const stats = new Map<number, ItemStats>();
  const current = new Map<number, Point>();
  for (const [id, points] of series) {
    stats.set(id, itemStats(points, now, th));
    const last = points[points.length - 1]!;
    if (last.t === now) current.set(id, last);
  }

  // ------------------------------------------------------------- recetas
  const allRecipes: RecipeEntry[] = recipesFile?.recipes ?? [];
  const usable = known ? allRecipes.filter((r) => known.has(r.id)) : allRecipes;
  const producers = new Map<number, Recipe[]>();
  for (const r of usable) {
    const list = producers.get(r.item);
    if (list) list.push(r);
    else producers.set(r.item, [r]);
  }
  const market: Market = {
    ladder: (i) => ladders.get(i) ?? [],
    vendorPrice: (i) => vendors[i] ?? null,
    recipesFor: (i) => producers.get(i) ?? [],
    vendorSell: (i) => catalog[i]?.[4] ?? 0,
    stats: (i) => stats.get(i),
    marketPrice: (i) => current.get(i)?.market ?? null,
    listed: (i) => current.get(i)?.qty ?? 0,
  };
  const results = new Map<number, RecipeResult>();
  for (const r of allRecipes) {
    const res = evaluateRecipe(r, market, eco, th);
    if (res) results.set(r.id, res);
  }

  const usedIn = new Map<number, number[]>();
  const madeBy = new Map<number, number[]>();
  const push = (map: Map<number, number[]>, key: number, value: number) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const r of allRecipes) {
    push(madeBy, r.item, r.id);
    for (const [item] of r.reagents) push(usedIn, item, r.id);
  }
  /** Mejor precio de compra de un material: el de la receta que más oro al día deja. */
  const buyBelow = new Map<number, { price: number; recipe: number; gpd: number }>();
  for (const [id, res] of results) {
    if (!res.buyBelow || (known && !known.has(id))) continue;
    const gpd = res.goldPerDay ?? 0;
    const prev = buyBelow.get(res.buyBelow.item);
    if (!prev || gpd > prev.gpd) buyBelow.set(res.buyBelow.item, { price: res.buyBelow.price, recipe: id, gpd });
  }

  const names: Record<string, string> = {};
  const name = (id: number) => {
    const n = catalog[id]?.[0];
    if (n) names[id] = n;
  };

  const recipesOut = allRecipes.map((r) => {
    const res = results.get(r.id);
    name(r.item);
    for (const [item] of r.reagents) name(item);
    const pattern = /^i(\d+)$/.exec(skillOf(r)?.row.learn ?? '');
    if (pattern) name(Number(pattern[1]));
    return {
      id: r.id, name: r.name, prof: r.prof, cat: r.cat, item: r.item, yield: r.yield, reagents: r.reagents,
      known: known ? known.has(r.id) : null,
      skill: skillOf(r)?.level ?? null,
      skillExact: skillOf(r)?.exact ?? false,
      learn: skillOf(r)?.row.learn ?? null,
      isNew: skillOf(r)?.row.isNew ?? false,
      listed: market.listed(r.item),
      ...(res && {
        cost: round(res.cost, 1),
        mats: res.materials.map((m) => ({
          item: m.item, qty: m.qty, route: m.route, unit: round(m.unitCost, 1), via: m.via,
          alts: m.alternatives.map((a) => ({ route: a.route, unit: round(a.unitCost, 1), via: a.via })),
        })),
        sale: res.sale, net: round(res.netSale, 1), profit: round(res.profitPerUnit, 1), margin: round(res.margin, 3),
        sold: round(res.soldPerDay, 1), units: res.units, cap: res.unitsDepthCap, days: round(res.daysToSell, 2),
        gpd: round(res.goldPerDay), buyBelow: res.buyBelow && { item: res.buyBelow.item, price: round(res.buyBelow.price) },
        stopBelow: round(res.stopBelow), rel: REL[res.reliability],
      }),
    };
  });

  // -------------------------------------------------------------- objetos
  rmSync(join(outDir, 'items'), { recursive: true, force: true });
  mkdirSync(join(outDir, 'items'), { recursive: true });
  const hourOf = localHour('Europe/Madrid');
  const latestRows: unknown[] = [];
  const actions: Record<string, unknown>[] = [];

  for (const [id, point] of current) {
    const points = series.get(id)!;
    const s = stats.get(id)!;
    const ladder = ladders.get(id) ?? [];
    const row = catalog[id];
    const vendor = vendors[id] ?? null;
    const bb = buyBelow.get(id);
    latestRows.push([
      id, row?.[0] || null, row?.[2] ?? -1, row?.[3] ?? -1, row?.[1] ?? '',
      point.min, point.market, point.qty, round(s.ref), round(s.soldPerDay, 1), REL[s.reliability],
      s.signal ? SIG[s.signal] : 0, round(s.trend, 4), bw ? (lastBw[id]?.[0] ?? null) : null, vendor,
      spark(points, now, 7, 28),
    ]);

    const med = rollingMedian(points, th.reference.window_hours);
    const steps = [1, 1.05, 1.2, 1.35, 1.5];
    writeJson(join(outDir, `items/${id}.json`), {
      id,
      pts: points.map((p, i) => [Math.round(p.t / 60000), p.min, p.market, med[i], p.qty, p.sold]),
      ladder: ladder.slice(0, 80),
      depth: steps.map((step) => [Math.floor(point.min * step), unitsAtOrBelow(ladder, point.min * step)]),
      heat: heatmap(points, now, th, hourOf),
      hours: round(s.hours, 1), stability: round(s.stability, 3),
      usedIn: usedIn.get(id) ?? [], madeBy: madeBy.get(id) ?? [],
      buyBelow: bb ? { price: round(bb.price), recipe: bb.recipe } : null,
    });

    const bargain = findBargain(ladder, s, row?.[4] ?? 0, eco, th);
    if (bargain) {
      actions.push({
        type: 'ganga', item: id, unitInvest: round(bargain.avgCost, 1), unitProfit: round(bargain.profitPerUnit, 1),
        maxUnits: bargain.units, sold: round(s.soldPerDay, 1), rel: REL[s.reliability], known: true,
        discount: round(bargain.discount, 3), next: bargain.nextPrice, ref: round(s.ref),
      });
    }
  }

  for (const r of allRecipes) {
    const res = results.get(r.id);
    if (!res || !res.goldPerDay || res.goldPerDay <= 0 || res.units < 1 || res.profitPerUnit === null) continue;
    actions.push({
      type: 'fabricar', item: r.item, recipe: r.id, name: r.name, unitInvest: round(res.cost, 1),
      unitProfit: round(res.profitPerUnit, 1), maxUnits: res.units, sold: round(res.soldPerDay, 1),
      rel: REL[res.reliability], known: known ? known.has(r.id) : null, sale: res.sale, prof: r.prof,
      skill: skillOf(r)?.level ?? null,
      main: res.buyBelow && { item: res.buyBelow.item, price: round(res.buyBelow.price), qty: r.reagents.find(([i]) => i === res.buyBelow!.item)?.[1] },
    });
    // Compra de material en su franja barata, para las recetas rentables.
    for (const m of res.materials) {
      const ms = stats.get(m.item);
      const mp = current.get(m.item);
      if (!ms || !mp || ms.signal !== 'comprar' || ms.ref === null || m.route !== 'subasta') continue;
      const units = Math.ceil((res.units / r.yield) * m.qty);
      const total = costOf(ladders.get(m.item) ?? [], units);
      // Solo si comprar ahora ahorra al menos un 2% frente a la referencia.
      if (total === null || total / units > ms.ref * 0.98) continue;
      actions.push({
        type: 'material', item: m.item, recipe: r.id, name: r.name, unitInvest: round(total / units, 1),
        unitProfit: round(ms.ref - total / units, 1), maxUnits: units, sold: round(ms.soldPerDay ?? res.soldPerDay, 1),
        rel: REL[ms.reliability], known: known ? known.has(r.id) : null, ref: round(ms.ref), prof: r.prof,
        skill: skillOf(r)?.level ?? null,
      });
    }
  }
  // Una sola compra por material: la de la receta que más unidades pide.
  const materialSeen = new Map<number, Record<string, unknown>>();
  const finalActions = actions.filter((a) => {
    if (a.type !== 'material') return true;
    const prev = materialSeen.get(a.item as number);
    if (prev && (prev.maxUnits as number) >= (a.maxUnits as number)) return false;
    if (prev) prev.drop = true;
    materialSeen.set(a.item as number, a);
    return true;
  }).filter((a) => !a.drop);
  const perDay = (a: Record<string, unknown>) => {
    const units = a.maxUnits as number;
    const sold = (a.sold as number | null) ?? 0;
    return ((a.unitProfit as number) * units) / Math.max(1, sold > 0 ? units / sold : Infinity);
  };
  // Con menos de 48 h de datos no se genera ninguna señal (sección 5.3).
  for (let i = finalActions.length - 1; i >= 0; i--) if (finalActions[i]!.rel === 0) finalActions.splice(i, 1);
  finalActions.sort((a, b) => perDay(b) - perDay(a));
  for (const a of finalActions) name(a.item as number);

  const header = {
    t: new Date(now).toISOString(),
    first: new Date(snapshots[0]!).toISOString(),
    hours: round(historyHours, 1),
    snapshots: snapshots.length,
    house: alliance.id,
    blackwater: bw ? Number(bw) : null,
    minHoursForSignals: th.reference.min_hours_for_signals,
    minDaysForTiming: th.buy_timing.min_days,
    cut: eco.cut,
    sources: meta?.sources ?? {},
  };
  writeJson(join(outDir, 'latest.json'), {
    ...header,
    cols: ['id', 'name', 'class', 'subclass', 'quality', 'min', 'market', 'qty', 'ref', 'sold', 'rel', 'signal', 'trend', 'bw', 'vendor', 'spark'],
    items: latestRows,
  });
  writeJson(join(outDir, 'recipes.json'), {
    t: header.t,
    professions: recipesFile?.professions ?? [],
    character: character ? { professions: character.professions } : null,
    skillSource: skills ? 'foreverdb' : null,
    names,
    recipes: recipesOut,
  });
  writeJson(join(outDir, 'today.json'), {
    t: header.t, maxActions: th.today.max_actions, minSold: th.today.min_sold_per_day, names,
    actions: finalActions.slice(0, 200),
  });
  console.log(
    `Derivados: ${latestRows.length} objetos, ${recipesOut.length} recetas (${results.size} calculables), ` +
      `${finalActions.length} acciones, ${round(historyHours, 1)} h de historial.`,
  );
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  try {
    derive(resolve(process.env.DATA_DIR ?? 'data-branch'), resolve(process.env.OUT_DIR ?? 'web/public/data'));
  } catch (err) {
    console.error(`::error::${(err as Error).message}`);
    process.exit(1);
  }
}
