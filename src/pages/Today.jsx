import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { EJERCICIOS, ESTADOS, TIPOS_COMIDA, estadoDia, gastoDelDia } from '../lib/calc.js';
import { addDays, formatLargo, todayISO } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { Bar, Icon, MacroBar, Pill } from '../components/ui.jsx';
import MealForm from '../components/MealForm.jsx';
import { ExerciseForm, FavoritesPicker, WeightForm } from '../components/forms.jsx';

const COLOR_ESTADO = { ok: 'var(--ok)', leve: 'var(--warn)', exceso: 'var(--bad)', bajo: 'var(--low)', sin: 'var(--line)' };

export default function Today({ fecha, setFecha }) {
  const { metas, ctx, exercises, water, weights, userId, reload } = useData();
  const [meals, setMeals] = useState([]);
  const [fotos, setFotos] = useState({});
  const [modal, setModal] = useState(null);
  const hoy = todayISO();

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('meals')
      .select('*')
      .eq('log_date', fecha)
      .order('created_at');
    setMeals(data ?? []);
    const paths = (data ?? []).map((m) => m.photo_path).filter(Boolean);
    if (paths.length) {
      const { data: urls } = await supabase.storage.from('meal-photos').createSignedUrls(paths, 3600);
      setFotos(Object.fromEntries((urls ?? []).filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl])));
    } else setFotos({});
  }, [fecha]);

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
  const pesoHoy = weights.find((w) => w.log_date === fecha);

  async function borrarComida(m) {
    if (!confirm(`¿Eliminar "${m.description}"?`)) return;
    await supabase.from('meals').delete().eq('id', m.id);
    if (m.photo_path) await supabase.storage.from('meal-photos').remove([m.photo_path]);
    reload();
  }

  async function guardarFavorita(m) {
    const { error } = await supabase.from('favorite_meals').insert({
      user_id: userId, name: m.description, meal_type: m.meal_type, kcal: m.kcal,
      protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, items: m.items,
    });
    alert(error ? error.message : 'Guardada en comidas frecuentes.');
    if (!error) reload();
  }

  async function borrarEjercicio(e) {
    if (!confirm('¿Eliminar este ejercicio?')) return;
    await supabase.from('exercise_logs').delete().eq('id', e.id);
    reload();
  }

  async function agregarAgua(ml) {
    await supabase.from('water_logs').insert({ user_id: userId, log_date: fecha, ml });
    reload();
  }

  async function deshacerAgua() {
    const ultimo = water.filter((w) => w.log_date === fecha).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!ultimo) return;
    await supabase.from('water_logs').delete().eq('id', ultimo.id);
    reload();
  }

  const cerrar = () => setModal(null);

  return (
    <div className="stack">
      <div className="row between">
        <button className="icon-btn" onClick={() => setFecha(addDays(fecha, -1))} aria-label="Día anterior"><Icon name="izq" /></button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ textTransform: 'capitalize' }}>{fecha === hoy ? 'Hoy' : formatLargo(fecha)}</h1>
          {fecha === hoy && <small style={{ textTransform: 'capitalize' }}>{formatLargo(fecha)}</small>}
        </div>
        <button className="icon-btn" disabled={fecha >= hoy} onClick={() => setFecha(addDays(fecha, 1))} aria-label="Día siguiente"
          style={{ visibility: fecha >= hoy ? 'hidden' : 'visible' }}><Icon name="der" /></button>
      </div>

      <section className="card stack">
        <div className="row between">
          <div>
            <div className="big num">{fmt(consumo.kcal)}</div>
            <small>de {fmt(metas.meta)} kcal</small>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: '1.3rem', fontWeight: 700, color: restante < 0 ? 'var(--bad)' : 'var(--text)' }}>
              {restante < 0 ? `+${fmt(-restante)}` : fmt(restante)}
            </div>
            <small>{restante < 0 ? 'kcal sobre la meta' : 'kcal disponibles'}</small>
          </div>
        </div>
        <Bar value={consumo.kcal} max={metas.meta} color={COLOR_ESTADO[estado]} />
        <div className="row between wrap">
          <Pill estado={estado}>{ESTADOS[estado]}</Pill>
          <small className="num">Gasto estimado del día: {fmt(gasto)} kcal · Balance: {consumo.kcal ? fmt(consumo.kcal - gasto) : '—'}</small>
        </div>
        <MacroBar label="Proteína" value={consumo.protein_g} target={metas.proteina} color="var(--protein)" />
        <MacroBar label="Carbohidratos" value={consumo.carbs_g} target={metas.carbos} color="var(--carbs)" />
        <MacroBar label="Grasas" value={consumo.fat_g} target={metas.grasa} color="var(--fat)" />
      </section>

      <div className="grid2">
        <button className="btn primary" onClick={() => setModal('comida')}>+ Comida o bebida</button>
        <button className="btn" onClick={() => setModal('favoritas')}>Comidas frecuentes</button>
      </div>

      <section className="card">
        <div className="card-head"><h2>Comidas</h2><small className="num">{meals.length} registro{meals.length === 1 ? '' : 's'}</small></div>
        {!meals.length && <p className="muted">Sin registros. Tome una foto de su plato y la IA calculará calorías y macros.</p>}
        {TIPOS_COMIDA.map((t) => {
          const grupo = meals.filter((m) => m.meal_type === t.id);
          if (!grupo.length) return null;
          return (
            <div key={t.id}>
              <div className="group-title">{t.label} · <span className="num">{fmt(grupo.reduce((s, m) => s + m.kcal, 0))} kcal</span></div>
              <div className="list">
                {grupo.map((m) => (
                  <div className="list-item" key={m.id}>
                    {m.photo_path && fotos[m.photo_path] ? (
                      <img className="thumb" src={fotos[m.photo_path]} alt="" />
                    ) : (
                      <div className="thumb" />
                    )}
                    <div className="grow">
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.description}</div>
                      <small className="num">
                        {fmt(m.kcal)} kcal · P {fmt(m.protein_g)} · C {fmt(m.carbs_g)} · G {fmt(m.fat_g)}
                        {m.source === 'ia' && m.ai_confidence != null && ` · IA ${fmt(m.ai_confidence * 100)}%`}
                      </small>
                    </div>
                    <button className="icon-btn" title="Guardar como frecuente" onClick={() => guardarFavorita(m)}><Icon name="estrella" size={18} /></button>
                    <button className="icon-btn" title="Eliminar" onClick={() => borrarComida(m)}><Icon name="basura" size={18} /></button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="card stack">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h2>Agua</h2>
          <small className="num">{fmt(aguaDia)} / {fmt(metas.agua)} ml</small>
        </div>
        <Bar value={aguaDia} max={metas.agua} color="var(--water)" />
        <div className="row wrap">
          <button className="btn small" onClick={() => agregarAgua(250)}>+ 250 ml</button>
          <button className="btn small" onClick={() => agregarAgua(500)}>+ 500 ml</button>
          <button className="btn small" onClick={() => agregarAgua(1000)}>+ 1 L</button>
          {aguaDia > 0 && <button className="btn small ghost" onClick={deshacerAgua}>Deshacer</button>}
        </div>
        <small>Registre aquí solo agua. Las bebidas con calorías (jugos, bebidas, café con leche) van como “Bebida”.</small>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Ejercicio</h2>
          <button className="btn small" onClick={() => setModal('ejercicio')}>+ Ejercicio</button>
        </div>
        {!ejerciciosDia.length && <p className="muted">Sin ejercicio registrado este día.</p>}
        <div className="list">
          {ejerciciosDia.map((e) => (
            <div className="list-item" key={e.id}>
              <div className="grow">
                <div>{EJERCICIOS[e.exercise_type]?.label ?? e.exercise_type} · {e.duration_min} min · {e.intensity}</div>
                {e.description && <small>{e.description}</small>}
              </div>
              <small className="num">{fmt(e.kcal_est)} kcal</small>
              <button className="icon-btn" title="Eliminar" onClick={() => borrarEjercicio(e)}><Icon name="basura" size={18} /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="card row between">
        <div>
          <h2>Peso</h2>
          <small>{pesoHoy ? `${fmt(pesoHoy.weight_kg, 1)} kg${pesoHoy.waist_cm ? ` · cintura ${fmt(pesoHoy.waist_cm, 1)} cm` : ''}` : 'Sin registro este día'}</small>
        </div>
        <button className="btn small" onClick={() => setModal('peso')}>{pesoHoy ? 'Editar' : 'Registrar'}</button>
      </section>

      {modal === 'comida' && <MealForm fecha={fecha} onClose={cerrar} />}
      {modal === 'favoritas' && <FavoritesPicker fecha={fecha} onClose={cerrar} />}
      {modal === 'ejercicio' && <ExerciseForm fecha={fecha} onClose={cerrar} />}
      {modal === 'peso' && <WeightForm fecha={fecha} onClose={cerrar} />}
    </div>
  );
}
