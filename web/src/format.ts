import { formatCopper } from '../../engine/money.ts';

export const price = (copper: number | null | undefined): string =>
  copper === null || copper === undefined ? '—' : formatCopper(copper);

const intFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });
const decFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' });

export const int = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : intFmt.format(n));

/** Cifra estimada: siempre con «~». */
export const approx = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `~${n < 10 ? decFmt.format(n) : intFmt.format(n)}`;

export const percent = (fraction: number | null | undefined, sign = true): string => {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  const v = Math.round(fraction * 100);
  return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}${Math.abs(v)}%`;
};

export const signedPrice = (copper: number | null | undefined): string =>
  copper === null || copper === undefined ? '—' : copper < 0 ? `−${formatCopper(-copper)}` : `+${formatCopper(copper)}`;

/** Duración estimada a partir de días. */
export function duration(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return '—';
  const hours = days * 24;
  if (hours < 1) return 'menos de 1 h';
  if (hours < 20) return `~${Math.round(hours)} h`;
  return `~${decFmt.format(days)} ${days < 1.05 ? 'día' : 'días'}`;
}

export function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} días`;
}

export function historyLabel(hours: number): string {
  return hours < 48 ? `${Math.round(hours)} h` : `${Math.floor(hours / 24)} días`;
}

export const itemName = (id: number, name: string | null | undefined): string => name || `Objeto ${id}`;

export const RELIABILITY = ['Sin datos', 'Baja', 'Media', 'Alta'] as const;

export function sparkPoints(values: readonly number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pad = 4;
  return values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
      const y = hi === lo ? height / 2 : pad + (1 - (v - lo) / span) * (height - pad * 2);
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}
