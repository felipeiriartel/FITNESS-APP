import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bmr, calcularMetas, construirContexto, estadoDia, kcalEjercicio, resumenSemana, tdeeAdaptativo,
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
