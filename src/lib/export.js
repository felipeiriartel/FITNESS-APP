import * as XLSX from 'xlsx';
import { fetchAll, supabase } from './supabase.js';
import { resumenSemana } from './calc.js';
import { addDays, startOfWeek, todayISO } from './dates.js';
import { EJERCICIOS, TIPOS_COMIDA } from './calc.js';

const TABLAS = ['weight_logs', 'meals', 'exercise_logs', 'water_logs', 'favorite_meals'];

async function leerTodo(userId) {
  const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  const out = { profile };
  for (const t of TABLAS) out[t] = await fetchAll(t, '*', t === 'favorite_meals' ? 'name' : 'log_date');
  return out;
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const tipoComida = (id) => TIPOS_COMIDA.find((t) => t.id === id)?.label ?? id;

/** Libro Excel con una hoja por tipo de dato y un resumen semanal. */
export async function exportarExcel(userId, ctx, metas) {
  const d = await leerTodo(userId);
  const wb = XLSX.utils.book_new();
  const hoja = (nombre, filas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{}]), nombre);

  hoja('Comidas', d.meals.map((m) => ({
    Fecha: m.log_date, Tipo: tipoComida(m.meal_type), Descripción: m.description, kcal: m.kcal,
    'Proteína (g)': Number(m.protein_g), 'Carbohidratos (g)': Number(m.carbs_g), 'Grasas (g)': Number(m.fat_g),
    Origen: m.source, 'Confianza IA': m.ai_confidence != null ? Number(m.ai_confidence) : '',
    Detalle: (m.items ?? []).map((i) => `${i.nombre}${i.cantidad ? ` (${i.cantidad})` : ''}: ${i.kcal} kcal`).join(' | '),
  })));
  hoja('Ejercicio', d.exercise_logs.map((e) => ({
    Fecha: e.log_date, Tipo: EJERCICIOS[e.exercise_type]?.label ?? e.exercise_type, 'Duración (min)': e.duration_min,
    Intensidad: e.intensity, 'kcal estimadas': e.kcal_est, Descripción: e.description ?? '',
  })));
  hoja('Peso', d.weight_logs.map((w) => ({
    Fecha: w.log_date, 'Peso (kg)': Number(w.weight_kg), 'Cintura (cm)': w.waist_cm != null ? Number(w.waist_cm) : '',
  })));
  hoja('Agua', d.water_logs.map((w) => ({ Fecha: w.log_date, ml: w.ml })));

  const diario = [];
  if (ctx.inicioISO) {
    for (let f = ctx.inicioISO; f <= todayISO(); f = addDays(f, 1)) {
      const it = ctx.intakeByDate.get(f);
      diario.push({
        Fecha: f, kcal: it?.kcal ?? 0, 'Proteína (g)': Math.round(it?.protein_g ?? 0),
        'Carbohidratos (g)': Math.round(it?.carbs_g ?? 0), 'Grasas (g)': Math.round(it?.fat_g ?? 0),
        'Agua (ml)': ctx.waterByDate.get(f) ?? 0, 'Ejercicio (kcal)': ctx.exerciseByDate.get(f)?.kcal ?? 0,
      });
    }
  }
  hoja('Resumen diario', diario);

  const semanas = [];
  if (ctx.inicioISO && metas) {
    for (let l = startOfWeek(ctx.inicioISO); l <= todayISO(); l = addDays(l, 7)) {
      const s = resumenSemana(l, ctx, metas, todayISO());
      semanas.push({
        'Semana (lunes)': s.lunes, 'Días registrados': s.diasRegistrados, 'Días en meta': s.diasEnMeta,
        'kcal promedio': s.kcalProm ?? '', 'Proteína promedio (g)': s.proteinaProm ?? '', 'Déficit total (kcal)': s.deficit,
        'Baja estimada (kg)': Number(s.perdidaEstimada.toFixed(2)), 'Peso promedio (kg)': s.pesoProm != null ? Number(s.pesoProm.toFixed(2)) : '',
        'Cambio real (kg)': s.cambioReal != null ? Number(s.cambioReal.toFixed(2)) : '', 'Sesiones de ejercicio': s.sesiones,
      });
    }
  }
  hoja('Resumen semanal', semanas);
  hoja('Comidas frecuentes', d.favorite_meals.map((f) => ({
    Nombre: f.name, kcal: f.kcal, 'Proteína (g)': Number(f.protein_g), 'Carbohidratos (g)': Number(f.carbs_g), 'Grasas (g)': Number(f.fat_g),
  })));

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  descargar(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `balance-${todayISO()}.xlsx`);
}

/** Respaldo completo en JSON, que se puede importar en cualquier instalación de Balance. */
export async function exportarJSON(userId) {
  const d = await leerTodo(userId);
  const respaldo = { app: 'balance', version: 1, exportado: new Date().toISOString(), ...d };
  descargar(new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json' }), `balance-respaldo-${todayISO()}.json`);
}

/** Importa un respaldo JSON en la cuenta actual. Las fotos no se incluyen. */
export async function importarJSON(userId, file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'balance') throw new Error('El archivo no es un respaldo de Balance.');
  const limpiar = (filas) => (filas ?? []).map(({ id, user_id, created_at, updated_at, ...r }) => ({ ...r, user_id: userId }));
  if (data.profile) {
    const { error } = await supabase.from('profiles').upsert(limpiar([data.profile])[0]);
    if (error) throw error;
  }
  const resumen = {};
  for (const t of TABLAS) {
    let filas = limpiar(data[t]);
    if (t === 'meals') filas = filas.map((f) => ({ ...f, photo_path: null }));
    if (!filas.length) continue;
    for (let i = 0; i < filas.length; i += 500) {
      const lote = filas.slice(i, i + 500);
      const q = t === 'weight_logs'
        ? supabase.from(t).upsert(lote, { onConflict: 'user_id,log_date' })
        : supabase.from(t).insert(lote);
      const { error } = await q;
      if (error) throw error;
    }
    resumen[t] = filas.length;
  }
  return resumen;
}
