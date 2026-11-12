import type { ReactNode } from 'react';
import { sparkPoints } from '../format.ts';

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'pos' | 'link' }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={tone === 'pos' ? { color: 'var(--ok)' } : tone === 'link' ? { color: 'var(--link)' } : undefined}>
        {value}
      </span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

export function Sparkline({ values, width = 88, height = 28 }: { values: readonly number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg aria-hidden="true" width={width} height={height} />;
  return (
    <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={sparkPoints(values, width, height)} fill="none" stroke="#0F2B46" strokeWidth="1.5" />
    </svg>
  );
}

const SIGNALS = [
  null,
  { label: 'Comprar', cls: 'buy' },
  { label: 'Esperar', cls: 'wait' },
  { label: 'Vender', cls: 'sell' },
] as const;

/** Señal de un objeto. Nunca solo color: siempre con texto. */
export function SignalTag({ signal, vendor, fixed }: { signal: number; vendor?: boolean; fixed?: boolean }) {
  const s = vendor ? { label: 'Fijo', cls: 'wait' } : (SIGNALS[signal] ?? { label: 'Sin señal', cls: 'wait' });
  return <span className={`tag ${s.cls}${fixed ? ' fixed' : ''}`}>{s.label}</span>;
}

export function Star({ on, name, onToggle }: { on: boolean; name: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="star"
      aria-pressed={on}
      aria-label={`${on ? 'Quitar de mi lista' : 'Añadir a mi lista'}: ${name}`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
        <path
          d="M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z"
          fill={on ? '#0F2B46' : 'none'} stroke="#0F2B46" strokeWidth="1.5" strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function SortHeader<K extends string>({
  label, column, sort, onSort, numeric,
}: { label: string; column: K; sort: { key: K; dir: 1 | -1 }; onSort: (key: K) => void; numeric?: boolean }) {
  const active = sort.key === column;
  return (
    <th scope="col" className={numeric ? 'num' : undefined} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="th-sort" onClick={() => onSort(column)}>
        {label}{active ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}

/** Aviso de datos insuficientes, en lugar de mostrar ceros. */
export function MissingData({ hours, needed, what }: { hours: number; needed: number; what: string }) {
  if (hours >= needed) return null;
  const left = Math.ceil(needed - hours);
  const text = left >= 48 ? `${Math.ceil(left / 24)} días` : `${left} ${left === 1 ? 'hora' : 'horas'}`;
  return <p className="notice">Faltan {text} de datos para {what}.</p>;
}
