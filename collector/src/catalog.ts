/**
 * Catálogo diario: objetos, recetas, vendedores y profesiones del personaje.
 * Todo sale de la API de Blizzard y se guarda en catalog/ de la rama data.
 */
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { BlizzardClient, loadHousesConfig, ShapeError } from './blizzard.ts';
import { readJson, writeJson } from './store.ts';
import type { Meta } from './store.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export const ITEM_COLS = ['name', 'quality', 'class', 'subclass', 'sell', 'buy'] as const;
export type ItemRow = [string, string, number, number, number, number];
export interface ItemsFile { version: 1; t: string; cols: readonly string[]; items: Record<string, ItemRow> }
export interface RecipeEntry {
  id: number; name: string; prof: number; cat: string; item: number; yield: number; reagents: [number, number][];
}
export interface RecipesFile { version: 1; t: string; professions: { id: number; name: string }[]; recipes: RecipeEntry[] }
export interface VendorsFile { version: 1; t: string; items: Record<string, number>; info?: Record<string, VendorInfo> }
export interface CharacterFile {
  version: 1; t: string;
  professions: { id: number; name: string; skill: number | null; max: number | null }[];
  known: number[];
}

/** Ejecuta `fn` sobre cada elemento con un máximo de tareas simultáneas. */
async function pool<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }));
  return out;
}

const localized = (v: unknown): string | null =>
  typeof v === 'string' ? v : isObj(v) ? ((v.es_ES ?? v.en_US ?? null) as string | null) : null;

/** Recorre la búsqueda de objetos por rangos de ID, 1.000 por petición. */
export async function fetchItems(client: BlizzardClient, ns: string): Promise<Record<string, ItemRow>> {
  const items: Record<string, ItemRow> = {};
  let from = 0;
  for (let page = 0; page < 500; page++) {
    const res = await client.get(`/data/wow/search/item?orderby=id&_pageSize=1000&id=[${from},999999999]`, ns);
    if (res.status !== 200 || !isObj(res.body) || !Array.isArray(res.body.results)) {
      throw new ShapeError(`Búsqueda de objetos: respuesta ${res.status} o forma inesperada.`);
    }
    const results = res.body.results as unknown[];
    let last = from;
    for (const r of results) {
      const d = isObj(r) ? r.data : null;
      if (!isObj(d) || typeof d.id !== 'number') throw new ShapeError('Búsqueda de objetos: resultado sin data.id.');
      const num = (v: unknown) => (typeof v === 'number' ? v : 0);
      const sub = (v: unknown) => (isObj(v) && typeof v.id === 'number' ? v.id : -1);
      items[d.id] = [
        localized(d.name) ?? '',
        isObj(d.quality) && typeof d.quality.type === 'string' ? d.quality.type : '',
        sub(d.item_class), sub(d.item_subclass), num(d.sell_price), num(d.purchase_price),
      ];
      last = Math.max(last, d.id);
    }
    if (results.length < 1000) break;
    from = last + 1;
  }
  return items;
}

