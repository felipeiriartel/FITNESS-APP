import { useEffect, useState } from 'react';
import { configOk, supabase } from './lib/supabase.js';
import { todayISO } from './lib/dates.js';
import { DataProvider, useData } from './data.jsx';
import Auth, { NuevaClave } from './pages/Auth.jsx';
import Today from './pages/Today.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import Progress from './pages/Progress.jsx';
import Settings from './pages/Settings.jsx';
import MealForm from './components/MealForm.jsx';
import QuickActions from './components/QuickActions.jsx';
import { ExerciseForm, FavoritesPicker, ProfileForm, WeightForm } from './components/forms.jsx';
import { ErrorBox, Icon, ToastProvider } from './components/ui.jsx';

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

  let contenido;
  if (!configOk) {
    contenido = (
      <div className="center-page">
        <div className="card auth stack">
          <h1>Falta configuración</h1>
          <p>Defina <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_KEY</code> en el archivo <code>.env</code> o en las variables de entorno de Netlify. Vea el README.</p>
        </div>
      </div>
    );
  } else if (session === undefined) {
    contenido = <Cargando texto="Abriendo Comedia…" />;
  } else if (!session) {
    contenido = <Auth />;
  } else if (recuperando) {
    contenido = <NuevaClave onDone={() => setRecuperando(false)} />;
  } else {
    contenido = (
      <DataProvider userId={session.user.id}>
        <Shell email={session.user.email} />
      </DataProvider>
    );
  }
  return <ToastProvider>{contenido}</ToastProvider>;
}

function Cargando({ texto }) {
  return (
    <div className="center-page">
      <div className="stack" style={{ alignItems: 'center' }}>
        <img src="/icon.svg" alt="" width="64" height="64" />
        <p className="muted">{texto}</p>
      </div>
    </div>
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
  const [accion, setAccion] = useState(null); // menu | comida | favoritas | ejercicio | peso

  if (loading) return <Cargando texto="Cargando sus datos…" />;
  if (error && !profile) {
    return (
      <div className="center-page">
        <div className="card auth stack">
          <h1>No se pudieron cargar los datos</h1>
          <ErrorBox>{error}</ErrorBox>
          <p className="muted">Revise su conexión e intente de nuevo. Si el problema sigue, verifique que la base de datos esté configurada (ver README).</p>
          <button className="btn primary block" onClick={() => window.location.reload()}>Reintentar</button>
        </div>
      </div>
    );
  }
  if (!profile || !weights.length || !metas) {
    return (
      <div className="app page">
        <div className="stack">
          <div className="brand"><img src="/icon.svg" alt="" /><h1 className="welcome-title">Bienvenido a Comedia</h1></div>
          <p className="muted">Con estos datos calculamos su gasto diario y su meta de calorías y proteína. Puede cambiarlos cuando quiera.</p>
          <section className="card">
            <ProfileForm inicial={profile} conPeso textoBoton="Comenzar" />
          </section>
        </div>
      </div>
    );
  }

  const irA = (id) => {
    setTab(id);
    window.scrollTo({ top: 0 });
  };
  const abrirDia = (iso) => {
    setFecha(iso);
    irA('hoy');
  };
  // Se registra en el día que se está viendo en "Hoy"; desde otras pestañas, en el día de hoy.
  const fechaRegistro = tab === 'hoy' ? fecha : todayISO();
  const cerrar = () => setAccion(null);

  return (
    <>
      <main className="app">
        <div className="page" key={tab}>
          {tab === 'hoy' && <Today fecha={fecha} setFecha={setFecha} abrir={setAccion} />}
          {tab === 'calendario' && <CalendarPage abrirDia={abrirDia} />}
          {tab === 'progreso' && <Progress abrir={setAccion} />}
          {tab === 'ajustes' && <Settings email={email} />}
        </div>
      </main>

      <nav className="tabbar" aria-label="Secciones">
        <div className="tabbar-inner">
          {TABS.slice(0, 2).map((t) => <Tab key={t.id} t={t} on={tab === t.id} onClick={() => irA(t.id)} />)}
          <div className="fab-wrap">
            <button className="fab" aria-label="Registrar" aria-expanded={accion === 'menu'} onClick={() => setAccion('menu')}>
              <Icon name="mas" stroke={3} />
            </button>
          </div>
          {TABS.slice(2).map((t) => <Tab key={t.id} t={t} on={tab === t.id} onClick={() => irA(t.id)} />)}
        </div>
      </nav>

      {accion === 'menu' && <QuickActions fecha={fechaRegistro} onClose={cerrar} abrir={setAccion} />}
      {accion === 'comida' && <MealForm fecha={fechaRegistro} onClose={cerrar} />}
      {accion === 'favoritas' && <FavoritesPicker fecha={fechaRegistro} onClose={cerrar} />}
      {accion === 'ejercicio' && <ExerciseForm fecha={fechaRegistro} onClose={cerrar} />}
      {accion === 'peso' && <WeightForm fecha={fechaRegistro} onClose={cerrar} />}
    </>
  );
}

function Tab({ t, on, onClick }) {
  return (
    <button className={`tab${on ? ' on' : ''}`} onClick={onClick} aria-current={on ? 'page' : undefined}>
      <Icon name={t.icon} stroke={on ? 2.4 : 2} />
      {t.label}
    </button>
  );
}
