import { useEffect, useState } from 'react';
import { configOk, supabase } from './lib/supabase.js';
import { todayISO } from './lib/dates.js';
import { DataProvider, useData } from './data.jsx';
import Auth, { NuevaClave } from './pages/Auth.jsx';
import Today from './pages/Today.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import Progress from './pages/Progress.jsx';
import Settings from './pages/Settings.jsx';
import Ranking from './pages/Ranking.jsx';
import MealForm, { desdeComida } from './components/MealForm.jsx';
import { SocialProvider, useSocial } from './social.jsx';
import { Paywall } from './components/Suscripcion.jsx';
import { AmigosSheet } from './components/Amigos.jsx';
import QuickActions from './components/QuickActions.jsx';
import BarcodeScanner from './components/BarcodeScanner.jsx';
import Suggestions from './components/Suggestions.jsx';
import CopyDay from './components/CopyDay.jsx';
import { ExerciseForm, FavoritesPicker, ProfileForm, WeightForm } from './components/forms.jsx';
import { ErrorBox, Icon, Logo, ToastProvider, useToast } from './components/ui.jsx';

// Enlace de invitación (?invita=CODIGO): se guarda para usarlo al crear la cuenta.
if (typeof window !== 'undefined') {
  const codigo = new URLSearchParams(window.location.search).get('invita');
  if (codigo) {
    try { localStorage.setItem('comidia_invita', codigo.trim().toUpperCase()); } catch { /* sin almacenamiento */ }
    const u = new URL(window.location.href);
    u.searchParams.delete('invita');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
  }
}

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
    contenido = <Cargando texto="Abriendo Comidia…" />;
  } else if (!session) {
    contenido = <Auth />;
  } else if (recuperando) {
    contenido = <NuevaClave onDone={() => setRecuperando(false)} />;
  } else {
    contenido = (
      <DataProvider userId={session.user.id}>
        <SocialProvider>
          <Shell email={session.user.email} />
        </SocialProvider>
      </DataProvider>
    );
  }
  return <ToastProvider>{contenido}</ToastProvider>;
}

function Cargando({ texto }) {
  return (
    <div className="center-page">
      <div className="stack" style={{ alignItems: 'center' }}>
        <Logo alto={44} className="logo-cargando" />
        <p className="muted">{texto}</p>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'hoy', label: 'Hoy', icon: 'hoy' },
  { id: 'calendario', label: 'Calendario', icon: 'calendario' },
  { id: 'ranking', label: 'Ranking', icon: 'trofeo' },
  { id: 'progreso', label: 'Progreso', icon: 'progreso' },
];

