import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { MESES, todayISO } from '../lib/dates.js';
import { useData } from '../data.jsx';
import { Icon, Spinner } from '../components/ui.jsx';

// Premio de prueba durante el piloto. Cambiar aquí cuando haya un premio real.
const PREMIO = { monto: 'USD 100', nota: 'Premio de prueba durante el piloto de Comidia.' };
const CADA_MS = 20000; // se actualiza cada 20 segundos mientras está abierta

const iniciales = (n) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const COLORES = ['#7b3f9e', '#dd7a14', '#2b8a9e', '#3e74c9', '#b5476b', '#5b7f2a', '#8a5a2b'];
const colorDe = (n) => COLORES[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES.length];

function mesAnterior(iso) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 2, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function Ranking() {
  const { ctx } = useData();
  const hoy = todayISO();
  const [filas, setFilas] = useState(null); // null = cargando
  const [anterior, setAnterior] = useState(null);
  const [error, setError] = useState(null);
  const [actualizado, setActualizado] = useState(null);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('ranking_mes');
    if (e) {
      setError(/ranking_mes|function|schema cache/i.test(e.message)
        ? 'El ranking se está activando. Vuelva a abrir esta pestaña en unos minutos.'
        : 'No se pudo cargar el ranking. Revise su conexión.');
      setFilas((f) => f ?? []);
      return;
    }
    setError(null);
    setFilas(data ?? []);
    setActualizado(new Date());
  }, []);

  useEffect(() => {
    cargar();
    supabase.rpc('ranking_mes', { p_mes: mesAnterior(hoy) }).then(({ data }) => setAnterior(data?.[0] ?? null));
    const id = setInterval(() => document.visibilityState === 'visible' && cargar(), CADA_MS);
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar, hoy, ctx]); // ctx cambia al registrar algo: se recalcula al tiro

  const [y, m, d] = hoy.split('-').map(Number);
  const diasMes = new Date(y, m, 0).getDate();
  const quedan = diasMes - d;
  const yo = filas?.find((f) => f.es_yo);
  const lider = filas?.[0];
  const conPuntos = filas?.some((f) => f.puntos > 0);

  let mensaje = null;
  if (yo && lider) {
    if (yo.posicion === 1 && conPuntos) {
      const segundo = filas.find((f) => !f.es_yo);
      const ventaja = segundo ? yo.puntos - segundo.puntos : 0;
      mensaje = ventaja > 0 ? `Va primero con ${ventaja} ${ventaja === 1 ? 'punto' : 'puntos'} de ventaja. ¡Defiéndalo!` : 'Va primero, pero empatado. Un día verde lo deja solo arriba.';
    } else if (conPuntos) {
      const faltan = lider.puntos - yo.puntos;
      const diasVerdes = Math.ceil((faltan + 1) / 2);
      mensaje = `Le faltan ${faltan} ${faltan === 1 ? 'punto' : 'puntos'} para el 1.º lugar: unos ${diasVerdes} ${diasVerdes === 1 ? 'día verde' : 'días verdes'}.`;
    } else {
      mensaje = 'Nadie suma puntos todavía. Un día verde hoy lo deja primero.';
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div className="titles" style={{ textAlign: 'left' }}>
          <h1>Ranking</h1>
          <small>{MESES[m - 1]} {y} · {quedan === 0 ? 'último día' : `quedan ${quedan} ${quedan === 1 ? 'día' : 'días'}`}</small>
        </div>
        <span className="live-badge" title={actualizado ? `Actualizado a las ${actualizado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}>
          <i aria-hidden="true" /> En vivo
        </span>
      </header>

      <section className="prize" aria-label="Premio del mes">
        <svg className="prize-trophy" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M18 8h28v14c0 10-6 17-14 17S18 32 18 22z" fill="#f2be22" />
          <path d="M18 12h-8c0 9 4 13 10 14M46 12h8c0 9-4 13-10 14" fill="none" stroke="#f2be22" strokeWidth="4" strokeLinecap="round" />
          <path d="M28 38h8v9h-8z" fill="#d9a514" />
          <rect x="19" y="46" width="26" height="9" rx="3" fill="#f2be22" />
        </svg>
        <div className="grow">
          <small>Premio para el 1.º del mes</small>
          <b className="num">{PREMIO.monto}<sup>*</sup></b>
          <span>{lider && conPuntos ? `Va ganando ${lider.es_yo ? 'usted' : lider.nombre.split(' ')[0]} con ${lider.puntos} pts` : 'Todavía nadie suma puntos este mes'}</span>
        </div>
      </section>

      {mensaje && <div className="alert info rank-msg">{mensaje}</div>}
      {error && <div className="alert warn">{error}</div>}

      {!(error && !filas?.length) && <section className="card rank-card" aria-label="Tabla del mes">
        {filas === null && <div className="row" style={{ justifyContent: 'center', padding: 20 }}><Spinner /></div>}
        {filas?.length === 0 && !error && <p className="muted">Aún no hay participantes con metas calculadas.</p>}
        <ol className="rank-list">
          {filas?.map((f) => (
            <li key={`${f.nombre}-${f.posicion}-${f.es_yo}`} className={`rank-row${f.es_yo ? ' yo' : ''}${f.posicion === 1 && conPuntos ? ' top' : ''}`}>
              <span className="rank-pos num">{f.posicion === 1 && conPuntos ? <Icon name="corona" filled size={22} /> : f.posicion}</span>
              <span className="rank-av" style={{ background: f.es_yo ? undefined : colorDe(f.nombre) }}>{iniciales(f.nombre)}</span>
              <span className="grow rank-name">
                <b>{f.es_yo ? `${f.nombre.split(' ')[0]} (usted)` : f.nombre}</b>
                <small>
                  <i className="dot ok" /> {f.verdes} <i className="dot leve" /> {f.amarillos} · {f.dias} {f.dias === 1 ? 'día' : 'días'}
                </small>
              </span>
              <span className="rank-pts num">{f.puntos}<small>pts</small></span>
            </li>
          ))}
        </ol>
      </section>}

      <section className="card stack rank-rules">
        <h2>Cómo se suman puntos</h2>
        <div className="rule"><i className="sw ok" /> <span className="grow">Día verde: dentro de su meta</span><b>+2</b></div>
        <div className="rule"><i className="sw leve" /> <span className="grow">Día amarillo: hasta 10% sobre la meta</span><b>+1</b></div>
        <div className="rule"><i className="sw rojo-azul" /> <span className="grow">Día rojo o azul (exceso o muy bajo)</span><b className="cero">0</b></div>
        <small>
          Cada día usa su meta de calorías y el mismo color que ve en el Calendario. El día de hoy suma en vivo.
          Empate: gana quien tenga más días verdes. El marcador vuelve a cero el día 1.
          Los demás solo ven su nombre y sus puntos, nunca sus calorías ni su peso.
        </small>
      </section>

      {anterior && anterior.puntos > 0 && (
        <p className="muted" style={{ textAlign: 'center' }}>
          Ganador de {MESES[(m + 10) % 12].toLowerCase()}: <b>{anterior.es_yo ? 'usted' : anterior.nombre}</b> con {anterior.puntos} pts
        </p>
      )}
      <small className="muted" style={{ textAlign: 'center' }}>*{PREMIO.nota}</small>
    </div>
  );
}
