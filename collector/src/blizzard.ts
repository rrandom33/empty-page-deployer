import { readFileSync } from 'node:fs';
import type { Listing } from '../../engine/types.ts';

export interface HousesConfig {
  region: string;
  host: string;
  ruleset: number;
  namespaces: { dynamic: string; static: string; profile: string };
  houses: { id: number; kind: HouseKind }[];
  provisional: { names: Record<HouseKind, string> };
}
export type HouseKind = 'alliance' | 'blackwater';
export interface HouseRef { id: number; kind: HouseKind; name: string }

export function loadHousesConfig(path: string): HousesConfig {
  const config = JSON.parse(readFileSync(path, 'utf8')) as HousesConfig;
  // Permite apuntar a un servidor de pruebas.
  if (process.env.BLIZZARD_API_HOST) config.host = process.env.BLIZZARD_API_HOST;
  return config;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** La respuesta no tiene la forma esperada: no se guarda nada (sección 8). */
export class ShapeError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ApiResponse { status: number; headers: Headers; body: unknown }

export class BlizzardClient {
  private token = '';
  private readonly host: string;
  private readonly retryBaseMs: number;

  constructor(host: string, retryBaseMs = Number(process.env.RETRY_BASE_MS ?? 2000)) {
    this.host = host.replace(/\/$/, '');
    this.retryBaseMs = retryBaseMs;
  }

  async authenticate(): Promise<void> {
    const id = process.env.BLIZZARD_CLIENT_ID;
    const secret = process.env.BLIZZARD_CLIENT_SECRET;
    if (!id || !secret) {
      throw new Error('Faltan los secretos BLIZZARD_CLIENT_ID y BLIZZARD_CLIENT_SECRET.');
    }
    const url = process.env.BLIZZARD_OAUTH_URL ?? 'https://oauth.battle.net/token';
    const res = await this.withRetry(url, () =>
      fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      }),
    );
    if (!res.ok) throw new ApiError(`Token: respuesta ${res.status} de ${url}`, res.status);
    const body = (await res.json()) as { access_token?: unknown };
    if (typeof body.access_token !== 'string') throw new ShapeError('Token: falta access_token.');
    this.token = body.access_token;
  }

  /**
   * GET con reintentos ante 429 y 5xx. Devuelve también 304 y 404 sin lanzar,
   * para que quien llama decida.
   */
  async get(
    path: string,
    namespace: string,
    opts: { ifModifiedSince?: string; locale?: string } = {},
  ): Promise<ApiResponse> {
    const url = new URL(this.host + path);
    url.searchParams.set('namespace', namespace);
    // Sin locale, la API devuelve los nombres como objeto con todos los idiomas.
    url.searchParams.set('locale', opts.locale ?? 'en_US');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Accept-Encoding': 'gzip',
    };
    if (opts.ifModifiedSince) headers['If-Modified-Since'] = opts.ifModifiedSince;
    const res = await this.withRetry(path, () => fetch(url, { headers }));
    if (res.status === 304 || res.status === 404) {
      await res.arrayBuffer();
      return { status: res.status, headers: res.headers, body: null };
    }
    if (!res.ok) throw new ApiError(`GET ${path}: respuesta ${res.status}`, res.status);
    return { status: res.status, headers: res.headers, body: await res.json() };
  }

  private async withRetry(label: string, run: () => Promise<Response>): Promise<Response> {
    const attempts = 4;
    for (let i = 1; ; i++) {
      let res: Response | undefined;
      let failure = '';
      try {
        res = await run();
        if (res.status !== 429 && res.status < 500) return res;
        failure = `respuesta ${res.status}`;
      } catch (err) {
        failure = `error de red (${(err as Error).message})`;
      }
      if (i >= attempts) {
        if (res) return res;
        throw new Error(`${label}: ${failure} tras ${attempts} intentos.`);
      }
      const retryAfter = Number(res?.headers.get('retry-after'));
      const wait = retryAfter > 0 ? retryAfter * 1000 : this.retryBaseMs * 2 ** (i - 1);
      await res?.arrayBuffer().catch(() => undefined);
      console.log(`${label}: ${failure}; reintento ${i} en ${Math.round(wait / 1000)} s.`);
      await sleep(Math.min(wait, 60_000));
    }
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Índice de casas: `{ auctions: [{ key, name, id }] }`. */
export function parseHouseIndex(body: unknown): { id: number; name: string }[] {
  if (!isObj(body) || !Array.isArray(body.auctions)) {
    throw new ShapeError('Índice de casas: se esperaba { auctions: [...] }.');
  }
  return body.auctions.map((h, i) => {
    const name = isObj(h) && isObj(h.name) ? h.name.en_US : isObj(h) ? h.name : undefined;
    if (!isObj(h) || typeof h.id !== 'number' || typeof name !== 'string') {
      throw new ShapeError(
        `Índice de casas: la entrada ${i} no tiene id numérico y name: ${JSON.stringify(h).slice(0, 300)}`,
      );
    }
    return { id: h.id, name };
  });
}

/**
 * Normaliza una lista de anuncios, sean normales (`buyout` total de la pila)
 * o materiales (`unit_price`). Lanza ShapeError si la forma no es la esperada.
 */
export function parseListings(raw: unknown, label: string): Listing[] {
  if (!Array.isArray(raw)) throw new ShapeError(`${label}: se esperaba una lista de anuncios.`);
  const out: Listing[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i] as unknown;
    if (!isObj(a) || typeof a.id !== 'number' || !isObj(a.item) || typeof a.item.id !== 'number') {
      throw new ShapeError(`${label}: el anuncio ${i} no tiene id e item.id numéricos.`);
    }
    const qty = a.quantity === undefined ? 1 : a.quantity;
    if (typeof qty !== 'number' || !(qty > 0)) {
      throw new ShapeError(`${label}: el anuncio ${a.id} tiene una cantidad no válida.`);
    }
    let unit = 0;
    if (a.unit_price !== undefined) {
      if (typeof a.unit_price !== 'number') throw new ShapeError(`${label}: unit_price no numérico en ${a.id}.`);
      unit = a.unit_price;
    } else if (a.buyout !== undefined) {
      if (typeof a.buyout !== 'number') throw new ShapeError(`${label}: buyout no numérico en ${a.id}.`);
      unit = Math.floor(a.buyout / qty);
    }
    if (typeof a.time_left !== 'string') {
      throw new ShapeError(`${label}: el anuncio ${a.id} no tiene time_left.`);
    }
    out.push({ id: a.id, item: a.item.id, unit, qty, timeLeft: a.time_left });
  }
  return out;
}