function Shell({ email }) {
  const { loading, error, profile, weights, metas } = useData();
  const { sus, solicitudes, cargarRecibidas, sincronizar } = useSocial();
  const toast = useToast();
  const [tab, setTab] = useState('hoy');
  const [desde, setDesde] = useState('hoy'); // pestaña anterior, para volver desde Ajustes
  const [fecha, setFecha] = useState(todayISO());
  // { id: menu | comida | texto | codigo | sugerir | favoritas | ejercicio | peso, datos }
  const [accion, setAccion] = useState(null);

  // Vuelta desde Flow (?suscripcion=ok|cancelado|error).
  useEffect(() => {
    const u = new URL(window.location.href);
    const r = u.searchParams.get('suscripcion');
    if (!r) return;
    u.searchParams.delete('suscripcion');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    if (r === 'ok') {
      toast('¡Listo! Su suscripción quedó activa.');
      sincronizar();
    } else if (r === 'cancelado') {
      toast('No se registró la tarjeta. Puede intentarlo de nuevo en Ajustes.', 'error');
    } else {
      toast('Hubo un problema con el pago. Intente de nuevo en Ajustes.', 'error');
    }
  }, [toast, sincronizar]);

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
      <div className="app solo page">
        <div className="stack">
          <div className="brand"><Logo alto={40} /><h1 className="welcome-title">Bienvenido</h1></div>
          <p className="muted">Con estos datos calculamos su gasto diario y su meta de calorías y proteína. Puede cambiarlos cuando quiera.</p>
          <section className="card">
            <ProfileForm inicial={profile} conPeso textoBoton="Comenzar" />
          </section>
        </div>
      </div>
    );
  }

  if (sus && !sus.acceso) return <Paywall />;

  const irA = (id) => {
    if (id !== tab) setDesde(tab);
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
  const abrir = (id, datos) => setAccion({ id, datos });
  const a = accion?.id;
  // Posición del indicador: las pestañas ocupan las columnas 0, 1, 3 y 4 (la 2 es el botón +).
  const posTab = { hoy: 0, calendario: 1, ranking: 3, progreso: 4 }[tab] ?? -1;

  return (
    <>
      <main className="app">
        <div className="page" key={tab}>
          {tab === 'hoy' && <Today fecha={fecha} setFecha={setFecha} abrir={abrir} irAProgreso={() => irA('progreso')} irAAjustes={() => irA('ajustes')} />}
          {tab === 'calendario' && <CalendarPage abrirDia={abrirDia} />}
          {tab === 'ranking' && <Ranking abrir={abrir} />}
          {tab === 'progreso' && <Progress abrir={abrir} irAAjustes={() => irA('ajustes')} />}
          {tab === 'ajustes' && <Settings email={email} volver={() => irA(desde === 'ajustes' ? 'hoy' : desde)} />}
        </div>
      </main>

      <nav className="tabbar" aria-label="Secciones">
        <div className="tabbar-inner">
          <span className={`tab-indicador${posTab < 0 ? ' oculto' : ''}`} style={{ '--i': Math.max(posTab, 0) }} aria-hidden="true" />
          {TABS.slice(0, 2).map((t) => <Tab key={t.id} t={t} on={tab === t.id} onClick={() => irA(t.id)} />)}
          <div className="fab-wrap">
            <button className="fab" aria-label="Registrar" aria-expanded={a === 'menu'} onClick={() => abrir('menu')}>
              <Icon name="mas" stroke={3} />
            </button>
          </div>
          {TABS.slice(2).map((t) => <Tab key={t.id} t={t} on={tab === t.id} aviso={t.id === 'ranking' && solicitudes.length > 0} onClick={() => irA(t.id)} />)}
        </div>
      </nav>

      {a === 'menu' && <QuickActions fecha={fechaRegistro} onClose={cerrar} abrir={abrir} />}
      {a === 'comida' && (
        <MealForm key={accion.datos?.editar?.id ?? 'foto'} fecha={accion.datos?.editar?.log_date ?? fechaRegistro} onClose={cerrar}
          inicial={accion.datos?.inicial} editar={accion.datos?.editar} />
      )}
      {a === 'compartida' && (
        <MealForm key={`compartida-${accion.datos.id}`} fecha={accion.datos.log_date}
          inicial={{ ...desdeComida(accion.datos), titulo: `Comida de ${accion.datos.de_nombre.split(' ')[0]}`, compartida: true }}
          onClose={async (ok) => {
            if (ok) {
              await supabase.from('comidas_compartidas').update({ estado: 'aceptada', respondida_at: new Date().toISOString() }).eq('id', accion.datos.id);
              cargarRecibidas();
            }
            cerrar();
          }} />
      )}
      {a === 'amigos' && <AmigosSheet onClose={cerrar} />}
      {a === 'copiar' && <CopyDay fecha={fechaRegistro} onClose={cerrar} />}
      {a === 'texto' && <MealForm key="texto" modo="texto" fecha={fechaRegistro} onClose={cerrar} />}
      {a === 'codigo' && <BarcodeScanner fecha={fechaRegistro} onClose={cerrar} abrir={abrir} />}
      {a === 'sugerir' && <Suggestions fecha={fechaRegistro} onClose={cerrar} abrir={abrir} />}
      {a === 'favoritas' && <FavoritesPicker fecha={fechaRegistro} onClose={cerrar} />}
      {a === 'ejercicio' && (
        <ExerciseForm key={accion.datos?.existente?.id ?? 'nuevo'} fecha={fechaRegistro} onClose={cerrar} existente={accion.datos?.existente} />
      )}
      {a === 'peso' && <WeightForm fecha={fechaRegistro} onClose={cerrar} />}
    </>
  );
}

function Tab({ t, on, onClick, aviso }) {
  return (
    <button className={`tab${on ? ' on' : ''}`} onClick={onClick} aria-current={on ? 'page' : undefined}
      aria-label={aviso ? `${t.label}, solicitud de amistad pendiente` : undefined}>
      <span className="tab-ico"><Icon name={t.icon} stroke={on ? 2.4 : 2} />{aviso && <i className="tab-aviso" aria-hidden="true" />}</span>
      {t.label}
    </button>
  );
}
