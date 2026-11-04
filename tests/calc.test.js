import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analisisSemana, bmr, calcularMetas, calcularMetasSemana, cambioMetaSemanal, construirContexto, ejercicioPromedioDiario,
  estadoDia, kcalEjercicio, racha, resumenSemana, tdeeAdaptativo,
} from '../src/lib/calc.js';
import { addDays, ageOn, startOfWeek, diffDays } from '../src/lib/dates.js';

const perfil = {
  sex: 'M', birth_date: '2001-03-01', height_cm: 170, activity_level: 'sedentaria',
  goal_rate_kg_week: 0.5, protein_g_per_kg: 1.7, usual_exercise_hours_week: 0, target_mode: 'auto', manual_target_kcal: null,
};

test('fechas', () => {
  assert.equal(addDays('2026-09-06', 1), '2026-09-07'); // cambio de horario en Chile
  assert.equal(addDays('2026-04-04', 1), '2026-04-05');
  assert.equal(diffDays('2026-09-01', '2026-10-01'), 30);
  assert.equal(startOfWeek('2026-10-13'), '2026-10-12');
  assert.equal(startOfWeek('2026-10-18'), '2026-10-12');
  assert.equal(ageOn('2001-03-01', '2026-10-13'), 25);
});

test('basal Mifflin-St Jeor', () => {
  assert.equal(bmr({ sex: 'M', weightKg: 81, heightCm: 170, age: 25 }), 1752.5);
  assert.equal(kcalEjercicio('pesas', 'moderada', 60, 81), 324);
});

test('meta inicial sin historial de ejercicio', () => {
  const ctx = construirContexto({ weights: [{ log_date: '2026-10-13', weight_kg: 81 }], meals: [], exercises: [], water: [] });
  const m = calcularMetas(perfil, ctx, '2026-10-13');
  assert.equal(m.basal, 1753);
  assert.equal(m.tdeeFormula, 2103);
  assert.equal(m.meta, m.minimo); // 2103 - 550 queda bajo el basal → se aplica el piso
  assert.equal(m.proteina, 138);
  assert.equal(m.agua, 2850);
});

test('meta inicial con 6 h de ejercicio habitual por semana', () => {
  const ctx = construirContexto({ weights: [{ log_date: '2026-10-13', weight_kg: 81 }], meals: [], exercises: [], water: [] });
  const m = calcularMetas({ ...perfil, usual_exercise_hours_week: 6 }, ctx, '2026-10-13');
  console.log('inicio con 6 h:', { ejercicio: m.ejercicio, tdeeFormula: m.tdeeFormula, meta: m.meta });
  assert.equal(m.ejercicio, 260);
  assert.equal(m.meta, 1810);
});

test('simulación de 5 semanas: pesas 4x, fútbol 1,5x, 2100 kcal, baja real 0,5 kg/sem', () => {
  const inicio = '2026-09-07';
  const weights = [], meals = [], exercises = [];
  let pesoReal = 81;
  for (let i = 0; i < 35; i++) {
    const d = addDays(inicio, i);
    const dow = i % 7;
    meals.push({ log_date: d, kcal: 2100, protein_g: 140, carbs_g: 200, fat_g: 60 });
    if ([0, 1, 3, 4].includes(dow)) exercises.push({ log_date: d, kcal_est: kcalEjercicio('pesas', 'moderada', 60, 81) });
    if (dow === 5) exercises.push({ log_date: d, kcal_est: kcalEjercicio('futbol', 'alta', 90, 81) });
    if (dow === 2 && i > 7) exercises.push({ log_date: d, kcal_est: Math.round(kcalEjercicio('futbol', 'alta', 90, 81) / 2) });
    pesoReal -= 0.5 / 7;
    const ruido = Math.sin(i * 1.7) * 0.4;
    weights.push({ log_date: d, weight_kg: +(pesoReal + ruido).toFixed(1) });
  }
  const hoy = addDays(inicio, 35);
  const ctx = construirContexto({ weights, meals, exercises, water: [] });
  const m = calcularMetas(perfil, ctx, hoy);
  console.log({ peso: m.peso.toFixed(2), basal: m.basal, base: m.base, ejercicio: m.ejercicio, tdeeFormula: m.tdeeFormula,
    adaptativo: m.adaptativo, tdee: m.tdee, meta: m.meta });
  // Gasto real implícito = 2100 + 550 = 2650
  assert.ok(m.adaptativo.disponible);
  assert.ok(Math.abs(m.adaptativo.tdee - 2650) < 150, `adaptativo ${m.adaptativo.tdee}`);
  assert.ok(Math.abs(m.adaptativo.pendienteKgSemana + 0.5) < 0.1);
  assert.equal(m.adaptativo.confianza, 1);
  assert.equal(m.tdee, m.adaptativo.tdee);
  const s = resumenSemana(startOfWeek(addDays(hoy, -1)), ctx, m, hoy);
  console.log(s);
  assert.equal(s.diasRegistrados, 7);
  assert.ok(s.cambioReal < 0);
});

