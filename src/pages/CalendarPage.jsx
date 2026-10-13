import { useState } from 'react';
import { ESTADOS, estadoDia } from '../lib/calc.js';
import { DIAS_CORTOS, MESES, fromISO, toISO, todayISO } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { Icon, Pill } from '../components/ui.jsx';

export default function CalendarPage({ abrirDia }) {
  const { ctx, metas } = useData();
  const hoy = todayISO();
  const [mes, setMes] = useState(() => {
    const d = fromISO(hoy);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const primero = new Date(mes.y, mes.m, 1, 12);
  const offset = (primero.getDay() + 6) % 7;
  const diasMes = new Date(mes.y, mes.m + 1, 0).getDate();
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= diasMes; d++) celdas.push(toISO(new Date(mes.y, mes.m, d, 12)));

  const conteo = { ok: 0, leve: 0, exceso: 0, bajo: 0, sin: 0 };
  let sesiones = 0;
  let kcalTotal = 0;
  let diasReg = 0;
  for (const iso of celdas) {
    if (!iso || iso > hoy) continue;
    const kcal = ctx.intakeByDate.get(iso)?.kcal ?? 0;
    conteo[estadoDia(kcal, metas.meta)]++;
    sesiones += ctx.exerciseByDate.get(iso)?.count ?? 0;
    if (kcal) {
      kcalTotal += kcal;
      diasReg++;
    }
  }

  const mover = (delta) =>
    setMes(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const esMesActual = `${mes.y}-${String(mes.m + 1).padStart(2, '0')}` === hoy.slice(0, 7);

  return (
    <div className="stack">
      <div className="page-head">
        <button className="icon-btn round" onClick={() => mover(-1)} aria-label="Mes anterior"><Icon name="izq" /></button>
        <div className="titles"><h1>{MESES[mes.m]}</h1><small>{mes.y}</small></div>
        <button className="icon-btn round" onClick={() => mover(1)} aria-label="Mes siguiente" disabled={esMesActual}
          style={{ visibility: esMesActual ? 'hidden' : 'visible' }}><Icon name="der" /></button>
      </div>

      <section className="card cal-card">
        <div className="cal">
          {DIAS_CORTOS.map((d) => <div key={d} className="cal-head">{d}</div>)}
          {celdas.map((iso, i) => {
            if (!iso) return <div key={`v${i}`} className="cal-day vacio" />;
            const futuro = iso > hoy;
            const kcal = ctx.intakeByDate.get(iso)?.kcal ?? 0;
            const est = futuro ? 'sin' : estadoDia(kcal, metas.meta);
            const ej = ctx.exerciseByDate.get(iso);
            return (
              <button key={iso} className={`cal-day ${est}${iso === hoy ? ' hoy' : ''}${futuro ? ' futuro' : ''}`}
                disabled={futuro} onClick={() => abrirDia(iso)}
                aria-label={`${iso}: ${ESTADOS[est]}${ej ? ', con ejercicio' : ''}`}>
                {ej && <span className="dot" />}
                <b>{Number(iso.slice(8))}</b>
                {kcal > 0 && <small className="num">{fmt(kcal)}</small>}
              </button>
            );
          })}
        </div>
      </section>

      <div className="legend">
        {['ok', 'leve', 'exceso', 'bajo', 'sin'].map((e) => <Pill key={e} estado={e}>{ESTADOS[e]}</Pill>)}
        <span className="pill sin"><span style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--choclo-dark)', display: 'inline-block' }} /> Ejercicio</span>
      </div>

      <section className="card">
        <h2 style={{ marginBottom: 10 }}>Resumen del mes</h2>
        <div className="grid3 resp">
          <div className="kpi"><b className="num">{conteo.ok}</b><span>Días en meta</span></div>
          <div className="kpi"><b className="num">{conteo.leve + conteo.exceso}</b><span>Días sobre la meta</span></div>
          <div className="kpi"><b className="num">{conteo.sin + conteo.bajo}</b><span>Sin registro o incompletos</span></div>
          <div className="kpi"><b className="num">{diasReg ? fmt(kcalTotal / diasReg) : '—'}</b><span>kcal promedio/día</span></div>
          <div className="kpi"><b className="num">{sesiones}</b><span>Sesiones de ejercicio</span></div>
          <div className="kpi"><b className="num">{fmt(metas.meta)}</b><span>Meta actual (kcal)</span></div>
        </div>
      </section>
      <small>Un día “muy bajo o incompleto” (menos del 60% de la meta) suele indicar que faltó registrar algo. Comer muy por debajo de la meta tampoco es recomendable.</small>
    </div>
  );
}
