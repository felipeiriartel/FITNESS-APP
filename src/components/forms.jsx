import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { EJERCICIOS, NIVELES_ACTIVIDAD, TIPOS_COMIDA, descripcionIntensidad, kcalEjercicio } from '../lib/calc.js';
import { todayISO } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { ErrorBox, Icon, Modal, useToast } from './ui.jsx';
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
    toast(`${f.name} registrada`);
    await reload();
    onClose();
  }

  return (
    <Modal title="Comidas frecuentes" onClose={onClose}>
      <div className="stack">
        <div className="chips scroll" role="radiogroup" aria-label="Registrar como">
          {TIPOS_COMIDA.map((t) => (
            <button key={t.id} role="radio" aria-checked={tipo === t.id} className={`chip${tipo === t.id ? ' on' : ''}`} onClick={() => setTipo(t.id)}>
              <Icon name={t.icono} size={20} />{t.label}
            </button>
          ))}
        </div>
        <ErrorBox>{error}</ErrorBox>
        {!favorites.length && (
          <div className="empty">
            <Icon name="estrella" size={36} stroke={1.6} />
            Aún no tiene comidas frecuentes. Al registrar una comida, marque “Guardar como comida frecuente” antes de guardarla.
          </div>
        )}
        <div className="list">
          {favorites.map((f) => (
            <div className="list-item" key={f.id}>
              {f.photo_path && fotos[f.photo_path]
                ? <img className="thumb" src={fotos[f.photo_path]} alt="" />
                : <div className="thumb" aria-hidden="true"><Icon name={TIPOS_COMIDA.find((t) => t.id === f.meal_type)?.icono ?? 'estrella'} /></div>}
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
const MINUTOS_RAPIDOS = [20, 30, 45, 60, 75, 90, 120];
const TIPOS_PRINCIPALES = ['pesas', 'futbol', 'pichanga', 'correr', 'caminar', 'bicicleta'];

/**
 * Registrar o editar un ejercicio.
 * El gasto se estima con tiempo e intensidad (MET), o se toma de las calorías activas del reloj.
 */
export function ExerciseForm({ fecha, onClose, existente }) {
  const { userId, reload, metas, exercises } = useData();
  const toast = useToast();
  const peso = metas?.peso ?? 70;
  const [tipo, setTipo] = useState(existente?.exercise_type ?? 'pesas');
  const [intensidad, setIntensidad] = useState(existente?.intensity ?? 'moderada');
  const [minutos, setMinutos] = useState(String(existente?.duration_min ?? 60));
  const [descripcion, setDescripcion] = useState(existente?.description ?? '');
  // Si las calorías guardadas se alejan bastante de la estimación, el registro vino del reloj.
  // (Se deja un margen porque el peso pudo cambiar desde que se registró.)
  const estimadaOriginal = existente ? kcalEjercicio(existente.exercise_type, existente.intensity, existente.duration_min, peso) : 0;
  const desdeReloj = Boolean(existente)
    && Math.abs(existente.kcal_est - estimadaOriginal) > Math.max(15, estimadaOriginal * 0.12);
  const [modo, setModo] = useState(desdeReloj ? 'reloj' : 'estimar');
  const [kcalReloj, setKcalReloj] = useState(desdeReloj ? String(existente.kcal_est) : '');
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [todosLosTipos, setTodosLosTipos] = useState(false);

  const m = Math.round(num(minutos)) || 0;
  // Al editar sin tocar tipo, minutos ni intensidad, se conservan las calorías ya guardadas.
  const sinCambios = existente && !desdeReloj && tipo === existente.exercise_type
    && intensidad === existente.intensity && m === existente.duration_min;
  const kcalEstimada = sinCambios ? existente.kcal_est : kcalEjercicio(tipo, intensidad, m, peso);
  const kcal = modo === 'reloj' ? Math.round(num(kcalReloj)) || 0 : kcalEstimada;
  const textos = descripcionIntensidad(tipo);

  // Últimas rutinas distintas, para repetirlas con un toque.
  const recientes = [];
  if (!existente) {
    const vistos = new Set();
    for (const e of [...exercises].sort((a, b) => b.log_date.localeCompare(a.log_date))) {
      const clave = `${e.exercise_type}|${e.duration_min}|${e.intensity}|${e.description ?? ''}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      recientes.push(e);
      if (recientes.length === 4) break;
    }
  }

  function usarReciente(e) {
    setTipo(e.exercise_type);
    setMinutos(String(e.duration_min));
    setIntensidad(e.intensity);
    setDescripcion(e.description ?? '');
    setModo('estimar');
  }

  async function guardar() {
    if (!m || m < 1 || m > 600) return setError('Indique una duración entre 1 y 600 minutos.');
    if (modo === 'reloj' && !(kcal > 0 && kcal <= 5000)) return setError('Indique las calorías activas que marcó el reloj.');
    setOcupado(true);
    setError(null);
    const fila = {
      exercise_type: tipo, intensity: intensidad, duration_min: m,
      description: descripcion.trim() || null, kcal_est: kcal,
    };
    const { error: e } = existente
      ? await supabase.from('exercise_logs').update(fila).eq('id', existente.id)
      : await supabase.from('exercise_logs').insert({ ...fila, user_id: userId, log_date: fecha });
    setOcupado(false);
    if (e) return setError(e.message);
    const ej = EJERCICIOS[tipo] ?? EJERCICIOS.otro;
    toast(existente ? 'Ejercicio actualizado' : `${ej.label}: ${m} min, ${kcal} kcal`);
    await reload();
    onClose();
  }

  async function eliminar() {
    if (!confirm('¿Eliminar este ejercicio?')) return;
    setOcupado(true);
    const { error: e } = await supabase.from('exercise_logs').delete().eq('id', existente.id);
    setOcupado(false);
    if (e) return setError(e.message);
    toast('Ejercicio eliminado');
    await reload();
    onClose();
  }

  return (
    <Modal title={existente ? 'Editar ejercicio' : 'Registrar ejercicio'} onClose={onClose} footer={
      <button className="btn primary big block" disabled={ocupado} onClick={guardar}>
        {existente ? 'Guardar cambios' : 'Guardar'} · <span className="num">{fmt(kcal)} kcal</span>
      </button>
    }>
      <div className="stack">
        {recientes.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <small className="muted">Repetir uno reciente</small>
            <div className="chips compact scroll">
              {recientes.map((e) => (
                <button key={e.id} className="chip" onClick={() => usarReciente(e)}>
                  <Icon name={EJERCICIOS[e.exercise_type]?.icono ?? 'ia'} size={20} />
                  {EJERCICIOS[e.exercise_type]?.label ?? e.exercise_type}, {e.duration_min} min
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="stack" style={{ gap: 6 }}>
          <small className="muted">Tipo de ejercicio</small>
          <div className="type-grid" role="radiogroup" aria-label="Tipo de ejercicio">
            {Object.entries(EJERCICIOS)
              .filter(([id]) => todosLosTipos || TIPOS_PRINCIPALES.includes(id) || id === tipo)
              .map(([id, e]) => (
                <button key={id} role="radio" aria-checked={tipo === id} className={tipo === id ? 'on' : ''} onClick={() => setTipo(id)}>
                  <Icon name={e.icono} size={24} />{e.label}
                </button>
              ))}
            {!todosLosTipos && (
              <button className="mas" onClick={() => setTodosLosTipos(true)}><Icon name="mas" size={24} />Más tipos</button>
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <span className="field-label">{tipo === 'futbol' || tipo === 'pichanga' ? 'Minutos que jugó' : 'Duración'}</span>
          <div className="stepper">
            <button className="btn" aria-label="5 minutos menos" onClick={() => setMinutos(String(Math.max(5, m - 5)))}><Icon name="menos" stroke={2.6} /></button>
            <div className="valor">
              <input inputMode="numeric" value={minutos} aria-label="Minutos" onFocus={(e) => e.target.select()}
                onChange={(e) => setMinutos(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              <span>min</span>
            </div>
            <button className="btn" aria-label="5 minutos más" onClick={() => setMinutos(String(Math.min(600, m + 5)))}><Icon name="mas" stroke={2.6} /></button>
          </div>
          <div className="chips compact scroll">
            {MINUTOS_RAPIDOS.map((v) => (
              <button key={v} className={`chip${m === v ? ' on' : ''}`} onClick={() => setMinutos(String(v))}>{v} min</button>
            ))}
          </div>
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <small className="muted">Intensidad</small>
          <div className="intensity">
            {['baja', 'moderada', 'alta'].map((i) => (
              <button key={i} className={intensidad === i ? 'on' : ''} onClick={() => setIntensidad(i)} aria-pressed={intensidad === i}>
                <b>{i === 'baja' ? 'Suave' : i === 'moderada' ? 'Moderada' : 'Intensa'}</b>
                <small>{textos[i]}</small>
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          Qué hizo (opcional)
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder={tipo === 'pesas' ? 'Ej: pierna, sentadilla 4×10, prensa 3×12' : 'Ej: partido con amigos, 2 tiempos de 30 min'} />
        </label>

        <div className="stack" style={{ gap: 6 }}>
          <small className="muted">¿Cómo calcular las calorías?</small>
          <div className="seg">
            <button className={modo === 'estimar' ? 'on' : ''} onClick={() => setModo('estimar')}>Estimar</button>
            <button className={modo === 'reloj' ? 'on' : ''} onClick={() => setModo('reloj')}><Icon name="reloj" size={20} /> Usar mi reloj</button>
          </div>
          {modo === 'reloj' && (
            <label className="field">
              Calorías activas que marcó el reloj
              <input inputMode="numeric" value={kcalReloj} onChange={(e) => setKcalReloj(e.target.value.replace(/\D/g, ''))} placeholder="Ej: 520" autoFocus />
              <small>Use las calorías “activas” del entrenamiento, no las totales del día. Estimación por tiempo e intensidad: {fmt(kcalEstimada)} kcal.</small>
            </label>
          )}
        </div>

        <div className="alert info">
          Gasto del ejercicio: <b className="num">{fmt(kcal)} kcal</b>. En su balance se cuenta el 75%
          (<b className="num">{fmt(Math.round(kcal * 0.75))} kcal</b>), porque tanto las fórmulas como los relojes tienden a sobreestimarlo.
        </div>
        <ErrorBox>{error}</ErrorBox>
        {existente && <button className="btn ghost danger block" disabled={ocupado} onClick={eliminar}>Eliminar ejercicio</button>}
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
    toast(`${fmt(p, 1)} kg registrados`);
    await reload();
    onClose();
  }

  return (
    <Modal title="Registrar peso" onClose={onClose} footer={
      <button className="btn primary big block" disabled={ocupado} onClick={guardar}>Guardar peso</button>
    }>
      <div className="stack">
        <label className="field">
          Fecha
          <input type="date" value={dia} max={todayISO()} onChange={(e) => setDia(e.target.value)} />
        </label>
        <div className="grid2">
          <label className="field">
            Peso (kg)
            <input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="81,0" autoFocus={!existente}
              style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 750 }} />
          </label>
          <label className="field">
            Cintura (cm)
            <input inputMode="decimal" value={cintura} onChange={(e) => setCintura(e.target.value)} placeholder="92" />
          </label>
        </div>
        <ComoMedir />
        <ErrorBox>{error}</ErrorBox>
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
      <div className="grid2 resp-1">
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
          <>
            <input inputMode="numeric" value={f.manual_target_kcal} onChange={set('manual_target_kcal')} placeholder="2100" aria-label="Meta manual en kcal" />
            <small>Una meta manual es fija: no sube cuando registra ejercicio ni se ajusta con su peso real. Recomendamos la automática.</small>
          </>
        ) : (
          <small>Recomendada. Incluye el ejercicio que registra (promedio de las últimas 4 semanas) y se corrige sola con la evolución de su peso.</small>
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

