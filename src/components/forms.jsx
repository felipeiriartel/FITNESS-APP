import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { EJERCICIOS, NIVELES_ACTIVIDAD, TIPOS_COMIDA, kcalEjercicio } from '../lib/calc.js';
import { todayISO } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { ErrorBox, Modal, useToast } from './ui.jsx';
import { tipoPorHora } from './MealForm.jsx';
import { useFotos } from '../lib/useFotos.js';

const num = (v) => parseFloat(String(v).replace(',', '.'));

/* ---------------- Comidas frecuentes ---------------- */
export function FavoritesPicker({ fecha, onClose }) {
  const { favorites, userId, reload } = useData();
  const toast = useToast();
  const [tipo, setTipo] = useState(tipoPorHora());
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const fotos = useFotos(favorites.map((f) => f.photo_path));

  async function agregar(f, porciones = 1) {
    setOcupado(true);
    const r = (x) => Math.round(Number(x) * porciones * 10) / 10;
    const { error: e } = await supabase.from('meals').insert({
      user_id: userId, log_date: fecha, meal_type: tipo,
      description: porciones === 1 ? f.name : `${f.name} (×${porciones})`,
      kcal: Math.round(f.kcal * porciones), protein_g: r(f.protein_g), carbs_g: r(f.carbs_g), fat_g: r(f.fat_g),
      items: f.items, source: 'favorita',
    });
    setOcupado(false);
    if (e) return setError(e.message);
    toast(`⭐ ${f.name} registrada`);
    await reload();
    onClose();
  }

  return (
    <Modal title="Comidas frecuentes" onClose={onClose}>
      <div className="stack">
        <div className="chips" role="radiogroup" aria-label="Registrar como">
          {TIPOS_COMIDA.map((t) => (
            <button key={t.id} role="radio" aria-checked={tipo === t.id} className={`chip${tipo === t.id ? ' on' : ''}`} onClick={() => setTipo(t.id)}>
              <span className="emoji" aria-hidden="true">{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>
        <ErrorBox>{error}</ErrorBox>
        {!favorites.length && (
          <div className="empty">
            <span className="emoji">⭐</span>
            Aún no tiene comidas frecuentes. Al registrar una comida, marque “Guardar como comida frecuente” o toque la estrella en la lista del día.
          </div>
        )}
        <div className="list">
          {favorites.map((f) => (
            <div className="list-item" key={f.id}>
              {f.photo_path && fotos[f.photo_path]
                ? <img className="thumb" src={fotos[f.photo_path]} alt="" />
                : <div className="thumb" aria-hidden="true">{TIPOS_COMIDA.find((t) => t.id === f.meal_type)?.emoji ?? '⭐'}</div>}
              <div className="grow">
                <div className="item-title">{f.name}</div>
                <small className="num">{fmt(f.kcal)} kcal, {fmt(f.protein_g)} g de proteína</small>
              </div>
              <button className="btn small" disabled={ocupado} onClick={() => agregar(f, 0.5)} aria-label={`Media porción de ${f.name}`}>½</button>
              <button className="btn small primary" disabled={ocupado} onClick={() => agregar(f, 1)}>Agregar</button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Ejercicio ---------------- */
export function ExerciseForm({ fecha, onClose }) {
  const { userId, reload, metas } = useData();
  const toast = useToast();
  const [tipo, setTipo] = useState('pesas');
  const [intensidad, setIntensidad] = useState('moderada');
  const [minutos, setMinutos] = useState('60');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const peso = metas?.peso ?? 70;
  const kcal = kcalEjercicio(tipo, intensidad, num(minutos) || 0, peso);

  async function guardar() {
    const m = Math.round(num(minutos));
    if (!m || m < 1 || m > 600) return setError('Indique una duración entre 1 y 600 minutos.');
    setOcupado(true);
    const { error: e } = await supabase.from('exercise_logs').insert({
      user_id: userId, log_date: fecha, exercise_type: tipo, intensity: intensidad,
      duration_min: m, description: descripcion.trim() || null, kcal_est: kcal,
    });
    setOcupado(false);
    if (e) return setError(e.message);
    toast(`${EJERCICIOS[tipo].emoji} ${EJERCICIOS[tipo].label}: ${m} min registrados`);
    await reload();
    onClose();
  }

  return (
    <Modal title="Registrar ejercicio" onClose={onClose}>
      <div className="stack">
        <div className="chips" role="radiogroup" aria-label="Tipo de ejercicio">
          {Object.entries(EJERCICIOS).map(([id, e]) => (
            <button key={id} role="radio" aria-checked={tipo === id} className={`chip${tipo === id ? ' on' : ''}`} onClick={() => setTipo(id)}>
              <span className="emoji" aria-hidden="true">{e.emoji}</span>{e.label}
            </button>
          ))}
        </div>
        <label className="field">
          Duración (minutos)
          <input inputMode="numeric" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
        </label>
        <div className="stack" style={{ gap: 4 }}>
          <small className="muted">Intensidad</small>
          <div className="seg">
            {['baja', 'moderada', 'alta'].map((i) => (
              <button key={i} className={intensidad === i ? 'on' : ''} onClick={() => setIntensidad(i)}>
                {i[0].toUpperCase() + i.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          Qué hizo (opcional)
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: pierna — sentadilla 4×10, prensa 3×12, peso muerto rumano 3×10" />
        </label>
        <div className="alert info">
          Gasto estimado: <b className="num">{fmt(kcal)} kcal</b>. Para su balance diario se considera el 75% de este valor,
          porque las fórmulas suelen sobreestimar el gasto del ejercicio.
        </div>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn primary big block" disabled={ocupado} onClick={guardar}>Guardar ejercicio</button>
      </div>
    </Modal>
  );
}

/* ---------------- Peso y cintura ---------------- */
export function WeightForm({ fecha = todayISO(), onClose }) {
  const { userId, reload, weights } = useData();
  const toast = useToast();
  const existente = weights.find((w) => w.log_date === fecha);
  const [dia, setDia] = useState(fecha);
  const [peso, setPeso] = useState(existente ? String(existente.weight_kg) : '');
  const [cintura, setCintura] = useState(existente?.waist_cm ? String(existente.waist_cm) : '');
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    const p = num(peso);
    const c = cintura.trim() ? num(cintura) : null;
    if (!(p >= 25 && p <= 400)) return setError('Ingrese un peso válido en kilos.');
    if (c != null && !(c >= 40 && c <= 250)) return setError('Ingrese una cintura válida en centímetros.');
    setOcupado(true);
    const { error: e } = await supabase
      .from('weight_logs')
      .upsert({ user_id: userId, log_date: dia, weight_kg: p, waist_cm: c }, { onConflict: 'user_id,log_date' });
    setOcupado(false);
    if (e) return setError(e.message);
    toast(`⚖️ ${fmt(p, 1)} kg registrados`);
    await reload();
    onClose();
  }

  return (
    <Modal title="Registrar peso" onClose={onClose}>
      <div className="stack">
        <label className="field">
          Fecha
          <input type="date" value={dia} max={todayISO()} onChange={(e) => setDia(e.target.value)} />
        </label>
        <div className="grid2">
          <label className="field">
            Peso (kg)
            <input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="81,0" />
          </label>
          <label className="field">
            Cintura (cm, opcional)
            <input inputMode="decimal" value={cintura} onChange={(e) => setCintura(e.target.value)} placeholder="92" />
          </label>
        </div>
        <ComoMedir />
        <ErrorBox>{error}</ErrorBox>
        <button className="btn primary big block" disabled={ocupado} onClick={guardar}>Guardar peso</button>
      </div>
    </Modal>
  );
}

export function ComoMedir() {
  return (
    <details>
      <summary>¿Cómo pesarse y medir la cintura correctamente?</summary>
      <div className="stack" style={{ gap: 6, marginTop: 8, fontSize: '0.9rem' }}>
        <p><b>Peso:</b> en la mañana, después de ir al baño, antes de comer o beber y con poca ropa. Idealmente a diario o al menos 3 veces por semana; la app usa el promedio semanal, por lo que las subidas de un día no importan.</p>
        <p><b>Cintura:</b> una vez por semana, el mismo día y en las mismas condiciones que el peso.</p>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Póngase de pie, relajado, con los pies juntos y el abdomen sin apretar ni inflar.</li>
          <li>Use una huincha de costura. Rodee la cintura a la altura del ombligo (o en el punto medio entre la última costilla y el hueso de la cadera; use siempre el mismo punto).</li>
          <li>La huincha debe quedar horizontal, ajustada pero sin hundir la piel.</li>
          <li>Bote el aire de forma normal y lea la medida al final de la exhalación.</li>
          <li>Mida dos veces y anote el promedio.</li>
        </ol>
      </div>
    </details>
  );
}

/* ---------------- Perfil ---------------- */
export function ProfileForm({ inicial, conPeso, onSaved, textoBoton = 'Guardar' }) {
  const { userId, reload } = useData();
  const toast = useToast();
  const [f, setF] = useState({
    display_name: inicial?.display_name ?? '',
    sex: inicial?.sex ?? 'M',
    birth_date: inicial?.birth_date ?? '',
    height_cm: inicial?.height_cm ?? '',
    activity_level: inicial?.activity_level ?? 'sedentaria',
    goal_rate_kg_week: inicial?.goal_rate_kg_week ?? 0.5,
    protein_g_per_kg: inicial?.protein_g_per_kg ?? 1.7,
    usual_exercise_hours_week: inicial?.usual_exercise_hours_week ?? '',
    target_mode: inicial?.target_mode ?? 'auto',
    manual_target_kcal: inicial?.manual_target_kcal ?? '',
    peso: '',
  });
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function guardar() {
    const h = num(f.height_cm);
    if (!f.birth_date) return setError('Indique su fecha de nacimiento.');
    if (!(h >= 100 && h <= 250)) return setError('Indique su estatura en centímetros (ej: 170).');
    const p = num(f.peso);
    if (conPeso && !(p >= 25 && p <= 400)) return setError('Indique su peso actual en kilos.');
    const horas = String(f.usual_exercise_hours_week).trim() ? num(f.usual_exercise_hours_week) : 0;
    if (!(horas >= 0 && horas <= 40)) return setError('Las horas de ejercicio semanales deben estar entre 0 y 40.');
    const manual = f.target_mode === 'manual' ? Math.round(num(f.manual_target_kcal)) : null;
    if (f.target_mode === 'manual' && !(manual >= 1000 && manual <= 6000)) {
      return setError('La meta manual debe estar entre 1.000 y 6.000 kcal.');
    }
    setOcupado(true);
    setError(null);
    const { error: e1 } = await supabase.from('profiles').upsert({
      user_id: userId,
      display_name: f.display_name.trim() || null,
      sex: f.sex,
      birth_date: f.birth_date,
      height_cm: h,
      activity_level: f.activity_level,
      goal_rate_kg_week: Number(f.goal_rate_kg_week),
      protein_g_per_kg: Number(f.protein_g_per_kg),
      usual_exercise_hours_week: horas,
      target_mode: f.target_mode,
      manual_target_kcal: manual,
    });
    if (!e1 && conPeso) {
      const { error: e2 } = await supabase
        .from('weight_logs')
        .upsert({ user_id: userId, log_date: todayISO(), weight_kg: p }, { onConflict: 'user_id,log_date' });
      if (e2) {
        setOcupado(false);
        return setError(e2.message);
      }
    }
    setOcupado(false);
    if (e1) return setError(e1.message);
    if (!conPeso) toast('Perfil y metas actualizados');
    await reload();
    onSaved?.();
  }

  return (
    <div className="stack">
      <label className="field">
        Nombre (opcional)
        <input value={f.display_name} onChange={set('display_name')} />
      </label>
      <div className="grid2">
        <label className="field">
          Sexo
          <select value={f.sex} onChange={set('sex')}>
            <option value="M">Hombre</option>
            <option value="F">Mujer</option>
          </select>
        </label>
        <label className="field">
          Fecha de nacimiento
          <input type="date" value={f.birth_date} onChange={set('birth_date')} max={todayISO()} />
        </label>
        <label className="field">
          Estatura (cm)
          <input inputMode="decimal" value={f.height_cm} onChange={set('height_cm')} placeholder="170" />
        </label>
        {conPeso && (
          <label className="field">
            Peso actual (kg)
            <input inputMode="decimal" value={f.peso} onChange={set('peso')} placeholder="81" />
          </label>
        )}
      </div>
      <label className="field">
        Actividad diaria, sin contar el ejercicio
        <select value={f.activity_level} onChange={set('activity_level')}>
          {Object.entries(NIVELES_ACTIVIDAD).map(([id, n]) => (
            <option key={id} value={id}>{n.label} — {n.detalle}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Horas de ejercicio habituales por semana
        <input inputMode="decimal" value={f.usual_exercise_hours_week} onChange={set('usual_exercise_hours_week')} placeholder="Ej: 6" />
        <small>Se usa al inicio; con 4 semanas de registros, la app calcula con su ejercicio real.</small>
      </label>
      <div className="grid2">
        <label className="field">
          Ritmo de baja deseado
          <select value={f.goal_rate_kg_week} onChange={set('goal_rate_kg_week')}>
            <option value={0}>Mantener peso</option>
            <option value={0.25}>0,25 kg por semana</option>
            <option value={0.5}>0,5 kg por semana (recomendado)</option>
            <option value={0.75}>0,75 kg por semana</option>
            <option value={1}>1 kg por semana</option>
          </select>
        </label>
        <label className="field">
          Proteína diaria
          <select value={f.protein_g_per_kg} onChange={set('protein_g_per_kg')}>
            <option value={1.2}>1,2 g/kg (sin entrenamiento de fuerza)</option>
            <option value={1.6}>1,6 g/kg</option>
            <option value={1.7}>1,7 g/kg (recomendado con pesas)</option>
            <option value={2}>2,0 g/kg</option>
            <option value={2.2}>2,2 g/kg</option>
          </select>
        </label>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <small className="muted">Meta de calorías</small>
        <div className="seg">
          <button className={f.target_mode === 'auto' ? 'on' : ''} onClick={() => setF((p) => ({ ...p, target_mode: 'auto' }))}>Automática</button>
          <button className={f.target_mode === 'manual' ? 'on' : ''} onClick={() => setF((p) => ({ ...p, target_mode: 'manual' }))}>Manual</button>
        </div>
        {f.target_mode === 'manual' ? (
          <input inputMode="numeric" value={f.manual_target_kcal} onChange={set('manual_target_kcal')} placeholder="2100" aria-label="Meta manual en kcal" />
        ) : (
          <small>Se calcula con su gasto estimado y se ajusta sola cada semana según su avance real.</small>
        )}
      </div>
      <p className="muted" style={{ fontSize: '0.82rem' }}>
        Por seguridad, la meta automática nunca baja de su metabolismo basal ni de 1.500 kcal (hombres) o 1.200 kcal (mujeres),
        y el ritmo se limita al 1% del peso corporal por semana.
      </p>
      <ErrorBox>{error}</ErrorBox>
      <button className="btn primary big block" disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : textoBoton}</button>
    </div>
  );
}