export async function fetchRecipes(client: BlizzardClient, ns: string): Promise<Omit<RecipesFile, 'version' | 't'>> {
  const get = async (path: string) => {
    const res = await client.get(path, ns, { locale: 'es_ES' });
    return res.status === 200 && isObj(res.body) ? res.body : null;
  };
  const index = await get('/data/wow/profession/index');
  if (!index || !Array.isArray(index.professions)) throw new ShapeError('Índice de profesiones: forma inesperada.');
  const professions: RecipesFile['professions'] = [];
  const pending: { id: number; prof: number; cat: string }[] = [];
  for (const p of index.professions as unknown[]) {
    if (!isObj(p) || typeof p.id !== 'number') continue;
    professions.push({ id: p.id, name: localized(p.name) ?? String(p.id) });
    const prof = await get(`/data/wow/profession/${p.id}`);
    for (const tier of prof && Array.isArray(prof.skill_tiers) ? (prof.skill_tiers as unknown[]) : []) {
      if (!isObj(tier) || typeof tier.id !== 'number') continue;
      const body = await get(`/data/wow/profession/${p.id}/skill-tier/${tier.id}`);
      for (const cat of body && Array.isArray(body.categories) ? (body.categories as unknown[]) : []) {
        if (!isObj(cat) || !Array.isArray(cat.recipes)) continue;
        for (const r of cat.recipes as unknown[]) {
          if (isObj(r) && typeof r.id === 'number') pending.push({ id: r.id, prof: p.id, cat: localized(cat.name) ?? '' });
        }
      }
    }
  }
  const fetched = await pool(pending, 8, async (entry): Promise<RecipeEntry | null> => {
    const r = await get(`/data/wow/recipe/${entry.id}`);
    if (!r || !isObj(r.crafted_item) || typeof r.crafted_item.id !== 'number' || !Array.isArray(r.reagents)) return null;
    const reagents: [number, number][] = [];
    for (const g of r.reagents as unknown[]) {
      if (isObj(g) && isObj(g.reagent) && typeof g.reagent.id === 'number' && typeof g.quantity === 'number') {
        reagents.push([g.reagent.id, g.quantity]);
      }
    }
    if (reagents.length === 0) return null;
    const q = isObj(r.crafted_quantity) ? r.crafted_quantity : {};
    const qty = typeof q.value === 'number' ? q.value
      : typeof q.minimum === 'number' && typeof q.maximum === 'number' ? (q.minimum + q.maximum) / 2 : 1;
    return {
      id: entry.id, name: localized(r.name) ?? String(entry.id), prof: entry.prof, cat: entry.cat,
      item: r.crafted_item.id, yield: qty > 0 ? qty : 1, reagents,
    };
  });
  const seen = new Set<number>();
  const recipes = fetched.filter((r): r is RecipeEntry => r !== null && !seen.has(r.id) && !!seen.add(r.id));
  return { professions, recipes };
}

/** Profesiones del personaje. No guarda el nombre. La forma se asume como la de retail. */
export async function fetchCharacter(client: BlizzardClient, ns: string, slug: string): Promise<Omit<CharacterFile, 'version' | 't'>> {
  const res = await client.get(`/profile/wow/character/${slug}/professions`, ns, { locale: 'es_ES' });
  if (res.status !== 200 || !isObj(res.body)) throw new Error(`Profesiones del personaje: respuesta ${res.status}.`);
  const professions: CharacterFile['professions'] = [];
  const known = new Set<number>();
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  for (const group of [res.body.primaries, res.body.secondaries]) {
    for (const entry of Array.isArray(group) ? (group as unknown[]) : []) {
      if (!isObj(entry) || !isObj(entry.profession) || typeof entry.profession.id !== 'number') continue;
      let skill = num(entry.skill_points);
      let max = num(entry.max_skill_points);
      const tiers = Array.isArray(entry.tiers) ? (entry.tiers as unknown[]) : [];
      for (const tier of tiers) {
        if (!isObj(tier)) continue;
        skill ??= num(tier.skill_points);
        max ??= num(tier.max_skill_points);
        for (const r of Array.isArray(tier.known_recipes) ? (tier.known_recipes as unknown[]) : []) {
          if (isObj(r) && typeof r.id === 'number') known.add(r.id);
        }
      }
      for (const r of Array.isArray(entry.known_recipes) ? (entry.known_recipes as unknown[]) : []) {
        if (isObj(r) && typeof r.id === 'number') known.add(r.id);
      }
      professions.push({ id: entry.profession.id, name: localized(entry.profession.name) ?? '', skill, max });
    }
  }
  if (professions.length === 0) throw new ShapeError('Profesiones del personaje: no se reconoce la forma de la respuesta.');
  return { professions, known: [...known].sort((a, b) => a - b) };
}

/** Nivel de habilidad de una receta, por objeto fabricado. Datos de ForeverDB.net. */
export interface SkillRow {
  /** Nivel con el que se aprende; null si ForeverDB no lo conoce. */
  orange: number | null;
  yellow: number;
  green: number;
  grey: number;
  /** 'a' automática, 't' instructor, 'i<objeto>' patrón. */
  learn: string;
  isNew: boolean;
  /** El nivel de aprendizaje es dato de instructor de Classic. */
  classic: boolean;
}
export interface SkillsFile { version: 1; t: string; source: string; dataVersion: string; byItem: Record<string, SkillRow> }

const FOREVERDB = 'https://foreverdb.net';
const FOREVERDB_HEADERS = { 'User-Agent': 'wow-subastas (herramienta personal)' };

/**
 * Lee las recetas del fichero de datos del addon de ForeverDB (Data/Recipes.lua). Cada receta es
 * {hechizo, nombre, nivel, amarillo, verde, gris, objeto, cantidad, "materiales", "origen", campamento, nueva, classic, ...}.
 */
