import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { MESES, todayISO } from '../lib/dates.js';
import { useData } from '../data.jsx';
import { Icon, Spinner, Vacio } from '../components/ui.jsx';

const CADA_MS = 20000; // se actualiza cada 20 segundos mientras está abierta

const iniciales = (n) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const COLORES = ['#c792f2', '#ff9f45', '#43c9dc', '#8fb1ff', '#ff7aa8', '#b8e05a', '#e0b07a'];
const colorDe = (n) => COLORES[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES.length];

function mesAnterior(iso) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 2, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const corto = (f) => (f.es_yo ? 'usted' : f.nombre.split(' ')[0]);
function tituloLider(filas, conPuntos) {
  if (!filas?.length || !conPuntos) return 'Sin líder aún';
  if (filas.filter((f) => f.posicion === 1).length > 1) return 'Empate';
  const n = corto(filas[0]);
  return n.charAt(0).toUpperCase() + n.slice(1);
}
function textoLider(filas, conPuntos) {
  if (!filas?.length || !conPuntos) return 'Todavía nadie suma puntos este mes';
  const primeros = filas.filter((f) => f.posicion === 1);
  if (primeros.length > 1) {
    const nombres = primeros.map(corto);
    return `Empate en el 1.º lugar: ${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]} con ${primeros[0].puntos} pts`;
  }
  return `Va ganando ${corto(filas[0])} con ${filas[0].puntos} pts`;
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

      {filas !== null && !conPuntos && !error ? (
        <section className="card lider-vacio" aria-label="Líder del mes">
          <Vacio img="/img/vacio-ranking.webp" titulo="Nadie suma puntos todavía"
            texto="Cada día dentro de su meta suma 2 puntos. Registre lo que come hoy y parte primero." />
        </section>
      ) : (
        <section className="lider" aria-label="Líder del mes">
          <Icon name="corona" size={34} className="lider-corona" />
          <div className="grow">
            <h2 className="lider-nombre">{tituloLider(filas, conPuntos)}</h2>
            <p>{textoLider(filas, conPuntos)}</p>
          </div>
        </section>
      )}

      {mensaje && conPuntos && <div className="alert info rank-msg">{mensaje}</div>}
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
    </div>
  );
}
