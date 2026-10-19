import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { FACTOR_EJERCICIO, NIVELES_ACTIVIDAD, resumenSemana } from '../lib/calc.js';
import { addDays, formatCorto, startOfWeek, todayISO } from '../lib/dates.js';
import { fmt, fmtKg, fmtSigno } from '../lib/format.js';
import { useData } from '../data.jsx';
import LineChart from '../components/LineChart.jsx';
import { ComoMedir } from '../components/forms.jsx';
import { Icon } from '../components/ui.jsx';
import WeeklyCard from '../components/WeeklyCard.jsx';

const RANGOS = { 30: '1 mes', 90: '3 meses', 365: '1 año', 0: 'Todo' };
const SECCIONES = [
  { id: 'semana', label: 'Semana' },
  { id: 'peso', label: 'Peso' },
  { id: 'meta', label: 'Meta' },
];
const leerSeccion = () => {
  try {
    return sessionStorage.getItem('comidia-progreso') || 'semana';
  } catch {
    return 'semana';
  }
};

export default function Progress({ abrir }) {
  const { metas, ctx, weights, profile, reload } = useData();
  const [rango, setRango] = useState(90);
  const [verTodo, setVerTodo] = useState(false);
  const [seccion, setSeccionState] = useState(leerSeccion);
  const setSeccion = (id) => {
    setSeccionState(id);
    try {
      sessionStorage.setItem('comidia-progreso', id);
    } catch {
      /* sin almacenamiento */
    }
  };
  const hoy = todayISO();
  const desde = rango ? addDays(hoy, -rango) : '0000-01-01';

  const visibles = ctx.weights.filter((w) => w.log_date >= desde);
  const promedio7 = visibles.map((w) => {
    const ventana = ctx.weights.filter((x) => x.log_date >= addDays(w.log_date, -6) && x.log_date <= w.log_date);
    return { date: w.log_date, value: ventana.reduce((s, x) => s + Number(x.weight_kg), 0) / ventana.length };
  });
  const cinturas = visibles.filter((w) => w.waist_cm != null).map((w) => ({ date: w.log_date, value: Number(w.waist_cm) }));

  const lunes = startOfWeek(hoy);
  const semanas = Array.from({ length: 8 }, (_, i) => resumenSemana(addDays(lunes, -7 * i), ctx, metas, hoy))
    .filter((s) => ctx.inicioISO && s.domingo >= ctx.inicioISO);

  const primero = ctx.weights[0];
  const cambioTotal = primero ? metas.peso - Number(primero.weight_kg) : null;
  const a = metas.adaptativo;

  async function borrarPeso(w) {
    if (!confirm(`¿Eliminar el registro del ${formatCorto(w.log_date)}?`)) return;
    await supabase.from('weight_logs').delete().eq('id', w.id);
    reload();
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Progreso</h1>
        <button className="btn small primary" onClick={() => abrir('peso')}>⚖️ Peso</button>
      </header>

      <div className="seg sticky" role="tablist" aria-label="Secciones de progreso">
        {SECCIONES.map((x) => (
          <button key={x.id} role="tab" aria-selected={seccion === x.id} className={seccion === x.id ? 'on' : ''}
            onClick={() => { setSeccion(x.id); window.scrollTo({ top: 0 }); }}>{x.label}</button>
        ))}
      </div>

      {seccion === 'semana' && <>
      <WeeklyCard semana="pasada" />
      <WeeklyCard semana="actual" />
      </>}

      {seccion === 'peso' && <>
      <section className="card stack">
        <div className="kpi-grid">
          <div className="kpi"><b className="num">{fmtKg(metas.peso)}</b><span>Peso tendencia (7 días)</span></div>
          <div className="kpi"><b className="num" style={{ color: cambioTotal < 0 ? 'var(--palta)' : undefined }}>{fmtSigno(cambioTotal)} kg</b><span>Desde el inicio</span></div>
          <div className="kpi">
            <b className="num">{a.disponible ? `${fmtSigno(a.pendienteKgSemana, 2)} kg` : '—'}</b>
            <span>Ritmo por semana (4 sem.)</span>
          </div>
        </div>
        <div className="seg small">
          {Object.entries(RANGOS).map(([k, v]) => (
            <button key={k} className={rango === Number(k) ? 'on' : ''} onClick={() => setRango(Number(k))}>{v}</button>
          ))}
        </div>
        <LineChart unit="kg" series={[
          { name: 'Pesajes', color: 'var(--muted)', points: visibles.map((w) => ({ date: w.log_date, value: Number(w.weight_kg) })), dots: true, line: false },
          { name: 'Promedio 7 días', color: 'var(--palta)', points: promedio7 },
        ]} />
        <small>Los puntos son los pesajes diarios; la línea es el promedio de 7 días, que es el dato confiable para ver la tendencia.</small>
      </section>

      <section className="card stack">
        <h2>Cintura</h2>
        {cinturas.length >= 2 ? (
          <LineChart unit="cm" series={[{ name: 'Cintura', color: 'var(--aceite)', points: cinturas, dots: true }]} />
        ) : (
          <p className="muted">Registre su cintura una vez por semana junto con el peso. Si entrena con pesas, la cintura muestra la pérdida de grasa aunque la balanza no se mueva.</p>
        )}
        <ComoMedir />
      </section>
      </>}

      {seccion === 'meta' && <>
      <section className="card stack">
        <h2>Gasto y meta</h2>
        <table className="table">
          <tbody>
            <tr><td>Metabolismo basal (Mifflin-St Jeor, {metas.edad} años)</td><td className="num">{fmt(metas.basal)} kcal</td></tr>
            <tr><td>Actividad diaria ({NIVELES_ACTIVIDAD[profile.activity_level]?.label.toLowerCase()}, ×{metas.factor})</td><td className="num">{fmt(metas.base)} kcal</td></tr>
            <tr><td>Ejercicio, promedio diario (al {FACTOR_EJERCICIO * 100}%)</td><td className="num">+{fmt(metas.ejercicio)} kcal</td></tr>
            <tr><td>Gasto según fórmula</td><td className="num">{fmt(metas.tdeeFormula)} kcal</td></tr>
            <tr>
              <td>Gasto real observado (comida vs. cambio de peso)</td>
              <td className="num">{a.disponible ? `${fmt(a.tdee)} kcal` : '—'}</td>
            </tr>
            <tr><td><b>Gasto usado</b></td><td className="num"><b>{fmt(metas.tdee)} kcal</b></td></tr>
            <tr><td>Déficit para {fmt(metas.ritmo, 2)} kg/semana</td><td className="num">−{fmt(metas.deficit)} kcal</td></tr>
            <tr><td><b>Meta diaria {metas.manual ? '(manual)' : '(automática)'}</b></td><td className="num"><b>{fmt(metas.meta)} kcal</b></td></tr>
            {metas.manual && <tr><td>Meta automática sugerida</td><td className="num">{fmt(metas.metaAuto)} kcal</td></tr>}
          </tbody>
        </table>
        {a.disponible && !a.atipico && (
          <div className="alert info">
            Ajuste adaptativo activo al {fmt(a.confianza * 100)}%: se combinan la fórmula y su gasto real, calculado con {a.dias} días
            registrados y {a.pesajes} pesajes de las últimas 4 semanas.
          </div>
        )}
        {!a.disponible && (
          <div className="alert info">
            El ajuste adaptativo se activa con al menos 10 días de comidas registradas y 4 pesajes repartidos en 10 días o más
            (lleva {a.dias} días y {a.pesajes} pesajes en las últimas 4 semanas). Mientras tanto se usa solo la fórmula.
          </div>
        )}
        {a.atipico && <div className="alert warn">El gasto real calculado difiere demasiado de la fórmula; probablemente faltan comidas por registrar. Se usa solo la fórmula.</div>}
        {metas.ritmoLimitado && <div className="alert warn">El ritmo elegido supera el 1% de su peso por semana; se limitó a {fmt(metas.ritmo, 2)} kg.</div>}
        {metas.manual && <div className="alert warn">Su meta está en modo manual, por lo que no considera su ejercicio ni su avance real. Puede cambiarla a automática en Ajustes.</div>}
        {metas.bajoMinimo && <div className="alert warn">Su meta manual está bajo el mínimo recomendado ({fmt(metas.minimo)} kcal).</div>}
        <div className="kpi-grid">
          <div className="kpi"><b className="num">{fmt(metas.proteina)} g</b><span>Proteína/día</span></div>
          <div className="kpi"><b className="num">{fmt(metas.carbos)} g</b><span>Carbohidratos/día</span></div>
          <div className="kpi"><b className="num">{fmt(metas.grasa)} g</b><span>Grasas/día</span></div>
        </div>
      </section>
      </>}

      {seccion === 'semana' && (
      <section className="card stack">
        <h2>Semanas anteriores</h2>
        <div className="scroll-x">
          <table className="table fija">
            <thead>
              <tr>
                <th>Semana</th><th>Días reg.</th><th>En meta</th><th>kcal prom.</th><th>Prot. prom.</th>
                <th>Déficit</th><th>Baja estimada</th><th>Peso prom.</th><th>Cambio real</th><th>Ejercicio</th>
              </tr>
            </thead>
            <tbody>
              {semanas.map((s) => (
                <tr key={s.lunes}>
                  <td>{formatCorto(s.lunes)}{s.lunes === lunes ? ' (actual)' : ''}</td>
                  <td className="num">{s.diasRegistrados}/{s.diasTranscurridos}</td>
                  <td className="num">{s.diasEnMeta}</td>
                  <td className="num">{fmt(s.kcalProm)}</td>
                  <td className="num">{s.proteinaProm != null ? `${fmt(s.proteinaProm)} g` : '—'}</td>
                  <td className="num" style={{ color: s.deficit < 0 ? 'var(--aji)' : undefined }}>{fmt(s.deficit)} kcal</td>
                  <td className="num">{s.diasRegistrados ? `${fmt(s.perdidaEstimada, 2)} kg` : '—'}</td>
                  <td className="num">{fmtKg(s.pesoProm)}</td>
                  <td className="num">{s.cambioReal != null ? `${fmtSigno(s.cambioReal, 2)} kg` : '—'}</td>
                  <td className="num">{s.sesiones} ses.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <small>
          “Baja estimada” es la grasa que debería haber perdido según el déficit (7.700 kcal ≈ 1 kg). “Cambio real” compara su peso
          promedio con el de la semana anterior; puede diferir por agua, sal o glucógeno. Si la diferencia se mantiene varias semanas,
          el ajuste adaptativo corrige la meta.
        </small>
      </section>
      )}

      {seccion === 'peso' && (
      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Historial de pesajes</h2>
        <div className="list">
          {[...weights].sort((x, y) => y.log_date.localeCompare(x.log_date)).slice(0, verTodo ? 120 : 10).map((w) => (
            <div className="list-item" key={w.id}>
              <div className="grow">{formatCorto(w.log_date)}</div>
              <span className="num">{fmt(w.weight_kg, 1)} kg{w.waist_cm ? ` · ${fmt(w.waist_cm, 1)} cm` : ''}</span>
              <button className="icon-btn" title="Eliminar" onClick={() => borrarPeso(w)}><Icon name="basura" size={18} /></button>
            </div>
          ))}
        </div>
              {weights.length > 10 && (
          <button className="btn small ghost block" onClick={() => setVerTodo((v) => !v)}>
            {verTodo ? 'Mostrar menos' : `Ver los ${Math.min(weights.length, 120)} pesajes`}
          </button>
        )}
      </section>
      )}
    </div>
  );
}
