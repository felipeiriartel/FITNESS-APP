// Cálculos nutricionales de Comedia.
// Todas las funciones son puras para poder probarlas sin la interfaz.
import { addDays, ageOn, diffDays } from './dates.js';

export const KCAL_POR_KG = 7700;
/** Solo se cuenta el 75% del gasto estimado por ejercicio (las fórmulas tienden a sobreestimarlo). */
export const FACTOR_EJERCICIO = 0.75;
export const VENTANA_DIAS = 28;

export const NIVELES_ACTIVIDAD = {
  sedentaria: { factor: 1.2, label: 'Sedentaria', detalle: 'Trabajo sentado, pocos pasos al día' },
  ligera: { factor: 1.3, label: 'Ligera', detalle: 'Camina bastante o trabaja de pie parte del día' },
  activa: { factor: 1.45, label: 'Activa', detalle: 'Trabajo físico o muchos pasos diarios' },
};

// Valores MET aproximados (Compendio de Actividades Físicas).
export const EJERCICIOS = {
  pesas: { emoji: '🏋️', label: 'Pesas / fuerza', met: { baja: 3.5, moderada: 5, alta: 6 } },
  futbol: { emoji: '⚽', label: 'Fútbol', met: { baja: 6, moderada: 7, alta: 10 } },
  correr: { emoji: '🏃', label: 'Correr', met: { baja: 7, moderada: 9, alta: 11.5 } },
  caminar: { emoji: '🚶', label: 'Caminar', met: { baja: 2.8, moderada: 3.5, alta: 5 } },
  bicicleta: { emoji: '🚴', label: 'Bicicleta', met: { baja: 5.5, moderada: 7.5, alta: 10 } },
  natacion: { emoji: '🏊', label: 'Natación', met: { baja: 6, moderada: 8, alta: 10 } },
  cardio: { emoji: '🫀', label: 'Cardio / máquinas', met: { baja: 5, moderada: 7, alta: 9 } },
  otro: { emoji: '✨', label: 'Otro', met: { baja: 3, moderada: 5, alta: 7 } },
};

export const TIPOS_COMIDA = [
  { id: 'desayuno', label: 'Desayuno', emoji: '🍳' },
  { id: 'almuerzo', label: 'Almuerzo', emoji: '🍲' },
  { id: 'once', label: 'Once', emoji: '☕' },
  { id: 'cena', label: 'Cena', emoji: '🌙' },
  { id: 'colacion', label: 'Colación', emoji: '🍎' },
  { id: 'bebida', label: 'Bebida', emoji: '🥤' },
];

const round10 = (n) => Math.round(n / 10) * 10;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/** Gasto neto del ejercicio (descuenta el gasto en reposo ya incluido en el basal). */
export function kcalEjercicio(tipo, intensidad, minutos, pesoKg) {
  const met = (EJERCICIOS[tipo] ?? EJERCICIOS.otro).met[intensidad] ?? 5;
  return Math.round(Math.max(0, met - 1) * pesoKg * (minutos / 60));
}

/** Metabolismo basal, ecuación de Mifflin-St Jeor. */
export function bmr({ sex, weightKg, heightCm, age }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'M' ? 5 : -161);
}

/** Promedio de peso de los últimos 7 días hasta la fecha; si no hay, el último registro conocido. */
export function pesoTendencia(weights, onISO) {
  if (!weights.length) return null;
  const desde = addDays(onISO, -6);
  const semana = weights.filter((w) => w.log_date >= desde && w.log_date <= onISO);
  if (semana.length) return semana.reduce((s, w) => s + Number(w.weight_kg), 0) / semana.length;
  const previos = weights.filter((w) => w.log_date <= onISO);
  const ref = previos.length ? previos[previos.length - 1] : weights[0];
  return Number(ref.weight_kg);
}

/** Pendiente por mínimos cuadrados. */
export function regresion(puntos) {
  const n = puntos.length;
  const mx = puntos.reduce((s, p) => s + p.x, 0) / n;
  const my = puntos.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of puntos) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  const pendiente = den === 0 ? 0 : num / den;
  return { pendiente, intercepto: my - pendiente * mx };
}

/**
 * Gasto diario promedio por ejercicio (ya ajustado por FACTOR_EJERCICIO).
 * Mientras hay poco historial, se combina con las horas habituales declaradas en el perfil
 * (MET promedio 6); con 28 días de historial se usa solo lo registrado.
 */
