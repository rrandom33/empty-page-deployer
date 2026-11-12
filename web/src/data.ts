import { useEffect, useState } from 'react';

/** Fila de latest.json ya convertida a objeto. */
export interface Item {
  id: number;
  name: string | null;
  cls: number;
  sub: number;
  quality: string;
  min: number;
  market: number;
  qty: number;
  ref: number | null;
  sold: number | null;
  rel: number;
  signal: number;
  trend: number | null;
  bw: number | null;
  vendor: number | null;
  spark: number[];
}

export interface Latest {
  t: string;
  first: string;
  hours: number;
  snapshots: number;
  house: number;
  blackwater: number | null;
  minHoursForSignals: number;
  minDaysForTiming: number;
  cut: number;
  items: Item[];
  byId: Map<number, Item>;
}

export type Route = 'subasta' | 'vendedor' | 'fabricar';
export interface RecipeMat {
  item: number;
  qty: number;
  route: Route;
  unit: number;
  via?: number;
  alts: { route: Route; unit: number; via?: number }[];
}
export interface RecipeRow {
  id: number;
  name: string;
  prof: number;
  cat: string;
  item: number;
  yield: number;
  reagents: [number, number][];
  known: boolean | null;
  /** Nivel de habilidad con el que se aprende; null si no se conoce. */
  skill: number | null;
  learn: string | null;
  listed: number;
  cost?: number;
  mats?: RecipeMat[];
  sale?: number | null;
  net?: number | null;
  profit?: number | null;
  margin?: number | null;
  sold?: number | null;
  units?: number;
  cap?: number;
  days?: number | null;
  gpd?: number | null;
  buyBelow?: { item: number; price: number } | null;
  stopBelow?: number | null;
  rel?: number;
}
export interface Recipes {
  t: string;
  professions: { id: number; name: string }[];
  character: { professions: { id: number; name: string; skill: number | null; max: number | null }[] } | null;
  /** De dónde salen los niveles de receta. */
  skillSource: 'foreverdb' | 'classic' | null;
  /** Profesiones con niveles; null = todas. */
  skillProfessions: number[] | null;
  names: Record<string, string>;
  recipes: RecipeRow[];
}

export interface TodayAction {
  type: 'fabricar' | 'ganga' | 'material';
  item: number;
  recipe?: number;
  name?: string;
  unitInvest: number;
  unitProfit: number;
  maxUnits: number;
  sold: number | null;
  rel: number;
  known: boolean | null;
  prof?: number;
  skill?: number | null;
  discount?: number;
  next?: number | null;
  ref?: number;
  sale?: number | null;
  main?: { item: number; price: number; qty?: number } | null;
}
export interface Today {
  t: string;
  maxActions: number;
  minSold: number;
  names: Record<string, string>;
  actions: TodayAction[];
}

export interface ItemDetail {
  id: number;
  /** [minuto epoch, min, market, mediana móvil, unidades, vendidas] */
  pts: [number, number, number, number, number, number | null][];
  ladder: [number, number][];
  depth: [number, number][];
  heat: (number | null)[][] | null;
  hours: number | null;
  stability: number | null;
  usedIn: number[];
  madeBy: number[];
  buyBelow: { price: number; recipe: number } | null;
}

const cache = new Map<string, Promise<unknown>>();
function load<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(`data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`No se ha podido cargar ${path} (${r.status}).`);
      return r.json();
    });
    cache.set(path, p);
    p.catch(() => cache.delete(path));
  }
  return p as Promise<T>;
}

export interface Loaded<T> { data: T | null; error: string | null }

function useLoad<T>(path: string | null, map?: (raw: never) => T): Loaded<T> {
  const [state, setState] = useState<Loaded<T> & { path: string | null }>({ data: null, error: null, path });
  useEffect(() => {
    let live = true;
    setState({ data: null, error: null, path });
    if (path) {
      load<never>(path).then(
        (raw) => live && setState({ data: map ? map(raw) : (raw as T), error: null, path }),
        (err: Error) => live && setState({ data: null, error: err.message, path }),
      );
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return state.path === path ? state : { data: null, error: null };
}

let latestMemo: { raw: unknown; value: Latest } | null = null;
function toLatest(raw: { items: unknown[][] } & Omit<Latest, 'items' | 'byId'>): Latest {
  if (latestMemo?.raw === raw) return latestMemo.value;
  const items = raw.items.map((r) => ({
    id: r[0], name: r[1], cls: r[2], sub: r[3], quality: r[4], min: r[5], market: r[6], qty: r[7], ref: r[8],
    sold: r[9], rel: r[10], signal: r[11], trend: r[12], bw: r[13], vendor: r[14], spark: r[15],
  })) as Item[];
  const value = { ...raw, items, byId: new Map(items.map((i) => [i.id, i])) };
  latestMemo = { raw, value };
  return value;
}

export const useLatest = () => useLoad<Latest>('latest.json', toLatest as never);
export const useRecipes = () => useLoad<Recipes>('recipes.json');
export const useToday = () => useLoad<Today>('today.json');
export const useItemDetail = (id: number | null) => useLoad<ItemDetail>(id === null ? null : `items/${id}.json`);

/** Estado guardado en localStorage. */
export function useStored<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const full = `subastas.${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(full);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(full, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
  }, [full, value]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === full && e.newValue !== null) setValue(JSON.parse(e.newValue) as T);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [full]);
  return [value, setValue];
}

export function useWatchlist() {
  const [list, setList] = useStored<number[]>('lista', []);
  const toggle = (id: number) => setList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return { list, has: (id: number) => list.includes(id), toggle };
}

/** Recetas marcadas a mano como conocidas, para cuando no hay datos del personaje. */
export function useKnownRecipes() {
  const [list, setList] = useStored<number[]>('recetas', []);
  const toggle = (id: number) => setList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return { list, has: (id: number) => list.includes(id), toggle };
}

export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/hoy');
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || '/hoy');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Nivel de cada profesión, introducido a mano. */
export function useSkillLevels() {
  const [levels, setLevels] = useStored<Record<string, number>>('niveles', {});
  const set = (prof: number, level: number | null) =>
    setLevels((prev) => {
      const next = { ...prev };
      if (level === null) delete next[prof];
      else next[prof] = level;
      return next;
    });
  return { levels, get: (prof: number | undefined): number | null => (prof === undefined ? null : (levels[prof] ?? null)), set };
}