test('estado del día', () => {
  assert.equal(estadoDia(0, 2100), 'sin');
  assert.equal(estadoDia(1000, 2100), 'bajo');
  assert.equal(estadoDia(2000, 2100), 'ok');
  assert.equal(estadoDia(2250, 2100), 'leve');
  assert.equal(estadoDia(2400, 2100), 'exceso');
});

test('adaptativo no disponible con pocos datos', () => {
  const a = tdeeAdaptativo(new Map(), [], '2026-10-13', 2400);
  assert.equal(a.disponible, false);
});

test('meta manual y piso de seguridad', () => {
  const ctx = construirContexto({ weights: [{ log_date: '2026-10-13', weight_kg: 81 }], meals: [], exercises: [], water: [] });
  const man = calcularMetas({ ...perfil, target_mode: 'manual', manual_target_kcal: 2100 }, ctx, '2026-10-13');
  assert.equal(man.meta, 2100);
  const agresivo = calcularMetas({ ...perfil, goal_rate_kg_week: 1 }, ctx, '2026-10-13');
  assert.ok(agresivo.meta >= agresivo.minimo);
  assert.ok(agresivo.ritmo <= 0.81);
});

test('opción A: en automático el ejercicio registrado sube la meta; en manual no', () => {
  const inicio = '2026-09-15';
  const hoy = addDays(inicio, 28);
  const weights = [{ log_date: inicio, weight_kg: 81 }, { log_date: hoy, weight_kg: 81 }];
  const sinEjercicio = construirContexto({ weights, meals: [], exercises: [], water: [] });
  const exercises = [];
  for (let i = 0; i < 28; i++) {
    const d = addDays(inicio, i);
    if (i % 7 < 4) exercises.push({ log_date: d, kcal_est: kcalEjercicio('pesas', 'moderada', 60, 81) });
    if (i % 7 === 5) exercises.push({ log_date: d, kcal_est: kcalEjercicio('futbol', 'alta', 90, 81) });
  }
  const conEjercicio = construirContexto({ weights, meals: [], exercises, water: [] });
  const auto0 = calcularMetas(perfil, sinEjercicio, hoy);
  const auto1 = calcularMetas(perfil, conEjercicio, hoy);
  console.log('auto sin ejercicio:', auto0.meta, '| auto con ejercicio:', auto1.meta, '| ejercicio/día:', auto1.ejercicio);
  assert.ok(auto1.meta > auto0.meta);
  assert.ok(auto1.ejercicio > 250);
  const manual = { ...perfil, target_mode: 'manual', manual_target_kcal: 2100 };
  assert.equal(calcularMetas(manual, sinEjercicio, hoy).meta, 2100);
  assert.equal(calcularMetas(manual, conEjercicio, hoy).meta, 2100);
});

test('racha de días registrados', () => {
  const hoy = '2026-10-19';
  const dias = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-16', '2026-10-17', '2026-10-18'];
  const ctx = construirContexto({ weights: [], meals: dias.map((d) => ({ log_date: d, kcal: 2000, protein_g: 0, carbs_g: 0, fat_g: 0 })), exercises: [], water: [] });
  const r = racha(ctx.intakeByDate, hoy);
  assert.deepEqual(r, { actual: 3, mejor: 4, hoyRegistrado: false }); // hoy sin registrar: cuenta desde ayer
  const ctx2 = construirContexto({ weights: [], meals: [...dias, hoy].map((d) => ({ log_date: d, kcal: 2000, protein_g: 0, carbs_g: 0, fat_g: 0 })), exercises: [], water: [] });
  assert.equal(racha(ctx2.intakeByDate, hoy).actual, 4);
  assert.equal(racha(construirContexto({ weights: [], meals: [], exercises: [], water: [] }).intakeByDate, hoy).actual, 0);
});

test('análisis semanal: déficit, baja esperada y veredicto', () => {
  const lunesAnterior = '2026-10-05';
  const lunes = '2026-10-12';
  const hoy = '2026-10-19';
  const weights = [];
  const meals = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(lunesAnterior, i);
    weights.push({ log_date: d, weight_kg: i < 7 ? 80 : 79.5 });
    if (i >= 7) meals.push({ log_date: d, kcal: 1850, protein_g: 130, carbs_g: 0, fat_g: 0 });
  }
  const ctx = construirContexto({ weights, meals, exercises: [], water: [] });
  const metas = calcularMetas(perfil, ctx, hoy);
  const a = analisisSemana(lunes, ctx, metas, hoy);
  console.log('análisis:', { deficit: a.deficit, esperadaG: a.esperadaG, realG: a.realG, veredicto: a.veredicto });
  assert.equal(a.diasRegistrados, 7);
  assert.equal(a.realG, 500);
  assert.equal(a.esperadaG, Math.round((a.deficit / 7700) * 1000));
  assert.ok(['segun-lo-esperado', 'mas-de-lo-esperado', 'menos-de-lo-esperado'].includes(a.veredicto));
  const pocos = analisisSemana(lunesAnterior, ctx, metas, hoy);
  assert.equal(pocos.veredicto, 'pocos-registros');
});