/** Casas a recoger: las configuradas o, si no hay, todas las que coinciden por nombre. */
export async function resolveHouses(client: BlizzardClient, config: HousesConfig): Promise<HouseRef[]> {
  const res = await client.get(`/data/wow/ruleset/${config.ruleset}/auctions/`, config.namespaces.dynamic);
  if (res.status !== 200) throw new ApiError(`Índice de casas: respuesta ${res.status}`, res.status);
  const index = parseHouseIndex(res.body);
  if (config.houses.length > 0) {
    return config.houses.map((h) => {
      const found = index.find((x) => x.id === h.id);
      if (!found) throw new ShapeError(`La casa ${h.id} de config/houses.json ya no está en el índice.`);
      return { id: h.id, kind: h.kind, name: found.name };
    });
  }
  const kinds = Object.entries(config.provisional.names) as [HouseKind, string][];
  const houses = index.flatMap((h) => {
    const kind = kinds.find(([, name]) => name === h.name)?.[0];
    return kind ? [{ id: h.id, kind, name: h.name }] : [];
  });
  if (houses.length === 0) throw new ShapeError('El índice no contiene casas de Alianza ni de Blackwater.');
  return houses;
}

export interface HouseSnapshot {
  listings: Listing[];
  lastModified: string | null;
  counts: { auctions: number; commodities: number };
}

/**
 * Descarga una casa completa: anuncios normales y materiales.
 * Devuelve null si el servidor responde 304 a `ifModifiedSince`.
 */
export async function fetchHouse(
  client: BlizzardClient,
  config: HousesConfig,
  houseId: number,
  ifModifiedSince?: string,
): Promise<HouseSnapshot | null> {
  const base = `/data/wow/ruleset/${config.ruleset}/auctions/${houseId}`;
  const res = await client.get(base, config.namespaces.dynamic, { ifModifiedSince });
  if (res.status === 304) return null;
  if (res.status !== 200) throw new ApiError(`Casa ${houseId}: respuesta ${res.status}`, res.status);
  if (!isObj(res.body)) throw new ShapeError(`Casa ${houseId}: la respuesta no es un objeto.`);

  const auctions = res.body.auctions === undefined ? [] : parseListings(res.body.auctions, `Casa ${houseId}`);

  // `commodities` puede venir en línea o como enlace al subrecurso.
  let commodities: Listing[] = [];
  if (Array.isArray(res.body.commodities)) {
    commodities = parseListings(res.body.commodities, `Casa ${houseId} (materiales)`);
  } else {
    const sub = await client.get(`${base}/commodities`, config.namespaces.dynamic);
    if (sub.status === 200) {
      if (!isObj(sub.body)) throw new ShapeError(`Casa ${houseId} (materiales): la respuesta no es un objeto.`);
      commodities = parseListings(sub.body.auctions ?? [], `Casa ${houseId} (materiales)`);
    } else if (sub.status !== 404) {
      throw new ApiError(`Casa ${houseId} (materiales): respuesta ${sub.status}`, sub.status);
    }
  }

  // Si un mismo anuncio llegara por las dos vías, se cuenta una vez.
  const seen = new Set<number>();
  const listings: Listing[] = [];
  for (const l of [...commodities, ...auctions]) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    listings.push(l);
  }
  return {
    listings,
    lastModified: res.headers.get('last-modified'),
    counts: { auctions: auctions.length, commodities: commodities.length },
  };
}