export function ejercicioPromedioDiario(exerciseByDate, onISO, inicioISO, horasHabituales = 0, pesoKg = 70) {
  const habitual = (Number(horasHabituales) * (6 - 1) * pesoKg * FACTOR_EJERCICIO) / 7;
  if (!inicioISO) return habitual;
  const historia = clamp(diffDays(inicioISO, onISO), 0, VENTANA_DIAS);
  const dias = Math.max(historia, 7);
  let total = 0;
  for (let i = 1; i <= dias; i++) total += exerciseByDate.get(addDays(onISO, -i))?.kcal ?? 0;
  const registrado = (total * FACTOR_EJERCICIO) / dias;
  const w = historia / VENTANA_DIAS;
  return registrado * w + habitual * (1 - w);
}

/**
 * Gasto real estimado a partir de lo que comió y de cómo cambió su peso.
 * Si bajó X kg comiendo Y kcal promedio, su gasto fue Y + X·7700/días.
 */
export function tdeeAdaptativo(intakeByDate, weights, onISO, tdeeFormula) {
  const fin = addDays(onISO, -1);
  const inicio = addDays(fin, -(VENTANA_DIAS - 1));
  const registrados = [];
  for (let i = 0; i < VENTANA_DIAS; i++) {
    const k = intakeByDate.get(addDays(inicio, i))?.kcal ?? 0;
    if (k >= 800) registrados.push(k);
  }
  const pesos = weights.filter((w) => w.log_date >= inicio && w.log_date <= fin);
  const base = { dias: registrados.length, pesajes: pesos.length };
  if (registrados.length < 10 || pesos.length < 4) return { ...base, disponible: false };
  const span = diffDays(pesos[0].log_date, pesos[pesos.length - 1].log_date);
  if (span < 10) return { ...base, disponible: false };

  const ingestaProm = registrados.reduce((a, b) => a + b, 0) / registrados.length;
  const { pendiente } = regresion(pesos.map((w) => ({ x: diffDays(inicio, w.log_date), y: Number(w.weight_kg) })));
  const tdee = ingestaProm - pendiente * KCAL_POR_KG;
  const completitud = registrados.length / VENTANA_DIAS;
  let confianza = clamp((span - 10) / 14, 0, 1) * clamp((completitud - 0.5) / 0.3, 0, 1);
  const atipico = Math.abs(tdee - tdeeFormula) > 1000;
  if (atipico) confianza = 0;
  return {
    ...base,
    disponible: true,
    atipico,
    tdee: Math.round(tdee),
    ingestaProm: Math.round(ingestaProm),
    pendienteKgSemana: pendiente * 7,
    confianza,
  };
}

/** Calcula gasto, meta diaria y metas de macros y agua para la fecha indicada. */
export function calcularMetas(profile, ctx, onISO) {
  const peso = pesoTendencia(ctx.weights, onISO);
  if (!peso || !profile) return null;
  const edad = ageOn(profile.birth_date, onISO);
  const basal = bmr({ sex: profile.sex, weightKg: peso, heightCm: Number(profile.height_cm), age: edad });
  const factor = NIVELES_ACTIVIDAD[profile.activity_level]?.factor ?? 1.2;
  const base = basal * factor;
  const ejercicio = ejercicioPromedioDiario(
    ctx.exerciseByDate, onISO, ctx.inicioISO, profile.usual_exercise_hours_week ?? 0, peso,
  );
  const tdeeFormula = base + ejercicio;
  const adaptativo = tdeeAdaptativo(ctx.intakeByDate, ctx.weights, onISO, tdeeFormula);
  const c = adaptativo.disponible ? adaptativo.confianza : 0;
  const tdee = tdeeFormula * (1 - c) + (adaptativo.tdee ?? 0) * c;

  const ritmo = Math.min(Number(profile.goal_rate_kg_week), peso * 0.01);
  const deficit = (ritmo * KCAL_POR_KG) / 7;
  const minimo = Math.max(Math.round(basal), profile.sex === 'M' ? 1500 : 1200);
  const metaAuto = Math.max(round10(tdee - deficit), minimo);
  const manual = profile.target_mode === 'manual' && profile.manual_target_kcal;
  const meta = manual ? Number(profile.manual_target_kcal) : metaAuto;

  const proteina = Math.round(peso * Number(profile.protein_g_per_kg));
  const grasa = Math.round((meta * 0.25) / 9);
  const carbos = Math.max(0, Math.round((meta - proteina * 4 - grasa * 9) / 4));

  return {
    peso,
    edad,
    basal: Math.round(basal),
    factor,
    base: Math.round(base),
    ejercicio: Math.round(ejercicio),
    tdeeFormula: Math.round(tdeeFormula),
    adaptativo,
    tdee: Math.round(tdee),
    ajusteAdaptativo: tdee - tdeeFormula,
    ritmo,
    ritmoLimitado: ritmo < Number(profile.goal_rate_kg_week),
    deficit: Math.round(deficit),
    minimo,
    metaAuto,
    meta,
    manual: Boolean(manual),
    bajoMinimo: meta < minimo,
    proteina,
    grasa,
    carbos,
    agua: Math.round((peso * 35) / 50) * 50,
  };
}