export function parseForeverDbRecipes(lua: string): Record<string, SkillRow> {
  const entry = /\{(\d+),"(?:[^"\\]|\\.)*",(\d+),(\d+),(\d+),(\d+),(\d+),[\d.]+,"[^"]*","([^"]*)",\d+,(\d+),(\d+)(?:,\d+,\d+)?\}/g;
  const byItem: Record<string, SkillRow> = {};
  const need = (r: SkillRow) => r.orange ?? r.yellow;
  for (const m of lua.matchAll(entry)) {
    const row: SkillRow = {
      orange: Number(m[2]) > 0 ? Number(m[2]) : null,
      yellow: Number(m[3]), green: Number(m[4]), grey: Number(m[5]),
      learn: m[7]!, isNew: m[8] === '1', classic: m[9] === '1',
    };
    const item = m[6]!;
    // Si varias recetas dan el mismo objeto, vale la que se aprende antes.
    if (item !== '0' && (!byItem[item] || need(row) < need(byItem[item]))) byItem[item] = row;
  }
  return byItem;
}

/** Descarga un fichero de datos del addon de ForeverDB y comprueba su huella. */
async function foreverDbFile(path: string): Promise<{ text: string; dataVersion: string }> {
  const get = async (url: string) => {
    const res = await fetch(`${FOREVERDB}/${url}`, { headers: FOREVERDB_HEADERS });
    if (!res.ok) throw new Error(`ForeverDB ${url.split('?')[0]}: respuesta ${res.status}.`);
    return res;
  };
  const manifest = (await (await get('downloads/addon-manifest.json')).json()) as unknown;
  const data = isObj(manifest) && isObj(manifest.data) ? manifest.data : {};
  const file = (Array.isArray(data.files) ? (data.files as unknown[]) : []).find((f) => isObj(f) && f.path === path);
  if (!isObj(file) || typeof file.url !== 'string') throw new ShapeError(`ForeverDB: el manifiesto no lista ${path}.`);
  const bytes = Buffer.from(await (await get(file.url)).arrayBuffer());
  if (typeof file.sha256 === 'string' && createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    throw new Error(`ForeverDB: ${path} no coincide con la huella del manifiesto.`);
  }
  return { text: bytes.toString('utf8'), dataVersion: typeof data.version === 'string' ? data.version : '' };
}

/**
 * Niveles de las recetas, del fichero público de datos del addon de ForeverDB
 * (GPL-3.0 con crédito obligatorio: «Datos de ForeverDB.net»). La API de Blizzard no los da.
 */
export async function fetchSkills(): Promise<Omit<SkillsFile, 'version' | 't'>> {
  const { text, dataVersion } = await foreverDbFile('Data/Recipes.lua');
  return { source: 'ForeverDB.net', dataVersion, byItem: parseForeverDbRecipes(text) };
}

export interface VendorInfo { price: number; npc: string; seen: boolean }

/**
 * Materiales de vendedor accesibles para la Alianza, de Data/NPCs.lua de ForeverDB.
 * ns.npcs: [npc] = {nombre, título, mapa, x, y, bando (A/H/vacío), visto en Forever};
 * ns.sold: [objeto] = {npc, precio en cobre, unidades por compra, existencias limitadas, ...}.
 * Se queda con el precio por unidad más bajo sin existencias limitadas, prefiriendo vendedores vistos en Forever.
 */
export function parseForeverDbVendors(lua: string): Record<string, VendorInfo> {
  const lineOf = (name: string) => lua.split('\n').find((l) => l.startsWith(`ns.${name} = `)) ?? '';
  const npcs = new Map<string, { name: string; side: string; seen: boolean }>();
  const npcRe = /\[(\d+)\]=\{"((?:[^"\\]|\\.)*)","(?:[^"\\]|\\.)*",-?\d+,-?[\d.]+,-?[\d.]+,"(\w*)",(\d)\}/g;
  for (const m of lineOf('npcs').matchAll(npcRe)) npcs.set(m[1]!, { name: m[2]!, side: m[3]!, seen: m[4] === '1' });
  const out: Record<string, VendorInfo> = {};
  for (const m of lineOf('sold').matchAll(/\[(\d+)\]=\{([\d,]+)\}/g)) {
    const v = m[2]!.split(',').map(Number);
    let best: VendorInfo | null = null;
    for (let i = 0; i + 3 < v.length; i += 4) {
      const npc = npcs.get(String(v[i]));
      const [price, stack, limited] = [v[i + 1]!, v[i + 2]!, v[i + 3]!];
      if (!npc || npc.side === 'H' || limited || price <= 0) continue;
      const cand = { price: price / Math.max(1, stack), npc: npc.name, seen: npc.seen };
      if (!best || (cand.seen && !best.seen) || (cand.seen === best.seen && cand.price < best.price)) best = cand;
    }
    if (best) out[m[1]!] = best;
  }
  return out;
}

