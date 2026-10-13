import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { EJERCICIOS, ESTADOS, TIPOS_COMIDA, estadoDia, gastoDelDia } from '../lib/calc.js';
import { addDays, formatLargo, todayISO } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { Bar, Icon, MacroBar, Pill, Plate } from '../components/ui.jsx';
import MealForm from '../components/MealForm.jsx';
import { ExerciseForm, FavoritesPicker, WeightForm } from '../components/forms.jsx';

export default function Today({ fecha, setFecha }) {
  const { metas, ctx, exercises, water, weights, userId, reload } = useData();
  const [meals, setMeals] = useState([]);
  const [fotos, setFotos] = useState({});
  const [modal, setModal] = useState(null);
  const [aviso, setAviso] = useState(null);
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
    mostrarAviso(error ? error.message : 'Guardada en comidas frecuentes.');
    if (!error) reload();
  }

  async function borrarEjercicio(e) {
    if (!confirm('¿Eliminar este ejercicio?')) return;
    await supabase.from('exercise_logs').delete().eq('id', e.id);
    reload();
  }

  function mostrarAviso(texto) {
    setAviso(texto);
    setTimeout(() => setAviso(null), 2600);
  }

  async function agregarAgua(ml) {
    await supabase.from('water_logs').insert({ user_id: userId, log_date: fecha, ml });
    mostrarAviso(`+${fmt(ml)} ml de agua`);
    reload();
  }

  async function deshacerAgua() {
    const ultimo = water.filter((w) => w.log_date === fecha).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!ultimo) return;
    await supabase.from('water_logs').delete().eq('id', ultimo.id);
    reload();
  }

  const cerrar = () => setModal(null);

  const sobre = restante < 0;

  return (
    <div className="stack">
      <div className="row between">
        <button className="icon-btn" onClick={() => setFecha(addDays(fecha, -1))} aria-label="Día anterior"><Icon name="izq" size={24} /></button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ textTransform: 'capitalize' }}>{fecha === hoy ? 'Hoy' : formatLargo(fecha)}</h1>
          {fecha === hoy && <small style={{ textTransform: 'capitalize' }}>{formatLargo(fecha)}</small>}
        </div>
        <button className="icon-btn" disabled={fecha >= hoy} onClick={() => setFecha(addDays(fecha, 1))} aria-label="Día siguiente"
          style={{ visibility: fecha >= hoy ? 'hidden' : 'visible' }}><Icon name="der" size={24} /></button>
      </div>

      <section className="card hero">
        <Plate consumido={consumo.kcal} meta={metas.meta} estado={estado}>
          <span className="big num" style={{ color: sobre ? 'var(--tomate)' : undefined }}>{fmt(Math.abs(restante))}</span>
          <small>{sobre ? 'kcal sobre la meta' : 'kcal disponibles'}</small>
        </Plate>
        <div className="hero-meta num">
          <div><b>{fmt(consumo.kcal)}</b><span>consumidas</span></div>
          <div><b>{fmt(metas.meta)}</b><span>meta</span></div>
          <div><b>{fmt(gasto)}</b><span>gasto estimado</span></div>
        </div>
        {estado !== 'sin' && <Pill estado={estado}>{ESTADOS[estado]}</Pill>}
        <div className="macros">
          <MacroBar label="Proteína" value={consumo.protein_g} target={metas.proteina} color="var(--protein)" />
          <MacroBar label="Carbos" value={consumo.carbs_g} target={metas.carbos} color="var(--carbs)" />
          <MacroBar label="Grasas" value={consumo.fat_g} target={metas.grasa} color="var(--fat)" />
        </div>
      </section>

      <button className="btn primary big block" onClick={() => setModal('comida')}>
        <Icon name="camara" size={26} /> Registrar comida o bebida
      </button>

      <div className="quick">
        <button className="tile fav" onClick={() => setModal('favoritas')}>
          <span className="tile-icon"><Icon name="estrella" size={24} /></span>Frecuentes
        </button>
        <button className="tile agua" onClick={() => agregarAgua(250)}>
          <span className="tile-icon"><Icon name="gota" size={24} /></span>Vaso de agua
        </button>
        <button className="tile ejercicio" onClick={() => setModal('ejercicio')}>
          <span className="tile-icon"><Icon name="pesa" size={24} /></span>Ejercicio
        </button>
      </div>

      <section className="card">
        <div className="card-head"><h2>Comidas</h2>{meals.length > 0 && <small className="num">{meals.length} registro{meals.length === 1 ? '' : 's'}</small>}</div>
        {!meals.length && (
          <div className="empty">
            <span className="empty-icon"><Icon name="plato" size={28} /></span>
            <p>Aún no registra comidas este día.</p>
            <small>Tome una foto de su plato y la IA calculará calorías y proteína.</small>
          </div>
        )}
        {TIPOS_COMIDA.map((t) => {
          const grupo = meals.filter((m) => m.meal_type === t.id);
          if (!grupo.length) return null;
          return (
            <div key={t.id}>
              <div className="group-title">{t.label} <span className="num">{fmt(grupo.reduce((s, m) => s + m.kcal, 0))} kcal</span></div>
              <div className="list">
                {grupo.map((m) => (
                  <div className="list-item" key={m.id}>
                    {m.photo_path && fotos[m.photo_path] ? (
                      <img className="thumb" src={fotos[m.photo_path]} alt="" />
                    ) : (
                      <div className="thumb"><Icon name="plato" size={22} /></div>
                    )}
                    <div className="grow">
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.description}</div>
                      <small className="num">
                        {fmt(m.kcal)} kcal · {fmt(m.protein_g)} g proteína
                        {m.source === 'ia' && m.ai_confidence != null && ` · IA ${fmt(m.ai_confidence * 100)}%`}
                      </small>
                    </div>
                    <button className="icon-btn" aria-label="Guardar como frecuente" title="Guardar como frecuente" onClick={() => guardarFavorita(m)}><Icon name="estrella" /></button>
                    <button className="icon-btn" aria-label="Eliminar" title="Eliminar" onClick={() => borrarComida(m)}><Icon name="basura" /></button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Agua</h2>
          <span className="num" style={{ fontWeight: 700 }}>{fmt(aguaDia)} <small>/ {fmt(metas.agua)} ml</small></span>
        </div>
        <Bar value={aguaDia} max={metas.agua} color="var(--agua)" />
        <div className="row wrap">
          <button className="btn small water" onClick={() => agregarAgua(250)}>+ 250 ml</button>
          <button className="btn small water" onClick={() => agregarAgua(500)}>+ 500 ml</button>
          <button className="btn small water" onClick={() => agregarAgua(1000)}>+ 1 L</button>
          {aguaDia > 0 && <button className="btn small ghost" onClick={deshacerAgua}>Deshacer</button>}
        </div>
        <small>Solo agua. Jugos, bebidas o café con leche se registran como comida, en “Bebida”.</small>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Ejercicio</h2>
          <button className="btn small" onClick={() => setModal('ejercicio')}>+ Agregar</button>
        </div>
        {!ejerciciosDia.length && <p className="muted">Sin ejercicio registrado este día.</p>}
        <div className="list">
          {ejerciciosDia.map((e) => (
            <div className="list-item" key={e.id}>
              <div className="thumb" style={{ background: 'var(--palta-soft)', color: 'var(--palta)' }}><Icon name="pesa" size={22} /></div>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{EJERCICIOS[e.exercise_type]?.label ?? e.exercise_type} · {e.duration_min} min</div>
                <small>{e.description || `Intensidad ${e.intensity}`} · <span className="num">{fmt(e.kcal_est)} kcal</span></small>
              </div>
              <button className="icon-btn" aria-label="Eliminar" title="Eliminar" onClick={() => borrarEjercicio(e)}><Icon name="basura" /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="card row between">
        <div className="row">
          <div className="thumb" style={{ background: 'var(--choclo-soft)', color: 'var(--choclo-dark)' }}><Icon name="balanza" size={22} /></div>
          <div>
            <h2>Peso</h2>
            <small>{pesoHoy ? `${fmt(pesoHoy.weight_kg, 1)} kg${pesoHoy.waist_cm ? ` · cintura ${fmt(pesoHoy.waist_cm, 1)} cm` : ''}` : 'Sin registro este día'}</small>
          </div>
        </div>
        <button className="btn small" onClick={() => setModal('peso')}>{pesoHoy ? 'Editar' : 'Registrar'}</button>
      </section>

      {aviso && <div className="toast" role="status">{aviso}</div>}
      {modal === 'comida' && <MealForm fecha={fecha} onClose={cerrar} />}
      {modal === 'favoritas' && <FavoritesPicker fecha={fecha} onClose={cerrar} />}
      {modal === 'ejercicio' && <ExerciseForm fecha={fecha} onClose={cerrar} />}
      {modal === 'peso' && <WeightForm fecha={fecha} onClose={cerrar} />}
    </div>
  );
}