/** Gasto estimado de un día concreto (base + ejercicio de ese día + ajuste adaptativo). */
export function gastoDelDia(metas, kcalEjercicioDia) {
  return metas.base + kcalEjercicioDia * FACTOR_EJERCICIO + metas.ajusteAdaptativo;
}

/** sin: sin registro · bajo: registro probablemente incompleto · ok · leve: hasta +10% · exceso */
export function estadoDia(kcal, meta) {
  if (!kcal) return 'sin';
  if (kcal < meta * 0.6) return 'bajo';
  if (kcal <= meta) return 'ok';
  if (kcal <= meta * 1.1) return 'leve';
  return 'exceso';
}

export const ESTADOS = {
  ok: 'Dentro de la meta',
  leve: 'Leve exceso (≤ 10%)',
  exceso: 'Exceso (> 10%)',
  bajo: 'Muy bajo o incompleto',
  sin: 'Sin registro',
};

function promedioPeso(weights, desde, hasta) {
  const w = weights.filter((x) => x.log_date >= desde && x.log_date <= hasta);
  return w.length ? w.reduce((s, x) => s + Number(x.weight_kg), 0) / w.length : null;
}

/** Resumen de una semana (lunes a domingo). */
export function resumenSemana(lunesISO, ctx, metas, hoyISO) {
  const domingo = addDays(lunesISO, 6);
  let diasRegistrados = 0;
  let diasEnMeta = 0;
  let kcal = 0;
  let proteina = 0;
  let deficit = 0;
  let sesiones = 0;
  let kcalEjercicio = 0;
  let agua = 0;
  let diasTranscurridos = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(lunesISO, i);
    if (d > hoyISO) break;
    diasTranscurridos++;
    const ex = ctx.exerciseByDate.get(d);
    sesiones += ex?.count ?? 0;
    kcalEjercicio += ex?.kcal ?? 0;
    agua += ctx.waterByDate.get(d) ?? 0;
    const it = ctx.intakeByDate.get(d);
    if (!it?.kcal) continue;
    diasRegistrados++;
    kcal += it.kcal;
    proteina += it.protein_g;
    deficit += gastoDelDia(metas, ex?.kcal ?? 0) - it.kcal;
    if (estadoDia(it.kcal, metas.meta) === 'ok') diasEnMeta++;
  }
  const pesoProm = promedioPeso(ctx.weights, lunesISO, domingo);
  const pesoAnterior = promedioPeso(ctx.weights, addDays(lunesISO, -7), addDays(lunesISO, -1));
  return {
    lunes: lunesISO,
    domingo,
    diasTranscurridos,
    diasRegistrados,
    diasEnMeta,
    kcalProm: diasRegistrados ? Math.round(kcal / diasRegistrados) : null,
    proteinaProm: diasRegistrados ? Math.round(proteina / diasRegistrados) : null,
    deficit: Math.round(deficit),
    perdidaEstimada: deficit / KCAL_POR_KG,
    pesoProm,
    cambioReal: pesoProm != null && pesoAnterior != null ? pesoProm - pesoAnterior : null,
    sesiones,
    kcalEjercicio,
    aguaProm: diasTranscurridos ? Math.round(agua / diasTranscurridos) : 0,
  };
}

/** Construye los mapas por fecha a partir de las filas de la base de datos. */
export function construirContexto({ weights, meals, exercises, water }) {
  const intakeByDate = new Map();
  for (const m of meals) {
    const cur = intakeByDate.get(m.log_date) ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, n: 0 };
    cur.kcal += Number(m.kcal);
    cur.protein_g += Number(m.protein_g);
    cur.carbs_g += Number(m.carbs_g);
    cur.fat_g += Number(m.fat_g);
    cur.n++;
    intakeByDate.set(m.log_date, cur);
  }
  const exerciseByDate = new Map();
  for (const e of exercises) {
    const cur = exerciseByDate.get(e.log_date) ?? { kcal: 0, count: 0 };
    cur.kcal += Number(e.kcal_est);
    cur.count++;
    exerciseByDate.set(e.log_date, cur);
  }
  const waterByDate = new Map();
  for (const w of water) waterByDate.set(w.log_date, (waterByDate.get(w.log_date) ?? 0) + Number(w.ml));
  const sortedWeights = [...weights].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const fechas = [
    ...sortedWeights.map((w) => w.log_date),
    ...meals.map((m) => m.log_date),
    ...exercises.map((e) => e.log_date),
  ].sort();
  return { weights: sortedWeights, intakeByDate, exerciseByDate, waterByDate, inicioISO: fechas[0] ?? null };
}
