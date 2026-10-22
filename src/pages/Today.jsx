import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { EJERCICIOS, ESTADOS, FACTOR_EJERCICIO, TIPOS_COMIDA, estadoDia, gastoDelDia, racha } from '../lib/calc.js';
import { addDays, formatCorto, formatLargo, fromISO, todayISO } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { Bar, Icon, Macro, Pill, Ring, useToast } from '../components/ui.jsx';
import { useSwipe } from '../lib/useSwipe.js';
import WaterInput from '../components/WaterInput.jsx';
import { useFotos } from '../lib/useFotos.js';
import WeeklyCard from '../components/WeeklyCard.jsx';
import NotifButton from '../components/NotifButton.jsx';

export default function Today({ fecha, setFecha, abrir, irAProgreso, irAAjustes }) {
  const { metas, ctx, exercises, water, weights, reload } = useData();
  const toast = useToast();
  const [meals, setMeals] = useState([]);
  const hoy = todayISO();

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('meals').select('*').eq('log_date', fecha).order('created_at');
    setMeals(data ?? []);
  }, [fecha]);
  // Solo los registros antiguos pueden tener foto; las nuevas no se guardan.
  const fotos = useFotos(meals.map((m) => m.photo_path));

  useEffect(() => {
    cargar();
  }, [cargar, ctx]);

  const consumo = ctx.intakeByDate.get(fecha) ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const ejerciciosDia = exercises.filter((e) => e.log_date === fecha);
  const kcalEj = ejerciciosDia.reduce((s, e) => s + e.kcal_est, 0);
  const aguaDia = ctx.waterByDate.get(fecha) ?? 0;
  const estado = estadoDia(consumo.kcal, metas.meta);
  const restante = metas.meta - consumo.kcal;
  const gasto = gastoDelDia(metas, kcalEj);
  const extraEjercicio = Math.round(kcalEj * FACTOR_EJERCICIO);
  const balance = consumo.kcal - gasto; // negativo = déficit
  const previsto = Math.round(gasto - metas.meta); // déficit si come justo la meta
  const pesoDia = weights.find((w) => w.log_date === fecha);
  const r = racha(ctx.intakeByDate, hoy);
  const esLunes = new Date().getDay() === 1;
  const diffHoy = Math.round((fromISO(hoy) - fromISO(fecha)) / 86400000);

  // Deslizar a la derecha: día anterior. A la izquierda: día siguiente (hasta hoy).
  const dir = useRef('');
  const irDia = (delta) => {
    const nuevo = addDays(fecha, delta);
    if (nuevo > hoy) return;
    dir.current = delta > 0 ? 'slide-izq' : 'slide-der';
    setFecha(nuevo);
  };
  const swipe = useSwipe({ izquierda: () => irDia(1), derecha: () => irDia(-1) });

  async function deshacerAgua() {
    const ultimo = water.filter((w) => w.log_date === fecha).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!ultimo) return;
    await supabase.from('water_logs').delete().eq('id', ultimo.id);
    toast(`Se quitaron ${ultimo.ml} ml de agua`);
    reload();
  }

  return (
    <div className="stack" {...swipe}>
      <header className="page-head today-head">
        <div className="titles">
          <h1 style={{ textTransform: 'capitalize' }}>
            {fecha === hoy ? 'Hoy' : fecha === addDays(hoy, -1) ? 'Ayer' : fromISO(fecha).toLocaleDateString('es-CL', { weekday: 'long' })}
          </h1>
          <small>{fecha === hoy ? formatLargo(fecha) : <button className="link-hoy" onClick={() => irDia(diffHoy)}>{formatCorto(fecha)} · Volver a hoy</button>}</small>
        </div>
        <div className="head-actions">
          <button className="icon-btn round" onClick={() => irDia(-1)} aria-label="Día anterior"><Icon name="izq" /></button>
          <button className="icon-btn round" onClick={() => irDia(1)} aria-label="Día siguiente" disabled={fecha >= hoy}><Icon name="der" /></button>
          <NotifButton irAAjustes={irAAjustes} />
        </div>
      </header>

      <div key={fecha} className={`stack ${dir.current}`}>
      <section className="hero" aria-label="Resumen de calorías">
        <div className="hero-top">
          {fecha === hoy && r.actual > 0 ? (
            <span className={`streak-badge${r.hoyRegistrado ? '' : ' pendiente'}`}
              title={r.hoyRegistrado ? `Récord: ${r.mejor} días` : 'Registre algo hoy para mantener la racha'}>
              <Icon name="racha" size={16} />
              <span className="num">{r.actual} {r.actual === 1 ? 'día' : 'días'}</span>
              {!r.hoyRegistrado && <span style={{ fontWeight: 600 }}>· registre hoy</span>}
            </span>
          ) : <span />}
          <Pill estado={estado}>{ESTADOS[estado]}</Pill>
        </div>

        <div className="hero-main">
          <Ring value={consumo.kcal} max={metas.meta} estado={estado === 'sin' ? 'ok' : estado}>
            <span className="value num" style={{ color: restante < 0 ? 'var(--aji)' : undefined }}>
              {fmt(Math.abs(restante))}
            </span>
            <span className="label">{restante < 0 ? 'kcal sobre la meta' : 'kcal disponibles'}</span>
          </Ring>
          <div className="hero-side">
            <div className="stat-row"><span>Consumido</span><b className="num">{fmt(consumo.kcal)}</b></div>
            <div className="stat-row"><span>Meta</span><b className="num">{fmt(metas.meta)}</b></div>
            <div className="stat-row"><span>Gasto</span><b className="num">{fmt(gasto)}</b></div>
            {extraEjercicio > 0 && (
              <div className="stat-row ej"><span>Ejercicio</span><b className="num">+{fmt(extraEjercicio)}</b></div>
            )}
          </div>
        </div>

        <div className="day-balance">
          {fecha === hoy || !consumo.kcal ? (
            <span className={previsto > 0 ? 'deficit' : 'superavit'}>
              Si llega a la meta, su déficit {fecha === hoy ? 'de hoy' : 'del día'} será de <b className="num">{fmt(Math.max(0, previsto))} kcal</b>
            </span>
          ) : (
            <span className={balance < 0 ? 'deficit' : 'superavit'}>
              {balance < 0 ? 'Déficit' : 'Superávit'} del día: <b className="num">{fmt(Math.abs(balance))} kcal</b>
            </span>
          )}
        </div>

        <div className="hero-macros">
          <Macro nombre="Proteína" value={consumo.protein_g} target={metas.proteina} color="var(--ciruela)" />
          <Macro nombre="Carbos" value={consumo.carbs_g} target={metas.carbos} color="var(--zapallo)" />
          <Macro nombre="Grasas" value={consumo.fat_g} target={metas.grasa} color="var(--aceite)" />
        </div>
      </section>

      <div className="log-grid">
        <button className="btn primary" onClick={() => abrir('comida')}><Icon name="camara" size={26} />Foto</button>
        <button className="btn" onClick={() => abrir('texto')}><Icon name="editar" size={26} />Escribir</button>
        <button className="btn" onClick={() => abrir('codigo')}><Icon name="codigo" size={26} />Código</button>
        <button className="btn" onClick={() => abrir('favoritas')}><Icon name="estrella" size={26} />Frecuente</button>
      </div>
      <button className="btn slim block" onClick={() => abrir('sugerir')}>
        <Icon name="idea" size={20} /> ¿Qué puedo comer ahora?
      </button>

      {fecha === hoy && esLunes && <WeeklyCard semana="pasada" compacto onVerMas={irAProgreso} />}

      <section className="card">
        <div className="card-head" style={{ marginBottom: 4 }}>
          <h2>Comidas</h2>
          {meals.length > 0 && <span className="num muted" style={{ fontWeight: 700 }}>{fmt(consumo.kcal)} kcal</span>}
        </div>
        {!meals.length && (
          <div className="empty">
            <Icon name="almuerzo" size={36} stroke={1.6} />
            Aún no hay comidas este día. Tome una foto de su plato para empezar.
          </div>
        )}
        {TIPOS_COMIDA.map((t) => {
          const grupo = meals.filter((m) => m.meal_type === t.id);
          if (!grupo.length) return null;
          return (
            <div key={t.id} className="group">
              <div className="group-title">
                <span><Icon name={t.icono} size={16} />{t.label}</span>
                <span className="num">{fmt(grupo.reduce((s, m) => s + m.kcal, 0))} kcal</span>
              </div>
              <div className="list">
                {grupo.map((m) => (
                  <div className="list-item" key={m.id}>
                    <button className="list-tap" onClick={() => abrir('comida', { editar: m })} aria-label={`Editar ${m.description}`}>
                      {m.photo_path && fotos[m.photo_path] ? (
                        <img className="thumb" src={fotos[m.photo_path]} alt="" />
                      ) : (
                        <span className="thumb" aria-hidden="true"><Icon name={t.icono} /></span>
                      )}
                      <span className="grow">
                        <span className="item-title">{m.description}</span>
                        <span className="macro-line num">
                          <span className="p">P {fmt(m.protein_g)}</span> · <span className="c">C {fmt(m.carbs_g)}</span> · <span className="g">G {fmt(m.fat_g)}</span> g
                        </span>
                      </span>
                      <span className="item-kcal num">{fmt(m.kcal)}<small>kcal</small></span>
                      <Icon name="der" size={18} className="chev" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div className={meals.length ? 'card-foot' : undefined}>
          <button className="btn small ghost block" onClick={() => abrir('copiar')}><Icon name="copiar" size={20} /> Copiar comidas de otro día</button>
        </div>
      </section>

      <section className="card stack">
        <div className="row between">
          <div className="section-title"><span className="badge agua"><Icon name="agua" size={18} /></span><h2>Agua</h2></div>
          <span><span className="water-value num">{fmt(aguaDia / 1000, 2)}</span> <small>/ {fmt(metas.agua / 1000, 1)} L</small></span>
        </div>
        <Bar value={aguaDia} max={metas.agua} color="var(--agua)" />
        <WaterInput fecha={fecha} />
        {aguaDia > 0 && <button className="btn small ghost" onClick={deshacerAgua}>Deshacer el último registro</button>}
        <small>Registre aquí solo agua. Jugos, bebidas o café con leche se registran como comida, en “Bebida”.</small>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="section-title"><span className="badge ejercicio"><Icon name="ejercicio" size={18} /></span><h2>Ejercicio</h2></div>
          <button className="btn small" onClick={() => abrir('ejercicio')}><Icon name="mas" size={18} /> Agregar</button>
        </div>
        {!ejerciciosDia.length && <p className="muted">Sin ejercicio registrado este día.</p>}
        <div className="list">
          {ejerciciosDia.map((e) => (
            <div className="list-item" key={e.id}>
              <button className="list-tap" onClick={() => abrir('ejercicio', { existente: e })} aria-label="Editar ejercicio">
                <span className="thumb" aria-hidden="true"><Icon name={EJERCICIOS[e.exercise_type]?.icono ?? 'ia'} /></span>
                <span className="grow">
                  <span className="item-title">{EJERCICIOS[e.exercise_type]?.label ?? e.exercise_type}</span>
                  <small>{e.duration_min} min, {e.intensity === 'baja' ? 'suave' : e.intensity === 'alta' ? 'intensa' : 'moderada'}{e.description ? `. ${e.description}` : ''}</small>
                </span>
                <span className="item-kcal num">{fmt(e.kcal_est)}<small>kcal</small></span>
                <Icon name="der" size={18} className="chev" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card row between">
        <div className="section-title">
          <span className="badge peso"><Icon name="peso" size={18} /></span>
          <div>
            <h2>Peso</h2>
            <small>{pesoDia ? `${fmt(pesoDia.weight_kg, 1)} kg${pesoDia.waist_cm ? `, cintura ${fmt(pesoDia.waist_cm, 1)} cm` : ''}` : 'Sin registro este día'}</small>
          </div>
        </div>
        <button className="btn small" onClick={() => abrir('peso')}>{pesoDia ? 'Editar' : 'Registrar'}</button>
      </section>
      </div>
    </div>
  );
}
