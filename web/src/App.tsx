import { Spinner } from '@fluentui/react-components';
import { useHash, useLatest, useNow, useRecipes, useStored } from './data.ts';
import type { Latest } from './data.ts';
import { ago, historyLabel } from './format.ts';
import { Hoy } from './pages/Hoy.tsx';
import { Fabrica } from './pages/Fabrica.tsx';
import { Mercado } from './pages/Mercado.tsx';
import { Objeto } from './pages/Objeto.tsx';

const SECTIONS = [
  { path: '/hoy', label: 'Hoy' },
  { path: '/fabrica', label: 'Fábrica' },
  { path: '/mercado', label: 'Mercado' },
  { path: '/objeto', label: 'Objeto' },
] as const;

export function App() {
  const hash = useHash();
  const { data: latest, error } = useLatest();
  const now = useNow();
  const [lastItem, setLastItem] = useStored<number | null>('ultimoObjeto', null);
  const section = SECTIONS.find((s) => hash === s.path || hash.startsWith(`${s.path}/`))?.path ?? '/hoy';

  let page = null;
  if (latest) {
    if (section === '/hoy') page = <Hoy latest={latest} now={now} />;
    else if (section === '/fabrica') page = <Fabrica latest={latest} recipeId={Number(hash.split('/')[2]) || null} />;
    else if (section === '/mercado') page = <Mercado latest={latest} />;
    else {
      const id = Number(hash.split('/')[2]) || lastItem;
      page = <Objeto latest={latest} id={id} onView={setLastItem} />;
    }
  }

  return (
    <div className="shell">
      <nav className="nav" aria-label="Secciones">
        <div className="nav-title">Subastas</div>
        {SECTIONS.map((s) => (
          <a key={s.path} href={`#${s.path}`} aria-current={section === s.path ? 'page' : undefined} className="nav-link">
            {s.label}
          </a>
        ))}
        <NavFooter latest={latest} now={now} />
      </nav>
      <main className="main">
        {error && <p className="notice" role="alert">No se han podido cargar los datos: {error}</p>}
        {!latest && !error && <Spinner label="Cargando precios" />}
        {page}
      </main>
    </div>
  );
}

function NavFooter({ latest, now }: { latest: Latest | null; now: number }) {
  const { data: recipes } = useRecipes();
  return (
    <div className="nav-footer">
      <span>Alianza · PvP · Europa</span>
      {latest && <span>Última foto: {ago(latest.t, now)}</span>}
      {latest && <span>Historial: {historyLabel(latest.hours)}</span>}
      <span>Datos: API de Blizzard</span>
      {recipes?.skillSource === 'foreverdb' && <a href="https://foreverdb.net" style={{ color: '#C7D3E0' }}>Datos de ForeverDB.net</a>}
    </div>
  );
}
