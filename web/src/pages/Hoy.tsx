import { useMemo } from 'react';
import { allocate } from '../../../engine/analysis.ts';
import { useKnownRecipes, useStored, useToday, useWatchlist } from '../data.ts';
import type { Latest, TodayAction } from '../data.ts';
import { MissingData, SignalTag, Sparkline, Stat } from '../components/common.tsx';
import { duration, historyLabel, int, itemName, percent, price, RELIABILITY, signedPrice } from '../format.ts';

const TYPES = {
  fabricar: { label: 'Fabricar', cls: 'buy' },
  ganga: { label: 'Ganga', cls: 'sell' },
  material: { label: 'Comprar material', cls: 'wait' },
} as const;

export function Hoy({ latest, now }: { latest: Latest; now: number }) {
  const { data: today } = useToday();
  const manual = useKnownRecipes();
  const watch = useWatchlist();
  const [gold, setGold] = useStored('oro', 85);
  const [allRecipes, setAllRecipes] = useStored('hoy.todasLasRecetas', false);

  const name = (id: number) => itemName(id, today?.names[id] ?? latest.byId.get(id)?.name);
  const hasKnownInfo = !!today && (today.actions.some((a) => a.type !== 'ganga' && a.known !== null) || manual.list.length > 0);

  const plan = useMemo(() => {
    if (!today) return [];
    const eligible = today.actions.filter((a) => {
      if ((a.sold ?? 0) < today.minSold) return false;
      if (a.type === 'ganga' || allRecipes || !hasKnownInfo) return true;
      return a.known ?? (a.recipe !== undefined && manual.has(a.recipe));
    });
    const alloc = allocate(
      eligible.map((a) => ({ unitInvest: a.unitInvest, unitProfit: a.unitProfit, maxUnits: a.maxUnits, soldPerDay: a.sold ?? 0 })),
      gold * 10000,
      today.maxActions,
    );
    return alloc.map((p) => ({ ...p, action: eligible[p.index]! })).sort((a, b) => b.goldPerDay - a.goldPerDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, gold, allRecipes, hasKnownInfo, manual.list]);

  const invest = plan.reduce((s, p) => s + p.invest, 0);
  const profit = plan.reduce((s, p) => s + p.profit, 0);
  const days = plan.length ? Math.max(...plan.map((p) => p.days)) : null;
  const nextMin = Math.round((Date.parse(latest.t) + 3_600_000 - now) / 60000);
  const ready = latest.hours >= latest.minHoursForSignals;
  const watched = watch.list.map((id) => latest.byId.get(id)).filter((i) => i !== undefined);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Hoy</h1>
          <p>Qué hacer ahora con tu oro, ordenado por oro ganado al día.</p>
        </div>
        <label className="field">
          Oro disponible
          <input type="number" min={0} inputMode="numeric" value={gold} onChange={(e) => setGold(Math.max(0, Number(e.target.value) || 0))} style={{ width: 120 }} />
        </label>
      </header>
      <MissingData hours={latest.hours} needed={latest.minHoursForSignals} what="dar señales" />
      <section aria-label="Resumen del plan" className="stats">
        <Stat label="Inversión del plan" value={plan.length ? price(Math.round(invest)) : '—'} note={`de ${int(gold)}o disponibles`} />
        <Stat label="Ganancia neta estimada" value={plan.length ? `~${signedPrice(Math.round(profit))}` : '—'} tone={plan.length ? 'pos' : undefined} note={`tras comisión del ${Math.round(latest.cut * 100)}% y depósitos`} />
        <Stat label="Tiempo hasta recuperar el oro" value={duration(days)} note="según ventas estimadas" />
        <Stat label="Próxima foto de precios" value={nextMin > 0 ? `~${nextMin} min` : 'en curso'} note="Blizzard publica una por hora" />
      </section>
      <div className="row">
        <section aria-label="Acciones recomendadas" className="card" style={{ flex: '999 1 640px' }}>
          <div className="card-head">
            <h2>Acciones recomendadas</h2>
            <label className="check small" style={{ minHeight: 0 }}>
              <input type="checkbox" checked={allRecipes} onChange={(e) => setAllRecipes(e.target.checked)} />
              Incluir recetas que no conozco · mínimo {today?.minSold ?? 20} ventas al día
            </label>
          </div>
          {plan.length > 0 ? (
            <div className="scroll-x">
              <table className="grid" style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th scope="col">Tipo</th><th scope="col">Acción</th><th scope="col" className="num">Inversión</th>
                    <th scope="col" className="num">Ganancia neta</th><th scope="col" className="num">Se vende en</th>
                    <th scope="col" className="num">Oro al día</th><th scope="col">Fiabilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((p) => {
                    const a = p.action;
                    return (
                      <tr key={`${a.type}-${a.item}-${a.recipe ?? 0}`}>
                        <td><span className={`tag ${TYPES[a.type].cls}`}>{TYPES[a.type].label}</span></td>
                        <td>
                          <a className="item-link" href={a.type === 'fabricar' ? `#/fabrica/${a.recipe}` : `#/objeto/${a.item}`}>
                            {a.type === 'fabricar' ? a.name : name(a.item)} × {int(p.units)}
                          </a>
                          <div className="muted" style={{ fontSize: 13 }}>{describe(a, p.units, name, (id) => latest.byId.get(id)?.min ?? null)}</div>
                        </td>
                        <td className="num">{price(Math.round(p.invest))}</td>
                        <td className="num strong pos">~{signedPrice(Math.round(p.profit))}</td>
                        <td className="num">{duration(p.days)}</td>
                        <td className="num strong">~{price(Math.round(p.goldPerDay))}</td>
                        <td className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{RELIABILITY[a.rel]} · {historyLabel(latest.hours)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">
              {!ready
                ? 'Todavía no hay recomendaciones. Mientras se acumula historial, en Fábrica ya puedes ver el coste y el beneficio de cada receta con los precios actuales.'
                : 'Ninguna acción cumple los criterios con el oro disponible.'}
              {' '}<a href="#/fabrica">Ir a Fábrica</a>
            </p>
          )}
        </section>
        <section aria-label="Tu lista" className="card pad" style={{ flex: '1 1 320px', gap: 4 }}>
          <div className="wrap" style={{ justifyContent: 'space-between', paddingBottom: 8 }}>
            <h2>Tu lista</h2>
            <a href="#/mercado" style={{ fontSize: 13 }}>Añadir objetos</a>
          </div>
          {watch.list.length === 0 && <p className="muted" style={{ margin: 0 }}>Marca la estrella de un objeto en Mercado para seguirlo aquí.</p>}
          {watched.map((i) => {
            const diff = latest.hours >= 24 && i.ref ? (i.min - i.ref) / i.ref : null;
            const vendor = i.vendor !== null && i.vendor <= i.min;
            return (
              <a key={i.id} className="watch-row" href={`#/objeto/${i.id}`}>
                <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span className="strong">{itemName(i.id, i.name)}</span>
                  <span className="small">{price(i.min)} · {vendor ? 'vendedor' : diff === null ? 'sin mediana todavía' : `${percent(diff)} frente a 3 días`}</span>
                </div>
                <Sparkline values={i.spark} width={72} />
                <SignalTag signal={i.signal} vendor={vendor} fixed />
              </a>
            );
          })}
          {watch.list.length > watched.length && (
            <p className="small" style={{ margin: '8px 0 0' }}>{watch.list.length - watched.length} de tu lista no tienen anuncios en la última foto.</p>
          )}
        </section>
      </div>
    </>
  );
}

function describe(a: TodayAction, units: number, name: (id: number) => string, minOf: (id: number) => number | null): string {
  if (a.type === 'fabricar') {
    const sale = a.sale != null ? ` y publica a ${price(a.sale)}` : '';
    const current = a.main ? minOf(a.main.item) : null;
    // El precio límite solo se cita si el material está ahora por debajo de él.
    return a.main && current !== null && current <= a.main.price
      ? `Compra ${int((a.main.qty ?? 1) * units)} ${name(a.main.item)} por debajo de ${price(a.main.price)}${sale}`
      : `Materiales a ${price(Math.round(a.unitInvest))} por unidad${sale}`;
  }
  if (a.type === 'ganga') {
    return `A ${price(Math.round(a.unitInvest))} de media, un ${percent(a.discount, false)} bajo la mediana de 3 días` +
      (a.next ? `; el siguiente anuncio está a ${price(a.next)}` : '');
  }
  return `Está en su franja barata; su mediana de 3 días es ${price(a.ref)}. Para ${a.name}.`;
}
