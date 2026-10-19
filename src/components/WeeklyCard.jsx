import { analisisSemana } from '../lib/calc.js';
import { addDays, formatCorto, startOfWeek, todayISO } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';

const gramos = (g) => (Math.abs(g) >= 1000 ? `${fmt(Math.abs(g) / 1000, 1)} kg` : `${fmt(Math.abs(g))} g`);

const VEREDICTOS = {
  'segun-lo-esperado': { tono: 'ok', titulo: 'Va según lo esperado', texto: 'Su peso se movió de acuerdo con el déficit registrado.' },
  'mas-de-lo-esperado': {
    tono: 'ok',
    titulo: 'Bajó más de lo esperado',
    texto: 'Parte de la diferencia suele ser agua o glucógeno; es normal que la próxima semana se compense un poco.',
  },
  'menos-de-lo-esperado': {
    tono: 'leve',
    titulo: 'Bajó menos de lo esperado',
    texto: 'Causas frecuentes: retención de líquido (sal, más carbohidratos, entrenamiento fuerte), comidas sin registrar o porciones subestimadas. Si se repite 2 o 3 semanas, el ajuste automático corregirá su meta.',
  },
  'sin-peso': { tono: 'sin', titulo: 'Falta comparar con su peso', texto: 'Pésese al menos 3 veces por semana para comparar lo esperado con lo real.' },
  'pocos-registros': { tono: 'sin', titulo: 'Pocos días registrados', texto: 'Con menos de 3 días registrados el análisis no es confiable.' },
};

/**
 * Análisis de una semana (lunes a domingo).
 * semana: 'pasada' (la última completa) o 'actual' (en curso).
 */
export default function WeeklyCard({ semana = 'pasada', compacto = false, onVerMas }) {
  const { ctx, metas } = useData();
  const hoy = todayISO();
  const lunes = semana === 'actual' ? startOfWeek(hoy) : addDays(startOfWeek(hoy), -7);
  // La semana en curso se cuenta solo hasta ayer: el día de hoy aún no termina.
  const corte = semana === 'actual' ? addDays(hoy, -1) : hoy;
  const a = analisisSemana(lunes, ctx, metas, corte);
  const v = VEREDICTOS[a.veredicto] ?? VEREDICTOS['pocos-registros'];
  const deficit = a.deficit >= 0;

  return (
    <section className="card stack weekly">
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <h2>{semana === 'actual' ? 'Esta semana' : 'Semana pasada'}</h2>
        <small>{semana === 'actual' ? `Desde el ${formatCorto(a.lunes)}, hasta ayer` : `${formatCorto(a.lunes)} al ${formatCorto(a.domingo)}`}</small>
      </div>

      {semana === 'actual' && a.diasTranscurridos === 0 ? (
        <p className="muted">La semana recién comienza. Mañana verá aquí cómo va.</p>
      ) : a.diasRegistrados === 0 ? (
        <p className="muted">Sin comidas registradas en esta semana.</p>
      ) : (
        <>
          <p className="weekly-lead">
            {semana === 'actual' ? 'Lleva' : 'Tuvo'} un <b>{deficit ? 'déficit' : 'superávit'}</b> de{' '}
            <b className="num">{fmt(Math.abs(a.deficit))} kcal</b>
            {a.diasRegistrados < a.diasTranscurridos && <> en {a.diasRegistrados} de {a.diasTranscurridos} días registrados</>}.
            {' '}Según eso, debería haber {deficit ? 'bajado' : 'subido'} cerca de <b className="num">{gramos(a.esperadaG)}</b>.
          </p>
          {a.realG != null && semana === 'pasada' && (
            <p>
              Su peso promedio {a.realG >= 0 ? 'bajó' : 'subió'} <b className="num">{gramos(a.realG)}</b> respecto de la semana anterior.
            </p>
          )}
          {semana === 'pasada' && (
            <div className={`alert ${v.tono === 'ok' ? 'info' : 'warn'}`}>
              <b>{v.titulo}.</b>{!compacto && <> {v.texto}</>}
            </div>
          )}
          {compacto && onVerMas && <button className="btn small ghost" onClick={onVerMas}>Ver el análisis completo</button>}
          {!compacto && <div className="grid2">
            <div className="kpi"><b className="num">{a.diasRegistrados}/{a.diasTranscurridos}</b><span>Días registrados</span></div>
            <div className="kpi"><b className="num">{a.sesiones}</b><span>Sesiones de ejercicio</span></div>
            <div className="kpi">
              <b className="num" style={{ color: (a.proteinaProm ?? 0) >= metas.proteina * 0.9 ? 'var(--palta)' : undefined }}>
                {a.proteinaProm != null ? `${fmt(a.proteinaProm)} g` : '—'}
              </b>
              <span>Proteína promedio (meta {fmt(metas.proteina)} g)</span>
            </div>
            <div className="kpi"><b className="num">{fmt(a.aguaProm / 1000, 1)} L</b><span>Agua promedio (meta {fmt(metas.agua / 1000, 1)} L)</span></div>
          </div>}
        </>
      )}
    </section>
  );
}
