import { useMemo, useState } from 'react';
import { price } from '../format.ts';
import type { ItemDetail } from '../data.ts';

const W = 1000;
const H = 260;
const LEFT = 64;
const RIGHT = 990;
const TOP = 20;
const BOTTOM = 215;

const dayFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });
const timeFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

/** Gráfico de precio: mínimo por hora, mediana móvil de 3 días y precio de compra. */
export function PriceChart({ pts, buyPrice, name }: { pts: ItemDetail['pts']; buyPrice: number | null; name: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const geo = useMemo(() => {
    if (pts.length === 0) return null;
    const t0 = pts[0]![0];
    const t1 = pts[pts.length - 1]![0];
    // Escala sobre la parte central de la serie para que un anuncio disparatado no la aplaste.
    const mins = pts.map((p) => p[1]).sort((a, b) => a - b);
    const p95 = mins[Math.floor((mins.length - 1) * 0.95)]!;
    const values = [p95, mins[0]!, ...pts.map((p) => p[3])];
    if (buyPrice !== null) values.push(buyPrice);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const pad = (hi - lo) * 0.12 || hi * 0.1 || 1;
    lo = Math.max(0, lo - pad);
    hi += pad;
    const x = (t: number) => (t1 === t0 ? (LEFT + RIGHT) / 2 : LEFT + ((t - t0) / (t1 - t0)) * (RIGHT - LEFT));
    const y = (v: number) => BOTTOM - ((Math.min(v, hi) - lo) / (hi - lo)) * (BOTTOM - TOP);
    const line = (index: 1 | 3) => pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[index]).toFixed(1)}`).join(' ');
    const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
    return { t0, t1, x, y, line, ticks };
  }, [pts, buyPrice]);

  if (!geo) return null;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const hp = hover === null ? null : pts[hover]!;
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    let bestDist = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(geo.x(p[0]) - px);
      if (d < bestDist) { best = i; bestDist = d; }
    });
    setHover(best);
  };
  const label =
    `Gráfico de precio de ${name}: de ${price(first[1])} el ${dayFmt.format(first[0] * 60000)} ` +
    `a ${price(last[1])} en la última foto, con ${pts.length} fotos.`;

  return (
    <div className="chart">
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {geo.ticks.map((v) => (
          <g key={v}>
            <line x1={LEFT} y1={geo.y(v)} x2={RIGHT} y2={geo.y(v)} stroke="#EBEBEB" />
            <text x={LEFT - 8} y={geo.y(v) + 4} textAnchor="end" fontSize="12" fill="#616161">{price(Math.round(v))}</text>
          </g>
        ))}
        {pts.length > 1 && <polyline fill="none" stroke="#8A8A8A" strokeWidth="2" strokeDasharray="6 5" points={geo.line(3)} />}
        {buyPrice !== null && <line x1={LEFT} y1={geo.y(buyPrice)} x2={RIGHT} y2={geo.y(buyPrice)} stroke="#BC4B09" strokeWidth="1.5" />}
        {pts.length > 1 && <polyline fill="none" stroke="#0F2B46" strokeWidth="2.5" strokeLinejoin="round" points={geo.line(1)} />}
        <circle cx={geo.x(last[0])} cy={geo.y(last[1])} r="5" fill="#0F2B46" />
        {hp && <line x1={geo.x(hp[0])} y1={TOP} x2={geo.x(hp[0])} y2={BOTTOM} stroke="#8A8A8A" strokeWidth="1" />}
        {hp && <circle cx={geo.x(hp[0])} cy={geo.y(hp[1])} r="4" fill="#fff" stroke="#0F2B46" strokeWidth="2" />}
        <text x={LEFT} y={H - 10} fontSize="12" fill="#616161">{dayFmt.format(geo.t0 * 60000)}</text>
        {geo.t1 - geo.t0 > 4 * 1440 && (
          <text x={(LEFT + RIGHT) / 2} y={H - 10} textAnchor="middle" fontSize="12" fill="#616161">
            {dayFmt.format(((geo.t0 + geo.t1) / 2) * 60000)}
          </text>
        )}
        <text x={RIGHT} y={H - 10} textAnchor="end" fontSize="12" fill="#616161">última foto</text>
      </svg>
      {hp && (
        <div className="chart-tip" style={{ left: `${(geo.x(hp[0]) / W) * 100}%`, transform: `translateX(${geo.x(hp[0]) > W * 0.7 ? '-105%' : '8px'})` }}>
          <strong>{price(hp[1])}</strong> · mediana {price(hp[3])}<br />{timeFmt.format(hp[0] * 60000)}
        </div>
      )}
    </div>
  );
}

const SHADES = ['#DCE6F0', '#B4C8DC', '#7F9EBF', '#4A719C', '#0F2B46'];
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Mapa de calor: más oscuro es más barato. */
export function Heatmap({ heat }: { heat: (number | null)[][] }) {
  const summary = useMemo(() => {
    const cells = heat.flatMap((row, dow) => row.map((v, hour) => ({ v, dow, hour }))).filter((c): c is { v: number; dow: number; hour: number } => c.v !== null);
    if (cells.length === 0) return null;
    const sorted = [...cells].sort((a, b) => a.v - b.v);
    const cut = (q: number) => sorted[Math.floor((sorted.length - 1) * q)]!.v;
    const limits = [cut(0.8), cut(0.6), cut(0.4), cut(0.2)];
    // Hora más barata y más cara, promediando los siete días.
    const byHour = Array.from({ length: 24 }, (_, hour) => {
      const vals = cells.filter((c) => c.hour === hour).map((c) => c.v);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    });
    const hours = byHour.map((v, hour) => ({ v, hour })).filter((h): h is { v: number; hour: number } => h.v !== null);
    const cheap = hours.reduce((a, b) => (b.v < a.v ? b : a));
    const dear = hours.reduce((a, b) => (b.v > a.v ? b : a));
    return { limits, cheap, dear, best: sorted[0]! };
  }, [heat]);
  if (!summary) return null;
  const shade = (v: number) => SHADES[summary.limits.findIndex((l) => v >= l) === -1 ? 4 : summary.limits.findIndex((l) => v >= l)]!;
  const saving = 1 - summary.cheap.v / summary.dear.v;
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Más oscuro es más barato. Hacia las {summary.cheap.hour} h cuesta un {Math.round(saving * 100)}% menos que hacia las {summary.dear.hour} h;
        la franja más barata de la semana es el {DAY_NAMES[summary.best.dow]} a las {summary.best.hour} h.
      </p>
      <div className="scroll-x">
        <div className="heat">
          {heat.map((row, dow) => (
            <div className="heat-row" key={dow}>
              <span className="heat-day">{DAYS[dow]}</span>
              {row.map((v, hour) => (
                <span
                  key={hour}
                  className="heat-cell"
                  title={v === null ? `${DAY_NAMES[dow]} ${hour} h: sin datos` : `${DAY_NAMES[dow]} ${hour} h: ${Math.round((v - 1) * 100)}% frente a la mediana`}
                  style={{ background: v === null ? '#F5F5F5' : shade(v) }}
                />
              ))}
            </div>
          ))}
          <div className="small" style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 35 }}>
            <span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span>
          </div>
        </div>
      </div>
    </>
  );
}
