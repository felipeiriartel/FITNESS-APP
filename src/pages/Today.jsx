import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { EJERCICIOS, ESTADOS, TIPOS_COMIDA, estadoDia, gastoDelDia } from '../lib/calc.js';
import { addDays, formatLargo, fromISO, todayISO } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { Bar, Icon, Macro, Pill, Ring, useToast } from '../components/ui.jsx';
import WaterInput from '../components/WaterInput.jsx';
import { useFotos } from '../lib/useFotos.js';

export default function Today({ fecha, setFecha, abrir }) {
  const { metas, ctx, exercises, water, weights, userId, reload } = useData();
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
  const pesoDia = weights.find((w) => w.log_date === fecha);

  async function borrarComida(m) {
    if (!confirm(`¿Eliminar "${m.description}"?`)) return;
    const { error } = await supabase.from('meals').delete().eq('id', m.id);
    if (error) return toast(error.message, 'error');
    if (m.photo_path) await supabase.storage.from('meal-photos').remove([m.photo_path]);
    toast('Registro eliminado');
    reload();
  }

  async function guardarFavorita(m) {
    const { error } = await supabase.from('favorite_meals').insert({
      user_id: userId, name: m.description, meal_type: m.meal_type, kcal: m.kcal,
      protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, items: m.items,
    });
    if (error) return toast(error.message, 'error');
    toast('⭐ Guardada en comidas frecuentes');
    reload();
  }

  async function borrarEjercicio(e) {
    if (!confirm('¿Eliminar este ejercicio?')) return;
    const { error } = await supabase.from('exercise_logs').delete().eq('id', e.id);
    if (error) return toast(error.message, 'error');
    toast('Ejercicio eliminado');
    reload();
  }

  async function deshacerAgua() {
    const ultimo = water.filter((w) => w.log_date === fecha).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!ultimo) return;
    await supabase.from('water_logs').delete().eq('id', ultimo.id);
    toast(`Se quitaron ${ultimo.ml} ml de agua`);
    reload();
  }

  return (
    <div className="stack">
      <header className="page-head">
        <button className="icon-btn round" onClick={() => setFecha(addDays(fecha, -1))} aria-label="Día anterior"><Icon name="izq" /></button>
        <div className="titles">
          <h1 style={{ textTransform: 'capitalize' }}>
            {fecha === hoy ? 'Hoy' : fecha === addDays(hoy, -1) ? 'Ayer' : fromISO(fecha).toLocaleDateString('es-CL', { weekday: 'long' })}
          </h1>
          <small>{formatLargo(fecha)}</small>
        </div>
        <button className="icon-btn round" onClick={() => setFecha(addDays(fecha, 1))} aria-label="Día siguiente"
          style={{ visibility: fecha >= hoy ? 'hidden' : 'visible' }}><Icon name="der" /></button>
      </header>

      <section className="hero" aria-label="Resumen de calorías">
        <Ring value={consumo.kcal} max={metas.meta} estado={estado === 'sin' ? 'ok' : estado}>
          <span className="value num" style={{ color: restante < 0 ? 'var(--aji)' : undefined }}>
            {fmt(Math.abs(restante))}
          </span>
          <span className="label">{restante < 0 ? 'kcal sobre la meta' : 'kcal disponibles'}</span>
        </Ring>
        <Pill estado={estado}>{ESTADOS[estado]}</Pill>
        <div className="hero-stats">
          <div className="stat"><b className="num">{fmt(consumo.kcal)}</b><span>Consumido</span></div>
          <div className="stat"><b className="num">{fmt(metas.meta)}</b><span>Meta</span></div>
          <div className="stat"><b className="num">{fmt(gasto)}</b><span>Gasto estimado</span></div>
        </div>
      </section>

      <div className="macros">
        <Macro nombre="Proteína" value={consumo.protein_g} target={metas.proteina} color="var(--ciruela)" />
        <Macro nombre="Carbohidratos" value={consumo.carbs_g} target={metas.carbos} color="var(--zapallo)" />
        <Macro nombre="Grasas" value={consumo.fat_g} target={metas.grasa} color="var(--aceite)" />
      </div>

      <button className="btn primary big block" onClick={() => abrir('comida')}>
        <span className="emoji">📷</span> Registrar comida con foto
      </button>
      <div className="quick-row">
        <button className="btn" onClick={() => abrir('texto')}><span className="emoji" aria-hidden="true">✍️</span>Escribir</button>
        <button className="btn" onClick={() => abrir('codigo')}><span className="emoji" aria-hidden="true">🔲</span>Código</button>
        <button className="btn" onClick={() => abrir('favoritas')}><span className="emoji" aria-hidden="true">⭐</span>Frecuente</button>
      </div>
      <button className="btn block" onClick={() => abrir('sugerir')}>
        <span className="emoji" aria-hidden="true">💡</span> ¿Qué puedo comer ahora?
      </button>

      <section className="card">
        <div className="card-head">
          <h2>Comidas</h2>
          <small className="num">{meals.length ? `${meals.length} ${meals.length === 1 ? 'registro' : 'registros'}` : ''}</small>
        </div>
        {!meals.length && (
          <div className="empty">
            <span className="emoji">🍽️</span>
            Aún no hay comidas este día. Tome una foto de su plato para empezar.
          </div>
        )}
        {TIPOS_COMIDA.map((t) => {
          const grupo = meals.filter((m) => m.meal_type === t.id);
          if (!grupo.length) return null;
          return (
            <div key={t.id} className="group">
              <div className="group-title">
                <span><span aria-hidden="true">{t.emoji}</span>{t.label}</span>
                <span className="num muted">{fmt(grupo.reduce((s, m) => s + m.kcal, 0))} kcal</span>
              </div>
              <div className="list">
                {grupo.map((m) => (
                  <div className="list-item" key={m.id}>
                    {m.photo_path && fotos[m.photo_path] ? (
                      <img className="thumb" src={fotos[m.photo_path]} alt="" />
                    ) : (
                      <div className="thumb" aria-hidden="true">{t.emoji}</div>
                    )}
                    <div className="grow">
                      <div className="item-title">{m.description}</div>
                      <div className="tags">
                        <span className="tag p">P {fmt(m.protein_g)} g</span>
                        <span className="tag c">C {fmt(m.carbs_g)} g</span>
                        <span className="tag g">G {fmt(m.fat_g)} g</span>
                      </div>
                    </div>
                    <div className="item-side">
                      <span className="item-kcal num">{fmt(m.kcal)}</span>
                      <span className="item-actions">
                        <button className="icon-btn" title="Guardar como frecuente" aria-label="Guardar como frecuente" onClick={() => guardarFavorita(m)}><Icon name="estrella" size={18} /></button>
                        <button className="icon-btn" title="Eliminar" aria-label="Eliminar" onClick={() => borrarComida(m)}><Icon name="basura" size={18} /></button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="card stack">
        <div className="row between">
          <div className="section-title"><span className="emoji" aria-hidden="true">💧</span><h2>Agua</h2></div>
          <span><span className="water-value num">{fmt(aguaDia / 1000, 2)}</span> <small>/ {fmt(metas.agua / 1000, 1)} L</small></span>
        </div>
        <Bar value={aguaDia} max={metas.agua} color="var(--agua)" />
        <WaterInput fecha={fecha} />
        {aguaDia > 0 && <button className="btn small ghost" onClick={deshacerAgua}>Deshacer el último registro</button>}
        <small>Registre aquí solo agua. Jugos, bebidas o café con leche se registran como comida, en “Bebida”.</small>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="section-title"><span className="emoji" aria-hidden="true">🏋️</span><h2>Ejercicio</h2></div>
          <button className="btn small" onClick={() => abrir('ejercicio')}>Agregar</button>
        </div>
        {!ejerciciosDia.length && <p className="muted">Sin ejercicio registrado este día.</p>}
        <div className="list">
          {ejerciciosDia.map((e) => (
            <div className="list-item" key={e.id}>
              <div className="thumb" aria-hidden="true">{EJERCICIOS[e.exercise_type]?.emoji ?? '✨'}</div>
              <div className="grow">
                <div className="item-title">{EJERCICIOS[e.exercise_type]?.label ?? e.exercise_type}</div>
                <small>{e.duration_min} min, intensidad {e.intensity}{e.description ? `. ${e.description}` : ''}</small>
              </div>
              <span className="item-kcal num">{fmt(e.kcal_est)}</span>
              <button className="icon-btn" title="Eliminar" aria-label="Eliminar ejercicio" onClick={() => borrarEjercicio(e)}><Icon name="basura" size={19} /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="card row between">
        <div className="section-title">
          <span className="emoji" aria-hidden="true">⚖️</span>
          <div>
            <h2>Peso</h2>
            <small>{pesoDia ? `${fmt(pesoDia.weight_kg, 1)} kg${pesoDia.waist_cm ? `, cintura ${fmt(pesoDia.waist_cm, 1)} cm` : ''}` : 'Sin registro este día'}</small>
          </div>
        </div>
        <button className="btn small" onClick={() => abrir('peso')}>{pesoDia ? 'Editar' : 'Registrar'}</button>
      </section>
    </div>
  );
}
