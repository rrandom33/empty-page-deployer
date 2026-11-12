import { useMemo, useState } from 'react';
import { useStored, useWatchlist } from '../data.ts';
import type { Item, Latest } from '../data.ts';
import { MissingData, SortHeader, Sparkline, Star } from '../components/common.tsx';
import { approx, int, itemName, percent, price } from '../format.ts';

const CATEGORIES: { key: string; label: string; test: (i: Item) => boolean }[] = [
  { key: 'todo', label: 'Todo', test: () => true },
  { key: 'lista', label: 'Mi lista', test: () => true },
  { key: 'cuero', label: 'Cuero y pieles', test: (i) => i.cls === 7 && i.sub === 6 },
  { key: 'metal', label: 'Metal y piedra', test: (i) => i.cls === 7 && i.sub === 7 },
  { key: 'hierbas', label: 'Hierbas', test: (i) => i.cls === 7 && i.sub === 9 },
  { key: 'telas', label: 'Telas', test: (i) => i.cls === 7 && i.sub === 5 },
  { key: 'consumibles', label: 'Consumibles', test: (i) => i.cls === 0 },
  { key: 'equipo', label: 'Equipo', test: (i) => i.cls === 2 || i.cls === 4 },
];

type SortKey = 'name' | 'min' | 'ref' | 'diff' | 'qty' | 'sold';
const diff = (i: Item) => (i.ref ? (i.min - i.ref) / i.ref : null);
const PAGE = 50;

export function Mercado({ latest }: { latest: Latest }) {
  const watch = useWatchlist();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useStored('mercado.categoria', 'todo');
  const [belowOnly, setBelowOnly] = useStored('mercado.bajoMediana', false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'qty', dir: -1 });
  const [shown, setShown] = useState(PAGE);
  // La mediana de 3 días no dice nada hasta tener al menos un día de fotos.
  const hasRef = latest.hours >= 24;

  const rows = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.key === category) ?? CATEGORIES[0]!;
    const q = query.trim().toLocaleLowerCase('es');
    const list = latest.items.filter((i) => {
      if (category === 'lista' && !watch.list.includes(i.id)) return false;
      if (!cat.test(i)) return false;
      if (q && !itemName(i.id, i.name).toLocaleLowerCase('es').includes(q)) return false;
      if (belowOnly && !(hasRef && i.ref !== null && i.min < i.ref)) return false;
      return true;
    });
    const value = (i: Item): number | string | null =>
      sort.key === 'name' ? itemName(i.id, i.name) : sort.key === 'diff' ? diff(i) : i[sort.key];
    return list.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
      if (typeof va === 'string') return va.localeCompare(vb as string, 'es') * sort.dir;
      return ((va as number) - (vb as number)) * sort.dir;
    });
  }, [latest, category, query, belowOnly, sort, watch.list, hasRef]);

  const onSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 }));
    setShown(PAGE);
  };
  const visible = rows.slice(0, shown);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Mercado</h1>
          <p>Todos los objetos de la casa de subastas. Marca la estrella para seguirlos en tu lista.</p>
        </div>
        <label className="field" style={{ flex: '1 1 280px', maxWidth: 360 }}>
          Buscar objeto
          <input type="search" placeholder="Nombre del objeto" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        </label>
      </header>
      <MissingData hours={latest.hours} needed={latest.minHoursForSignals} what="dar señales y medianas fiables" />
      <div className="wrap" style={{ gap: '12px 24px' }}>
        <div role="group" aria-label="Categoría" className="wrap">
          {CATEGORIES.map((c) => (
            <button key={c.key} type="button" className="chip" aria-pressed={category === c.key} onClick={() => { setCategory(c.key); setShown(PAGE); }}>
              {c.label}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={belowOnly} onChange={(e) => setBelowOnly(e.target.checked)} />
          Solo por debajo de su mediana
        </label>
      </div>
      <section aria-label="Objetos" className="card">
        <div className="scroll-x">
          <table className="grid tight" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Seguir</span></th>
                <SortHeader label="Objeto" column="name" sort={sort} onSort={onSort} />
                <SortHeader label="Precio mínimo" column="min" sort={sort} onSort={onSort} numeric />
                <SortHeader label="Mediana 3 días" column="ref" sort={sort} onSort={onSort} numeric />
                <SortHeader label="Diferencia" column="diff" sort={sort} onSort={onSort} numeric />
                <SortHeader label="Unidades" column="qty" sort={sort} onSort={onSort} numeric />
                <SortHeader label="Ventas al día" column="sold" sort={sort} onSort={onSort} numeric />
                <th scope="col">7 días</th>
                <th scope="col">Blackwater</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const d = hasRef ? diff(i) : null;
                const name = itemName(i.id, i.name);
                return (
                  <tr key={i.id}>
                    <td style={{ width: 44 }}><Star on={watch.has(i.id)} name={name} onToggle={() => watch.toggle(i.id)} /></td>
                    <td><a className="item-link" href={`#/objeto/${i.id}`}>{name}</a></td>
                    <td className="num strong">{price(i.min)}</td>
                    <td className="num">{hasRef ? price(i.ref) : '—'}</td>
                    <td className="num strong" style={{ color: d === null ? undefined : d <= -0.1 ? '#0F548C' : d >= 0.1 ? '#8A3707' : '#424242' }}>
                      {percent(d)}
                    </td>
                    <td className="num">{int(i.qty)}</td>
                    <td className="num">{approx(i.sold)}</td>
                    <td><Sparkline values={i.spark} /></td>
                    <td className="muted">{latest.blackwater === null ? '—' : i.bw === null ? 'sin anuncios' : price(i.bw)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="empty">
            {category === 'lista' && watch.list.length === 0 ? 'Tu lista está vacía. Marca la estrella de un objeto para seguirlo.' : 'Ningún objeto coincide con el filtro.'}
          </p>
        )}
        <div className="wrap" style={{ justifyContent: 'space-between', padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>
          <span>
            {int(visible.length)} de {int(rows.length)} objetos con precio
            {latest.blackwater === null ? ' · La casa de Blackwater está sin fijar' : ''}
          </span>
          {shown < rows.length && <button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>Ver más</button>}
        </div>
      </section>
    </>
  );
}
