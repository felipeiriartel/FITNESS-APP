import { useEffect, useState } from 'react';
import { configOk, supabase } from './lib/supabase.js';
import { todayISO } from './lib/dates.js';
import { DataProvider, useData } from './data.jsx';
import Auth, { NuevaClave } from './pages/Auth.jsx';
import Today from './pages/Today.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import Progress from './pages/Progress.jsx';
import Settings from './pages/Settings.jsx';
import { ProfileForm } from './components/forms.jsx';
import { ErrorBox, Icon } from './components/ui.jsx';

export default function App() {
  const [session, setSession] = useState(undefined);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    if (!configOk) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configOk) {
    return (
      <div className="center-page">
        <div className="card auth stack">
          <h1>Falta configuración</h1>
          <p>Defina <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_KEY</code> en el archivo <code>.env</code> o en las variables de entorno de Netlify. Vea el README.</p>
        </div>
      </div>
    );
  }
  if (session === undefined) return <div className="center-page muted">Cargando…</div>;
  if (!session) return <Auth />;
  if (recuperando) return <NuevaClave onDone={() => setRecuperando(false)} />;

  return (
    <DataProvider userId={session.user.id}>
      <Shell email={session.user.email} />
    </DataProvider>
  );
}

const TABS = [
  { id: 'hoy', label: 'Hoy', icon: 'hoy' },
  { id: 'calendario', label: 'Calendario', icon: 'calendario' },
  { id: 'progreso', label: 'Progreso', icon: 'progreso' },
  { id: 'ajustes', label: 'Ajustes', icon: 'ajustes' },
];

function Shell({ email }) {
  const { loading, error, profile, weights, metas } = useData();
  const [tab, setTab] = useState('hoy');
  const [fecha, setFecha] = useState(todayISO());

  if (loading) return <div className="center-page muted">Cargando sus datos…</div>;
  if (error && !profile) {
    return (
      <div className="center-page">
        <div className="card auth stack">
          <h1>No se pudieron cargar los datos</h1>
          <ErrorBox>{error}</ErrorBox>
          <p className="muted">Verifique que ejecutó la migración SQL en Supabase (ver README).</p>
        </div>
      </div>
    );
  }
  if (!profile || !weights.length || !metas) {
    return (
      <div className="app">
        <div className="stack">
          <div className="brand"><img src="/icon.svg" alt="" /><h1>Bienvenido a Comedia</h1></div>
          <p className="muted">Con estos datos calculamos su gasto diario y su meta de calorías y proteína. Puede cambiarlos cuando quiera.</p>
          <section className="card">
            <ProfileForm inicial={profile} conPeso textoBoton="Comenzar" />
          </section>
        </div>
      </div>
    );
  }

  const abrirDia = (iso) => {
    setFecha(iso);
    setTab('hoy');
    window.scrollTo(0, 0);
  };

  return (
    <>
      <main className="app">
        {tab === 'hoy' && <Today fecha={fecha} setFecha={setFecha} />}
        {tab === 'calendario' && <CalendarPage abrirDia={abrirDia} />}
        {tab === 'progreso' && <Progress />}
        {tab === 'ajustes' && <Settings email={email} />}
      </main>
      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}
              aria-current={tab === t.id ? 'page' : undefined}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
