// Cálculos nutricionales de Comidia.
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
// "futbol" es el partido en cancha grande; se conserva el id para los registros antiguos.
export const EJERCICIOS = {
  pesas: { icono: 'ejercicio', label: 'Pesas / fuerza', met: { baja: 3.5, moderada: 5, alta: 6 } },
  futbol: { icono: 'balon', label: 'Fútbol (partido)', met: { baja: 7, moderada: 8.5, alta: 10 } },
  pichanga: { icono: 'balon', label: 'Futbolito / pichanga', met: { baja: 5.5, moderada: 7, alta: 8.5 } },
  correr: { icono: 'correr', label: 'Correr', met: { baja: 7, moderada: 9, alta: 11.5 } },
  caminar: { icono: 'caminar', label: 'Caminar', met: { baja: 2.8, moderada: 3.5, alta: 5 } },
  bicicleta: { icono: 'bici', label: 'Bicicleta', met: { baja: 5.5, moderada: 7.5, alta: 10 } },
  spinning: { icono: 'bici', label: 'Spinning', met: { baja: 5.5, moderada: 7, alta: 9.5 } },
  cardio: { icono: 'corazon', label: 'Elíptica / máquinas', met: { baja: 5, moderada: 6.5, alta: 8 } },
  hiit: { icono: 'rayo', label: 'HIIT / funcional', met: { baja: 5.5, moderada: 8, alta: 10 } },
  natacion: { icono: 'ondas', label: 'Natación', met: { baja: 6, moderada: 8, alta: 10 } },
  raqueta: { icono: 'raqueta', label: 'Tenis / pádel', met: { baja: 5, moderada: 6.5, alta: 8 } },
  basquetbol: { icono: 'balon', label: 'Básquetbol', met: { baja: 6, moderada: 7, alta: 8 } },
  combate: { icono: 'guante', label: 'Boxeo / artes marciales', met: { baja: 5.5, moderada: 7.5, alta: 10 } },
  baile: { icono: 'musica', label: 'Baile', met: { baja: 4.5, moderada: 6, alta: 7.5 } },
  yoga: { icono: 'yoga', label: 'Yoga / pilates', met: { baja: 2.5, moderada: 3, alta: 4 } },
  otro: { icono: 'ia', label: 'Otro', met: { baja: 3, moderada: 5, alta: 7 } },
};

/** Descripción de cada intensidad. La prueba del habla sirve para casi todo; las pesas tienen la suya. */
export function descripcionIntensidad(tipo) {
  if (tipo === 'pesas') {
    return {
      baja: 'Liviano o técnica, descansos largos',
      moderada: 'Series exigentes, descansos de 1 a 2 min',
      alta: 'Cerca del fallo o en circuito, descansos cortos',
    };
  }
  if (tipo === 'yoga') {
    return { baja: 'Relajado, estiramientos', moderada: 'Posturas sostenidas', alta: 'Flujo continuo, transpira' };
  }
  return {
    baja: 'Puede conversar sin problema',
    moderada: 'Puede hablar, pero en frases cortas',
    alta: 'Casi no puede hablar',
  };
}

export const TIPOS_COMIDA = [
  { id: 'desayuno', label: 'Desayuno', icono: 'desayuno' },
  { id: 'almuerzo', label: 'Almuerzo', icono: 'almuerzo' },
  { id: 'once', label: 'Once', icono: 'once' },
  { id: 'cena', label: 'Cena', icono: 'cena' },
  { id: 'colacion', label: 'Colación', icono: 'colacion' },
  { id: 'bebida', label: 'Bebida', icono: 'bebida' },
];

