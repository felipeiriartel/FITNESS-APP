import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { FACTOR_EJERCICIO, NIVELES_ACTIVIDAD, resumenSemana } from '../lib/calc.js';
import { addDays, formatCorto, startOfWeek, todayISO } from '../lib/dates.js';
import { fmt, fmtKg, fmtSigno } from '../lib/format.js';
import { useData } from '../data.jsx';
import LineChart from '../components/LineChart.jsx';
import { ComoMedir, WeightForm } from '../components/forms.jsx';
import { Icon } from '../components/ui.jsx';

const RANGOS = { 30: '30 días', 90: '90 días', 365: '1 año', 0: 'Todo' };

export default function Progress() {
  const { metas, ctx, weights, profile, reload } = useData();
  const [modal, setModal] = useState(false);
  const [rango, setRango] = useState(90);
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
      <div className="row between">
        <h1>Progreso</h1>
        <button className="btn small primary" onClick={() => setModal(true)}>+ Peso / cintura</button>
      </div>

      <section className="card stack">
        <div className="grid3">
          <div className="kpi"><b className="num">{fmtKg(metas.peso)}</b><span>Peso tendencia (prom. 7 días)</span></div>
          <div className="kpi"><b className="num">{fmtSigno(cambioTotal)} kg</b><span>Desde el inicio</span></div>
          <div className="kpi">
            <b className="num">{a.disponible ? `${fmtSigno(a.pendienteKgSemana, 2)} kg` : '—'}</b>
            <span>Ritmo real por semana (últ. 4 sem.)</span>
          </div>
        </div>
        <div className="seg">
          {Object.entries(RANGOS).map(([k, v]) => (
            <button key={k} className={rango === Number(k) ? 'on' : ''} onClick={() => setRango(Number(k))}>{v}</button>
          ))}
        </div>
        <LineChart unit="kg" series={[
          { name: 'Pesajes', color: 'var(--muted)', points: visibles.map((w) => ({ date: w.log_date, value: Number(w.weight_kg) })), dots: true, line: false },
          { name: 'Promedio 7 días', color: 'var(--accent)', points: promedio7 },
        ]} />
        <small>Los puntos son los pesajes diarios; la línea es el promedio de 7 días, que es el dato confiable para ver la tendencia.</small>
      </section>

      <section className="card stack">
        <h2>Cintura</h2>
        {cinturas.length >= 2 ? (
          <LineChart unit="cm" series={[{ name: 'Cintura', color: 'var(--fat)', points: cinturas, dots: true }]} />
        ) : (
          <p className="muted">Registre su cintura una vez por semana junto con el peso. Si entrena con pesas, la cintura muestra la pérdida de grasa aunque la balanza no se mueva.</p>
        )}
        <ComoMedir />
      </section>

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
        {metas.bajoMinimo && <div className="alert warn">Su meta manual está bajo el mínimo recomendado ({fmt(metas.minimo)} kcal).</div>}
        <div className="grid3">
          <div className="kpi"><b className="num">{fmt(metas.proteina)} g</b><span>Proteína/día</span></div>
          <div className="kpi"><b className="num">{fmt(metas.carbos)} g</b><span>Carbohidratos/día</span></div>
          <div className="kpi"><b className="num">{fmt(metas.grasa)} g</b><span>Grasas/día</span></div>
        </div>
      </section>

      <section className="card stack">
        <h2>Resumen semanal</h2>
        <div className="scroll-x">
          <table className="table">
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
                  <td className="num" style={{ color: s.deficit < 0 ? 'var(--bad)' : undefined }}>{fmt(s.deficit)} kcal</td>
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

      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Historial de pesajes</h2>
        <div className="list">
          {[...weights].sort((x, y) => y.log_date.localeCompare(x.log_date)).slice(0, 30).map((w) => (
            <div className="list-item" key={w.id}>
              <div className="grow">{formatCorto(w.log_date)}</div>
              <span className="num">{fmt(w.weight_kg, 1)} kg{w.waist_cm ? ` · ${fmt(w.waist_cm, 1)} cm` : ''}</span>
              <button className="icon-btn" title="Eliminar" onClick={() => borrarPeso(w)}><Icon name="basura" size={18} /></button>
            </div>
          ))}
        </div>
      </section>

      {modal && <WeightForm onClose={() => setModal(false)} />}
    </div>
  );
}