async function main(): Promise<void> {
  const dataDir = resolve(process.env.DATA_DIR ?? 'data-branch');
  const config = loadHousesConfig(join(ROOT, 'config/houses.json'));
  const client = new BlizzardClient(config.host);
  await client.authenticate();
  const t = new Date().toISOString();
  const sources: Meta['sources'] = {};
  const run = async (name: string, fn: () => Promise<string>) => {
    try {
      sources[name] = { ok: true, at: t, detail: await fn() };
      console.log(`${name}: ${sources[name]!.detail}`);
    } catch (err) {
      sources[name] = { ok: false, at: t, detail: (err as Error).message.replaceAll(process.env.CHARACTER_SLUG || '\u0000', '<personaje>') };
      console.log(`::warning::${name}: ${sources[name]!.detail}`);
    }
  };

  let items: Record<string, ItemRow> | null = null;
  await run('catalogo_objetos', async () => {
    items = await fetchItems(client, config.namespaces.static);
    const count = Object.keys(items).length;
    if (count < 1000) throw new ShapeError(`Solo ${count} objetos: no se guarda.`);
    writeJson(join(dataDir, 'catalog/items.json'), { version: 1, t, cols: ITEM_COLS, items } satisfies ItemsFile);
    return `${count} objetos`;
  });
  await run('catalogo_vendedores', async () => {
    const { text, dataVersion } = await foreverDbFile('Data/NPCs.lua');
    const info = parseForeverDbVendors(text);
    const count = Object.keys(info).length;
    if (count < 100) throw new ShapeError(`ForeverDB: solo ${count} objetos de vendedor; no se guarda.`);
    const items: Record<string, number> = {};
    for (const [id, v] of Object.entries(info)) items[id] = v.price;
    writeJson(join(dataDir, 'catalog/vendors.json'), { version: 1, t, items, info } satisfies VendorsFile);
    return `${count} objetos de vendedor para la Alianza (datos ${dataVersion})`;
  });
  await run('catalogo_recetas', async () => {
    const { professions, recipes } = await fetchRecipes(client, config.namespaces.static);
    if (recipes.length === 0) throw new ShapeError('Ninguna receta: no se guarda.');
    writeJson(join(dataDir, 'catalog/recipes.json'), { version: 1, t, professions, recipes } satisfies RecipesFile);
    return `${recipes.length} recetas de ${professions.length} profesiones`;
  });
  await run('foreverdb_niveles', async () => {
    const skills = await fetchSkills();
    const count = Object.keys(skills.byItem).length;
    if (count < 100) throw new ShapeError(`ForeverDB: solo ${count} recetas reconocidas; no se guarda.`);
    writeJson(join(dataDir, 'catalog/skills.json'), { version: 1, t, ...skills } satisfies SkillsFile);
    return `${count} recetas con nivel (datos ${skills.dataVersion})`;
  });
  const slug = process.env.CHARACTER_SLUG;
  if (slug) {
    await run('personaje', async () => {
      const character = await fetchCharacter(client, config.namespaces.profile, slug);
      writeJson(join(dataDir, 'catalog/character.json'), { version: 1, t, ...character } satisfies CharacterFile);
      return `${character.professions.length} profesiones, ${character.known.length} recetas conocidas`;
    });
  } else {
    sources.personaje = { ok: false, at: t, detail: 'Falta el secreto CHARACTER_SLUG.' };
  }

  const metaPath = join(dataDir, 'meta.json');
  const meta = readJson<Meta>(metaPath);
  if (meta) writeJson(metaPath, { ...meta, sources: { ...meta.sources, ...sources } });
  if (!sources.catalogo_objetos?.ok || !sources.catalogo_recetas?.ok) process.exitCode = 1;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  main().catch((err: Error) => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}