/*
 * Objetivos y su base científica (ver "Cómo se calcula" en Progreso):
 * - Bajar: 0,5–1 % del peso por semana preserva mejor la masa muscular (Helms y cols., JISSN 2014).
 *   Proteína alta en déficit: 1,6–2,4 g/kg; con entrenamiento de fuerza se usa 2,0 (Helms 2014; ISSN, Jäger y cols. 2017).
 * - Mantener: 1,2–1,6 g/kg en adultos activos; 1,6 g/kg es el punto en que se estabiliza la ganancia de músculo
 *   con entrenamiento (Morton y cols., Br J Sports Med 2018).
 * - Ganar músculo: superávit pequeño, subir ~0,25–0,5 % del peso por semana; proteína 1,6–2,2 g/kg;
 *   grasa 0,5–1,5 g/kg; el resto, carbohidratos (Iraki y cols., Sports 2019).
 * - Subir de peso: superávit de ~250–550 kcal/día (0,25–0,5 kg/semana), proteína ≥1,6 g/kg.
 * - Grasa dentro del rango aceptable de 20–35 % de las calorías y nunca bajo 0,6 g/kg (IOM 2005, Helms 2014).
 */
export const OBJETIVOS = {
  bajar: {
    label: 'Bajar de peso', detalle: 'Perder grasa cuidando el músculo', signo: -1,
    ritmos: [0.25, 0.5, 0.75, 1], ritmoDef: 0.5, topePct: 0.01, grasaPct: 0.25,
    proteina: (entrena) => (entrena ? 2.0 : 1.6),
  },
  mantener: {
    label: 'Mantener mi peso', detalle: 'Comer lo que gasta', signo: 0,
    ritmos: [0], ritmoDef: 0, topePct: 0, grasaPct: 0.3,
    proteina: (entrena) => (entrena ? 1.6 : 1.2),
  },
  musculo: {
    label: 'Ganar músculo', detalle: 'Superávit pequeño + entrenamiento de fuerza', signo: 1,
    ritmos: [0.1, 0.2, 0.3], ritmoDef: 0.2, topePct: 0.005, grasaPct: 0.25,
    proteina: () => 2.0,
  },
  subir: {
    label: 'Subir de peso', detalle: 'Aumentar peso de forma gradual', signo: 1,
    ritmos: [0.25, 0.5], ritmoDef: 0.25, topePct: 0.0075, grasaPct: 0.3,
    proteina: () => 1.6,
  },
};
export const objetivoDe = (profile) => OBJETIVOS[profile?.objetivo] ? profile.objetivo : 'bajar';
/** Entrena con regularidad: 2 horas o más por semana de ejercicio habitual. */
export const entrena = (profile) => Number(profile?.usual_exercise_hours_week ?? 0) >= 2;

/** Proteína recomendada (g/kg) según objetivo y entrenamiento. */
export function proteinaRecomendada(profile) {
  return OBJETIVOS[objetivoDe(profile)].proteina(entrena(profile));
}

/**
 * Peso de referencia para la proteína. Con IMC ≥ 30 se usa el peso ajustado
 * (peso a IMC 25 + 40 % del exceso), para no sobreestimarla.
 */
export function pesoReferencia(peso, alturaCm) {
  const h = Number(alturaCm) / 100;
  if (!h) return peso;
  const imc = peso / (h * h);
  if (imc < 30) return peso;
  const p25 = 25 * h * h;
  return p25 + 0.4 * (peso - p25);
}

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

  const objetivo = objetivoDe(profile);
  const obj = OBJETIVOS[objetivo];
  const pedido = obj.signo === 0 ? 0 : Number(profile.goal_rate_kg_week);
  const ritmo = Math.min(pedido, peso * obj.topePct);
  const ajuste = obj.signo * ((ritmo * KCAL_POR_KG) / 7); // negativo = déficit, positivo = superávit
  const deficit = Math.max(0, -ajuste);
  const superavit = Math.max(0, ajuste);
  const minimo = Math.max(Math.round(basal), profile.sex === 'M' ? 1500 : 1200);
  const metaAuto = Math.max(round10(tdee + ajuste), minimo);
  const manual = profile.target_mode === 'manual' && profile.manual_target_kcal;
  const meta = manual ? Number(profile.manual_target_kcal) : metaAuto;

  const pesoRef = pesoReferencia(peso, profile.height_cm);
  const proteinaAuto = profile.proteina_auto !== false || !profile.protein_g_per_kg;
  const proteinaGkg = proteinaAuto ? proteinaRecomendada(profile) : Number(profile.protein_g_per_kg);
  const proteina = Math.round(pesoRef * proteinaGkg);
  const grasa = Math.round(Math.max((meta * obj.grasaPct) / 9, pesoRef * 0.6));
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
    objetivo,
    ritmo,
    ritmoLimitado: ritmo < pedido,
    topePct: obj.topePct,
    deficit: Math.round(deficit),
    superavit: Math.round(superavit),
    pesoRef: Math.round(pesoRef * 10) / 10,
    proteinaGkg,
    proteinaAuto,
    grasaPct: obj.grasaPct,
    fibra: Math.round((meta / 1000) * 14),
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