test('ejercicio: promedio entre lo declarado y lo registrado, sin descartar nunca lo declarado', () => {
  const inicio = '2026-10-13';
  const hoy = addDays(inicio, 40); // más de 28 días de historial
  const poco = new Map();
  for (const d of [0, 7, 14, 21, 28, 35]) poco.set(addDays(inicio, d), { kcal: 420, count: 1 });
  const registrado = (6 * 420 * 0.75) / 28; // las últimas 28 jornadas
  const habitual = (7 * 5 * 82 * 0.75) / 7; // 7 h/semana declaradas
  const e = ejercicioPromedioDiario(poco, hoy, inicio, 7, 82);
  assert.ok(e > registrado + 1 && e < habitual - 1, `${e} debería estar entre ${registrado} y ${habitual}`);
  assert.ok(Math.abs(e - (registrado + habitual) / 2) < 25, 'cerca de la mitad');
  // si registra más de lo que declaró, manda lo registrado
  const mucho = new Map();
  for (let d = 0; d < 40; d++) mucho.set(addDays(inicio, d), { kcal: 500, count: 1 });
  const alto = ejercicioPromedioDiario(mucho, hoy, inicio, 1, 82);
  assert.ok(alto >= (500 * 0.75) - 1);
});

test('meta semanal: no cambia durante la semana y se actualiza el lunes', () => {
  const lunes = '2026-11-02';
  const weights = [
    { log_date: '2026-10-28', weight_kg: 82.4 },
    { log_date: '2026-10-31', weight_kg: 82.3 },
    { log_date: '2026-11-04', weight_kg: 81.7 },
    { log_date: '2026-11-09', weight_kg: 80.0 },
  ];
  const exercises = [{ log_date: '2026-10-28', kcal_est: 400 }, { log_date: '2026-11-03', kcal_est: 900 }];
  const ctx = construirContexto({ weights, meals: [], exercises, water: [] });
  const dias = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  const metas = dias.map((d) => calcularMetasSemana(perfil, ctx, d).meta);
  assert.equal(new Set(metas).size, 1, `toda la semana igual: ${metas}`);
  const siguiente = calcularMetasSemana(perfil, ctx, '2026-11-09');
  assert.notEqual(siguiente.peso, calcularMetasSemana(perfil, ctx, lunes).peso);
});

test('un día cerrado conserva su estado aunque la meta cambie la semana siguiente', () => {
  const ctx = construirContexto({
    weights: [{ log_date: '2026-10-26', weight_kg: 82 }, { log_date: '2026-11-04', weight_kg: 78 }],
    meals: [{ log_date: '2026-11-01', kcal: 1800, protein_g: 0, carbs_g: 0, fat_g: 0 }],
    exercises: [], water: [],
  });
  const perfilActivo = { ...perfil, usual_exercise_hours_week: 7 };
  const metaDomingo = calcularMetasSemana(perfilActivo, ctx, '2026-11-01').meta;
  const metaSemanaNueva = calcularMetasSemana(perfilActivo, ctx, '2026-11-04').meta;
  assert.notEqual(metaDomingo, metaSemanaNueva);
  // el domingo 1 pertenece a la semana del lunes 26: su meta es la de esa semana, no la de hoy
  assert.equal(metaDomingo, calcularMetasSemana(perfilActivo, ctx, '2026-10-26').meta);
  // comer justo el mayor de los dos valores: con la meta menor sería "leve", con la mayor es "ok"
  const kcal = Math.max(metaDomingo, metaSemanaNueva);
  assert.notEqual(estadoDia(kcal, metaSemanaNueva), estadoDia(kcal, metaDomingo));
});

test('aviso de cambio de meta semanal', () => {
  const perfilActivo = { ...perfil, usual_exercise_hours_week: 7 };
  const weights = [{ log_date: '2026-10-13', weight_kg: 85 }, { log_date: '2026-10-31', weight_kg: 80 }, { log_date: '2026-11-04', weight_kg: 79 }];
  const ctx = construirContexto({ weights, meals: [], exercises: [], water: [] });
  const aviso = cambioMetaSemanal(perfilActivo, ctx, '2026-11-04');
  assert.ok(aviso, 'debe avisar');
  assert.equal(aviso.lunes, '2026-11-02');
  assert.equal(aviso.ahora - aviso.antes, aviso.diff);
  assert.ok(aviso.motivos.length > 0);
  // en modo manual no hay aviso
  assert.equal(cambioMetaSemanal({ ...perfilActivo, target_mode: 'manual', manual_target_kcal: 2000 }, ctx, '2026-11-04'), null);
  // cuenta nueva (primer registro esta misma semana): no hay semana anterior con que comparar
  const nueva = construirContexto({ weights: [{ log_date: '2026-11-03', weight_kg: 80 }], meals: [], exercises: [], water: [] });
  assert.equal(cambioMetaSemanal(perfilActivo, nueva, '2026-11-04'), null);
});
