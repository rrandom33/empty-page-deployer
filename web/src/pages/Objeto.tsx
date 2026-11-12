import { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@fluentui/react-components';
import { costOf, unitsAtOrBelow } from '../../../engine/analysis.ts';
import { useItemDetail, useRecipes, useWatchlist } from '../data.ts';
import type { Latest } from '../data.ts';
import { Heatmap, PriceChart } from '../components/charts.tsx';
import { MissingData, SignalTag, Stat } from '../components/common.tsx';
import { approx, historyLabel, int, itemName, percent, price, RELIABILITY } from '../format.ts';

const PERIODS = [
  { key: '24h', label: '24 h', minutes: 24 * 60 },
  { key: '3d', label: '3 d', minutes: 72 * 60 },
  { key: 'todo', label: 'Todo', minutes: Infinity },
] as const;

export function Objeto({ latest, id, onView }: { latest: Latest; id: number | null; onView: (id: number) => void }) {
  const item = id === null ? undefined : latest.byId.get(id);
  const { data: detail, error } = useItemDetail(item ? item.id : null);
  const { data: recipes } = useRecipes();
  const watch = useWatchlist();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('todo');
  const [units, setUnits] = useState(200);
  useEffect(() => { if (item) onView(item.id); }, [item, onView]);

  const pts = useMemo(() => {
    if (!detail) return [];
    const minutes = PERIODS.find((p) => p.key === period)!.minutes;
    const last = detail.pts[detail.pts.length - 1]?.[0] ?? 0;
    return detail.pts.filter((p) => p[0] >= last - minutes);
  }, [detail, period]);

  if (id === null) {
    return (
      <>
        <header className="page-header"><div><h1>Objeto</h1><p>Elige un objeto en Mercado o en tu lista para ver su precio.</p></div></header>
        <a className="btn primary" href="#/mercado" style={{ alignSelf: 'flex-start' }}>Ir a Mercado</a>
      </>
    );
  }
  if (!item) {
    return (
      <>
        <header className="page-header"><div><h1>Objeto {id}</h1><p>No hay ningún anuncio de este objeto en la última foto.</p></div></header>
        <a className="btn primary" href="#/mercado" style={{ alignSelf: 'flex-start' }}>Ir a Mercado</a>
      </>
    );
  }

  const name = itemName(item.id, item.name);
  const hasRef = latest.hours >= 24 && item.ref !== null;
  const buy = detail?.buyBelow ?? null;
  const buyRecipe = buy && recipes?.recipes.find((r) => r.id === buy.recipe);
  const diff = hasRef ? (item.min - item.ref!) / item.ref! : null;
  const usedIn = detail && recipes ? recipes.recipes.filter((r) => detail.usedIn.includes(r.id)) : [];
  const madeBy = detail && recipes ? recipes.recipes.filter((r) => detail.madeBy.includes(r.id)) : [];
  const firstRecipe = (buyRecipe ?? usedIn[0] ?? madeBy[0])?.id;
  const maxDepth = detail ? detail.depth[detail.depth.length - 1]![1] : 0;
  const total = detail ? costOf(detail.ladder, units) : null;
  const belowBuy = detail && buy ? unitsAtOrBelow(detail.ladder, buy.price) : null;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{name}</h1>
          <p>
            Casa de subastas de la Alianza · <SignalTag signal={item.signal} vendor={item.vendor !== null && item.vendor <= item.min} />{' '}
            · Fiabilidad {RELIABILITY[item.rel]!.toLowerCase()} · {historyLabel(detail?.hours ?? 0)} de datos
          </p>
        </div>
        <div className="wrap">
          <button type="button" className="btn" aria-pressed={watch.has(item.id)} onClick={() => watch.toggle(item.id)}>
            {watch.has(item.id) ? 'En mi lista' : 'Añadir a mi lista'}
          </button>
          {firstRecipe !== undefined && (
            <a className="btn primary" href={`#/fabrica/${firstRecipe}`}>
              {usedIn.length ? 'Ver recetas que lo usan' : 'Ver su receta'}
            </a>
          )}
        </div>
      </header>
      <MissingData hours={latest.hours} needed={latest.minHoursForSignals} what="dar señales" />
      <section aria-label="Precio actual" className="stats">
        <Stat
          label="Precio mínimo ahora"
          value={price(item.min)}
          note={belowBuy !== null ? `${int(belowBuy)} unidades por debajo de ${price(buy!.price)}` : `${int(item.qty)} unidades anunciadas`}
        />
        <Stat
          label="Mediana de 3 días"
          value={hasRef ? price(item.ref) : '—'}
          note={diff === null ? 'hace falta un día de fotos' : diff === 0 ? 'ahora en la mediana' : `ahora un ${percent(Math.abs(diff), false)} por ${diff < 0 ? 'debajo' : 'encima'}`}
        />
        <Stat
          label="Compra por debajo de"
          value={buy ? price(buy.price) : item.vendor !== null ? price(item.vendor) : '—'}
          tone="link"
          note={buy ? `deja un 40% en ${buyRecipe?.name ?? 'su mejor receta'}` : item.vendor !== null ? 'precio fijo de vendedor' : 'ninguna receta rentable lo usa'}
        />
        <Stat
          label="Ventas estimadas al día"
          value={approx(item.sold)}
          note={item.sold === null ? 'hacen falta 6 horas de fotos' : item.sold > 0 ? `las ${int(item.qty)} anunciadas, en ${approx((item.qty / item.sold) * 24)} h` : 'sin ventas observadas'}
        />
      </section>
      <section aria-label="Historial de precio" className="card pad">
        <div className="wrap" style={{ justifyContent: 'space-between', gap: 12 }}>
          <h2>Precio por unidad{detail ? `, ${period === 'todo' ? `últimos ${historyLabel(detail.hours ?? 0)}` : PERIODS.find((p) => p.key === period)!.label}` : ''}</h2>
          <div role="group" aria-label="Periodo" className="wrap" style={{ gap: 4 }}>
            {PERIODS.map((p) => (
              <button key={p.key} type="button" className="btn small-btn" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</button>
            ))}
          </div>
        </div>
        {error && <p className="notice" role="alert">{error}</p>}
        {!detail && !error && <Spinner label="Cargando historial" />}
        {detail && pts.length < 2 && <p className="empty">Solo hay una foto de este objeto. El gráfico aparece a partir de la segunda.</p>}
        {detail && pts.length >= 2 && <PriceChart pts={pts} buyPrice={buy?.price ?? null} name={name} />}
        <div className="legend">
          <span><span aria-hidden="true" style={{ width: 20, height: 3, background: '#0F2B46' }} />Precio mínimo por hora</span>
          <span><span aria-hidden="true" style={{ width: 20, borderTop: '2px dashed #8A8A8A' }} />Mediana móvil de 3 días</span>
          {buy && <span><span aria-hidden="true" style={{ width: 20, height: 2, background: '#BC4B09' }} />Tu precio de compra</span>}
        </div>
      </section>
      <div className="row">
        <section aria-label="Mejor momento para comprar" className="card pad" style={{ flex: '999 1 520px' }}>
          <h2>Mejor momento para comprar</h2>
          {detail?.heat ? (
            <Heatmap heat={detail.heat} />
          ) : (
            <MissingData hours={detail?.hours ?? 0} needed={latest.minDaysForTiming * 24} what="saber a qué hora y qué día está más barato" />
          )}
        </section>
        <section aria-label="Anuncios disponibles por precio" className="card pad" style={{ flex: '1 1 320px', gap: 8 }}>
          <h2>Cuánto hay a cada precio</h2>
          {detail?.depth.map(([limit, qty], i) => (
            <div className="depth-row" key={i}>
              <span style={{ flex: '0 0 104px', whiteSpace: 'nowrap' }}>hasta {price(limit)}</span>
              <div aria-hidden="true" className="depth-track">
                <div className="depth-fill" style={{ width: `${maxDepth ? Math.max(2, (qty / maxDepth) * 100) : 0}%`, background: ['#0F2B46', '#0F2B46', '#7F9EBF', '#7F9EBF', '#B4C8DC'][i] }} />
              </div>
              <span style={{ flex: '0 0 64px', textAlign: 'right' }}>{int(qty)}</span>
            </div>
          ))}
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, fontSize: 13 }}>
            Comprar
            <input type="number" min={1} value={units} onChange={(e) => setUnits(Math.max(1, Number(e.target.value) || 1))} style={{ width: 96 }} />
            unidades
          </label>
          <p className="small" style={{ margin: 0, fontSize: 13 }}>
            {total === null
              ? `No hay ${int(units)} unidades entre los anuncios más baratos.`
              : `Te cuesta ${price(Math.round(total / units))} de media por unidad, ${price(total)} en total.`}
          </p>
        </section>
      </div>
    </>
  );
}