/**
 * Estado del día.
 * Bajar de peso: ok hasta la meta · leve hasta +10% · exceso · bajo (< 60%, registro probablemente incompleto).
 * Mantener, ganar músculo o subir: ok entre 90% y 110% de la meta · leve entre 80–90% o 110–120% ·
 * exceso sobre 120% · bajo bajo el 80% (no alcanzó a comer lo necesario).
 */
export function estadoDia(kcal, meta, objetivo = 'bajar') {
  if (!kcal) return 'sin';
  if (objetivo === 'bajar' || !OBJETIVOS[objetivo]) {
    if (kcal < meta * 0.6) return 'bajo';
    if (kcal <= meta) return 'ok';
    if (kcal <= meta * 1.1) return 'leve';
    return 'exceso';
  }
  if (kcal < meta * 0.8) return 'bajo';
  if (kcal > meta * 1.2) return 'exceso';
  if (kcal >= meta * 0.9 && kcal <= meta * 1.1) return 'ok';
  return 'leve';
}

export const ESTADOS = {
  ok: 'Dentro de la meta',
  leve: 'Leve exceso (≤ 10%)',
  exceso: 'Exceso (> 10%)',
  bajo: 'Muy bajo o incompleto',
  sin: 'Sin registro',
};

const ESTADOS_SUBIR = {
  ok: 'En su meta (± 10%)',
  leve: 'Cerca de la meta (± 20%)',
  exceso: 'Sobre la meta (> 20%)',
  bajo: 'Bajo la meta (< 80%)',
  sin: 'Sin registro',
};

/** Nombres de los estados según el objetivo. */
export const estadosDe = (objetivo) => (objetivo && objetivo !== 'bajar' ? ESTADOS_SUBIR : ESTADOS);

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
    if (estadoDia(it.kcal, metas.meta, metas.objetivo) === 'ok') diasEnMeta++;
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


/** Días seguidos con al menos una comida registrada. Si hoy aún no registra, cuenta desde ayer. */
export function racha(intakeByDate, hoyISO) {
  const registrado = (d) => (intakeByDate.get(d)?.kcal ?? 0) > 0;
  let dia = registrado(hoyISO) ? hoyISO : addDays(hoyISO, -1);
  let actual = 0;
  while (registrado(dia)) {
    actual++;
    dia = addDays(dia, -1);
  }
  const fechas = [...intakeByDate.keys()].filter(registrado).sort();
  let mejor = 0;
  let corrida = 0;
  let previa = null;
  for (const f of fechas) {
    corrida = previa && diffDays(previa, f) === 1 ? corrida + 1 : 1;
    mejor = Math.max(mejor, corrida);
    previa = f;
  }
  return { actual, mejor: Math.max(mejor, actual), hoyRegistrado: registrado(hoyISO) };
}

/** Análisis de una semana: déficit, baja esperada según el déficit y cambio real de peso. */
export function analisisSemana(lunesISO, ctx, metas, hoyISO) {
  const s = resumenSemana(lunesISO, ctx, metas, hoyISO);
  const esperadaG = Math.round(s.perdidaEstimada * 1000); // positivo = debería haber bajado
  const realG = s.cambioReal != null ? Math.round(-s.cambioReal * 1000) : null; // positivo = bajó
  let veredicto = 'sin-datos';
  if (s.diasRegistrados < 3) veredicto = 'pocos-registros';
  else if (realG == null) veredicto = 'sin-peso';
  else if (Math.abs(realG - esperadaG) <= 300) veredicto = 'segun-lo-esperado';
  else if (realG > esperadaG) veredicto = 'mas-de-lo-esperado';
  else veredicto = 'menos-de-lo-esperado';
  return { ...s, esperadaG, realG, veredicto };
}
