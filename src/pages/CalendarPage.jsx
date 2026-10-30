import { useRef, useState } from 'react';
import { useSwipe } from '../lib/useSwipe.js';
import { estadosDe, estadoDia } from '../lib/calc.js';
import { DIAS_CORTOS, MESES, fromISO, toISO, todayISO } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { Icon } from '../components/ui.jsx';

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
    conteo[estadoDia(kcal, metas.meta, metas.objetivo)]++;
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
  const dir = useRef('');
  const esMesActual = `${mes.y}-${String(mes.m + 1).padStart(2, '0')}` === hoy.slice(0, 7);

  const irMes = (delta) => {
    if (delta > 0 && esMesActual) return;
    dir.current = delta > 0 ? 'slide-izq' : 'slide-der';
    mover(delta);
  };
  const swipe = useSwipe({ izquierda: () => irMes(1), derecha: () => irMes(-1) });

  return (
    <div className="stack" {...swipe}>
      <div className="page-head">
        <button className="icon-btn round" onClick={() => irMes(-1)} aria-label="Mes anterior"><Icon name="izq" /></button>
        <div className="titles"><h1>{MESES[mes.m]}</h1><small>{mes.y}</small></div>
        <button className="icon-btn round" onClick={() => irMes(1)} aria-label="Mes siguiente" disabled={esMesActual}
          style={{ visibility: esMesActual ? 'hidden' : 'visible' }}><Icon name="der" /></button>
      </div>

      <section key={`${mes.y}-${mes.m}`} className={`card cal-card ${dir.current}`}>
        <div className="cal">
          {DIAS_CORTOS.map((d) => <div key={d} className="cal-head">{d}</div>)}
          {celdas.map((iso, i) => {
            if (!iso) return <div key={`v${i}`} className="cal-day vacio" />;
            const futuro = iso > hoy;
            const kcal = ctx.intakeByDate.get(iso)?.kcal ?? 0;
            const est = futuro ? 'sin' : estadoDia(kcal, metas.meta, metas.objetivo);
            const ej = ctx.exerciseByDate.get(iso);
            return (
              <button key={iso} className={`cal-day ${est}${iso === hoy ? ' hoy' : ''}${futuro ? ' futuro' : ''}`}
                disabled={futuro} onClick={() => abrirDia(iso)}
                aria-label={`${iso}: ${estadosDe(metas.objetivo)[est]}${ej ? ', con ejercicio' : ''}`}>
                {ej && <span className="dot" />}
                <b>{Number(iso.slice(8))}</b>
                {kcal > 0 && <small className="num">{fmt(kcal)}</small>}
              </button>
            );
          })}
        </div>
      </section>

      <div className="legend" aria-label="Significado de los colores">
        {(metas.objetivo === 'bajar'
          ? [['ok', 'En meta'], ['leve', 'Leve exceso (≤10%)'], ['exceso', 'Exceso'], ['bajo', 'Muy bajo'], ['sin', 'Sin registro']]
          : [['ok', 'En meta (±10%)'], ['leve', 'Cerca (±20%)'], ['exceso', 'Sobre +20%'], ['bajo', 'Bajo 80%'], ['sin', 'Sin registro']]
        ).map(([e, t]) => (
          <span key={e} className="ley"><i className={`ley-dot ${e}`} />{t}</span>
        ))}
        <span className="ley"><i className="ley-dot ej" />Ejercicio</span>
      </div>

      <section className="card">
        <h2 style={{ marginBottom: 10 }}>Resumen del mes</h2>
        <div className="kpi-grid">
          <div className="kpi"><b className="num">{conteo.ok}</b><span>Días en meta</span></div>
          <div className="kpi"><b className="num">{metas.objetivo === 'bajar' ? conteo.leve + conteo.exceso : conteo.leve}</b><span>{metas.objetivo === 'bajar' ? 'Días sobre la meta' : 'Días cerca de la meta'}</span></div>
          <div className="kpi"><b className="num">{metas.objetivo === 'bajar' ? conteo.sin + conteo.bajo : conteo.bajo + conteo.exceso}</b><span>{metas.objetivo === 'bajar' ? 'Sin registro o incompletos' : 'Días lejos de la meta'}</span></div>
          <div className="kpi"><b className="num">{diasReg ? fmt(kcalTotal / diasReg) : '—'}</b><span>kcal promedio/día</span></div>
          <div className="kpi"><b className="num">{sesiones}</b><span>Sesiones de ejercicio</span></div>
          <div className="kpi"><b className="num">{fmt(metas.meta)}</b><span>Meta actual (kcal)</span></div>
        </div>
      </section>
      <small>{metas.objetivo === 'bajar'
        ? 'Un día “muy bajo o incompleto” (menos del 60% de la meta) suele indicar que faltó registrar algo. Comer muy por debajo de la meta tampoco es recomendable.'
        : 'Para subir de peso o ganar músculo importa llegar a la meta: un día bajo el 80% cuenta como bajo la meta.'}</small>
    </div>
  );
}
