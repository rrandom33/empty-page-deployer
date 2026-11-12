import { useMemo, useState } from 'react';
import { Spinner } from '@fluentui/react-components';
import { useKnownRecipes, useRecipes, useStored, useWatchlist } from '../data.ts';
import type { Latest, RecipeRow, Recipes } from '../data.ts';
import { MissingData, SortHeader } from '../components/common.tsx';
import { approx, int, itemName, percent, price, RELIABILITY, signedPrice } from '../format.ts';

type SortKey = 'name' | 'cost' | 'sale' | 'profit' | 'margin' | 'sold' | 'gpd';
const ROUTE_LABEL = { subasta: 'comprado en subasta', vendedor: 'comprado al vendedor', fabricar: 'fabricado' } as const;
const LEATHERWORKING = 165;

/** Unidades recomendadas teniendo en cuenta el oro disponible. */
export function unitsWithGold(r: RecipeRow, goldCopper: number): number {
  if (!r.units || !r.cost) return 0;
  return Math.min(r.units, Math.floor(goldCopper / r.cost));
}

export function Fabrica({ latest, recipeId }: { latest: Latest; recipeId: number | null }) {
  const { data, error } = useRecipes();
  const manual = useKnownRecipes();
  const watch = useWatchlist();
  const [gold] = useStored('oro', 85);
  const [prof, setProf] = useStored<number | 'todas'>('fabrica.profesion', LEATHERWORKING);
  const [onlyKnown, setOnlyKnown] = useStored('fabrica.soloConocidas', true);
  const [learn, setLearn] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'gpd', dir: -1 });
  const [selected, setSelected] = useState<number | null>(null);

  const names = useMemo(() => {
    const map = new Map<number, string>();
    if (data) for (const [id, n] of Object.entries(data.names)) map.set(Number(id), n);
    return (id: number) => itemName(id, map.get(id) ?? latest.byId.get(id)?.name);
  }, [data, latest]);

  const isKnown = (r: RecipeRow) => r.known ?? manual.has(r.id);
  const professions = useMemo(
    () => (data ? data.professions.filter((p) => data.recipes.some((r) => r.prof === p.id)) : []),
    [data],
  );
  const anyKnown = !!data && data.recipes.some(isKnown);
  const goldCopper = gold * 10000;

  const rows = useMemo(() => {
    if (!data) return [];
    const profId = professions.some((p) => p.id === prof) ? prof : 'todas';
    const list = data.recipes.filter((r) => {
      if (profId !== 'todas' && r.prof !== profId) return false;
      if (learn) return !isKnown(r);
      if (onlyKnown && anyKnown) return isKnown(r);
      return true;
    });
    const value = (r: RecipeRow): number | string | null =>
      sort.key === 'name' ? r.name : sort.key === 'gpd' ? gpd(r, goldCopper) : (r[sort.key] ?? null);
    return list.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === null || vb === null) return va === vb ? (b.profit ?? -Infinity) - (a.profit ?? -Infinity) : va === null ? 1 : -1;
      if (typeof va === 'string') return va.localeCompare(vb as string, 'es') * sort.dir;
      return ((va as number) - (vb as number)) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, prof, professions, learn, onlyKnown, anyKnown, sort, goldCopper, manual.list]);

  if (error) return <p className="notice" role="alert">{error}</p>;
  if (!data) return <Spinner label="Cargando recetas" />;

  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 }));
  const current = data.recipes.find((r) => r.id === (selected ?? recipeId)) ?? rows[0] ?? null;
  const skill = data.character?.professions.find((p) => p.id === prof);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Fábrica</h1>
          <p>Cada receta como un negocio: coste de materiales, precio de venta y cuánto absorbe el mercado.</p>
        </div>
        <label className="check">
          <input type="checkbox" checked={onlyKnown && !learn} disabled={learn} onChange={(e) => setOnlyKnown(e.target.checked)} />
          Solo recetas que conozco
        </label>
      </header>
      {data.recipes.length === 0 && <p className="notice">El catálogo de recetas todavía no se ha descargado. Se actualiza una vez al día.</p>}
      {data.recipes.length > 0 && !data.character && !anyKnown && (
        <p className="notice">
          No hay datos de tu personaje, así que se muestran todas las recetas. Marca «Conozco esta receta» en el detalle de las tuyas
          para que Fábrica y Hoy solo cuenten con ellas.
        </p>
      )}
      <MissingData hours={latest.hours} needed={6} what="estimar las ventas al día y el oro al día" />
      <div role="group" aria-label="Profesión" className="wrap">
        {professions.map((p) => (
          <button key={p.id} type="button" className="chip" aria-pressed={prof === p.id} onClick={() => { setProf(p.id); setSelected(null); }}>{p.name}</button>
        ))}
        <button type="button" className="chip" aria-pressed={prof === 'todas'} onClick={() => { setProf('todas'); setSelected(null); }}>Todas las profesiones</button>
        <button type="button" className="chip" aria-pressed={learn} onClick={() => { setLearn(!learn); setSelected(null); }}>Recetas que podría aprender</button>
      </div>
      {skill && skill.skill !== null && (
        <p className="muted" style={{ margin: 0 }}>Tu nivel de {skill.name.toLowerCase()}: {skill.skill}{skill.max ? ` de ${skill.max}` : ''}.</p>
      )}
      <div className="row">
        <section aria-label="Recetas" className="card" style={{ flex: '999 1 620px' }}>
          <div className="scroll-x">
            <table className="grid" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <SortHeader label="Receta" column="name" sort={sort} onSort={onSort} />
                  <SortHeader label="Coste materiales" column="cost" sort={sort} onSort={onSort} numeric />
                  <SortHeader label="Venta" column="sale" sort={sort} onSort={onSort} numeric />
                  <SortHeader label="Beneficio neto" column="profit" sort={sort} onSort={onSort} numeric />
                  <SortHeader label="Margen" column="margin" sort={sort} onSort={onSort} numeric />
                  <SortHeader label="Ventas al día" column="sold" sort={sort} onSort={onSort} numeric />
                  <SortHeader label="Oro al día" column="gpd" sort={sort} onSort={onSort} numeric />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r) => {
                  const g = gpd(r, goldCopper);
                  return (
                    <tr key={r.id} className={`clickable${current?.id === r.id ? ' selected' : ''}`} onClick={() => setSelected(r.id)}>
                      <td>
                        <button type="button" className="th-sort strong" onClick={() => setSelected(r.id)}>{r.name}</button>
                        <div className="small">{r.reagents.map(([item, qty]) => `${qty} ${names(item)}`).join(' · ')}</div>
                      </td>
                      <td className="num">{r.cost === undefined ? 'sin materiales' : price(Math.round(r.cost))}</td>
                      <td className="num">{r.sale == null ? 'sin anuncios' : price(r.sale)}</td>
                      <td className={`num strong ${r.profit == null ? '' : r.profit >= 0 ? 'pos' : 'neg'}`}>{r.profit == null ? '—' : signedPrice(Math.round(r.profit))}</td>
                      <td className="num">{percent(r.margin, false)}</td>
                      <td className="num">{approx(r.sold)}</td>
                      <td className="num strong">{g === null ? '—' : g < 0 ? 'pérdida' : `~${price(Math.round(g))}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="empty">Ninguna receta coincide con el filtro.</p>}
          {rows.length > 300 && <p className="empty">Se muestran las 300 primeras de {int(rows.length)}. Elige una profesión para acotar.</p>}
        </section>
        {current && (
          <Detail
            r={current} data={data} names={names} goldCopper={goldCopper} cut={latest.cut}
            known={isKnown(current)} onKnown={current.known === null ? () => manual.toggle(current.id) : null}
            watched={watch.has(current.item)} onWatch={() => watch.toggle(current.item)}
          />
        )}
      </div>
    </>
  );
}

/** Oro al día con las unidades que permite el oro disponible. */
function gpd(r: RecipeRow, goldCopper: number): number | null {
  if (r.profit == null || r.gpd == null || !r.units) return r.profit != null && r.profit < 0 && r.sold ? r.profit : null;
  const units = unitsWithGold(r, goldCopper);
  return (r.gpd * units) / r.units;
}

function Detail({
  r, data, names, goldCopper, cut, known, onKnown, watched, onWatch,
}: {
  r: RecipeRow; data: Recipes; names: (id: number) => string; goldCopper: number; cut: number;
  known: boolean; onKnown: (() => void) | null; watched: boolean; onWatch: () => void;
}) {
  const profName = data.professions.find((p) => p.id === r.prof)?.name ?? '';
  const units = unitsWithGold(r, goldCopper);
  const recipeName = (id?: number) => data.recipes.find((x) => x.id === id)?.name;
  const main = r.buyBelow ?? null;
  return (
    <aside aria-label="Detalle de la receta" className="card pad" style={{ flex: '1 1 360px', padding: 20, gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, lineHeight: '24px' }}>{r.name}</h2>
        <span className="muted">
          {profName}{r.cat ? ` · ${r.cat}` : ''}{r.yield !== 1 ? ` · salen ${r.yield} por fabricación` : ''}
          {r.rel !== undefined ? ` · Fiabilidad ${RELIABILITY[r.rel]!.toLowerCase()}` : ''}
        </span>
      </div>
      {onKnown && (
        <label className="check" style={{ minHeight: 0 }}>
          <input type="checkbox" checked={known} onChange={onKnown} />
          Conozco esta receta
        </label>
      )}
      {r.known === false && <span className="muted">Tu personaje no conoce esta receta.</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Materiales por fabricación</h3>
        {!r.mats && <p className="muted" style={{ margin: 0 }}>Algún material no está en subasta ni lo vende un vendedor: {r.reagents.map(([i, q]) => `${q} ${names(i)}`).join(', ')}.</p>}
        {r.mats?.map((m) => (
          <div key={m.item} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="mat best">
              <div>
                <a className="item-link" href={`#/objeto/${m.item}`}>{m.qty} × {names(m.item)}</a>, {ROUTE_LABEL[m.route]}
                <div className="small">{m.route === 'fabricar' ? `Con ${recipeName(m.via) ?? 'otra receta'} · ruta más barata ahora` : 'Ruta más barata ahora'}</div>
              </div>
              <span className="strong" style={{ whiteSpace: 'nowrap' }}>{price(Math.round(m.unit * m.qty))}</span>
            </div>
            {m.alts.slice(1).map((a, i) => (
              <div className="mat" key={i}>
                <div>
                  {m.qty} × {names(m.item)}, {ROUTE_LABEL[a.route]}
                  {a.route === 'fabricar' && <div className="small">Con {recipeName(a.via) ?? 'otra receta'}</div>}
                </div>
                <span style={{ whiteSpace: 'nowrap' }}>{price(Math.round(a.unit * m.qty))}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <dl className="dl">
        <div><dt>Venta menos {Math.round(cut * 100)}%</dt><dd>{r.net == null ? '—' : price(Math.round(r.net))}</dd></div>
        <div><dt>Beneficio por unidad</dt><dd className={r.profit == null ? '' : r.profit >= 0 ? 'pos' : 'neg'}>{r.profit == null ? '—' : signedPrice(Math.round(r.profit))}</dd></div>
        <div><dt>{main ? `Compra ${names(main.item)} por debajo de` : 'Precio de compra del material'}</dt><dd>{main ? price(main.price) : '—'}</dd></div>
        <div><dt>Deja de fabricar si baja de</dt><dd>{r.stopBelow == null ? '—' : price(r.stopBelow)}</dd></div>
      </dl>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Cuántas fabricar hoy</h3>
        {r.sold == null ? (
          <p style={{ margin: 0 }}>Aún no hay ventas estimadas de este objeto: hacen falta al menos 6 horas de fotos. Hay {int(r.listed)} anunciadas.</p>
        ) : r.profit != null && r.profit <= 0 ? (
          <p style={{ margin: 0 }}>Ahora mismo se pierde dinero con cada unidad. El mercado absorbe unas {approx(r.sold)} al día y hay {int(r.listed)} anunciadas.</p>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              El mercado absorbe unas {approx(r.sold)} al día y hay {int(r.listed)} anunciadas.{' '}
              {units > 0
                ? `Con ${int(units)} ${units === 1 ? 'unidad' : 'unidades'} no mueves el precio`
                : 'Con el oro disponible no llega para una unidad'}
              {r.units !== undefined && units < r.units ? ` (el oro disponible no da para las ${int(r.units)} recomendadas)` : ''}
              {r.cap !== undefined && r.units !== undefined && r.cap <= r.units ? `; por encima de ${int(r.cap)} el material se encarece más de un 10%.` : '.'}
            </p>
            <div aria-hidden="true" className="bar">
              <div style={{ width: `${Math.min(100, (units / Math.max(1, r.sold)) * 100)}%`, background: '#0F2B46' }} />
              <div style={{ width: `${Math.min(100, (Math.max(0, (r.units ?? 0) - units) / Math.max(1, r.sold)) * 100)}%`, background: '#8FB3D9' }} />
            </div>
            <div className="small wrap" style={{ gap: 16 }}>
              <span>Oscuro: tus {int(units)} recomendadas</span>
              <span>Claro: hasta {int(r.units ?? 0)} sin límite de oro · barra completa: ventas de un día</span>
            </div>
          </>
        )}
      </div>
      <div className="wrap">
        {main && <a className="btn primary" href={`#/objeto/${main.item}`}>Ver precio de {names(main.item)}</a>}
        <button type="button" className="btn" aria-pressed={watched} onClick={onWatch}>{watched ? 'En mi lista' : 'Añadir a mi lista'}</button>
      </div>
    </aside>
  );
}
