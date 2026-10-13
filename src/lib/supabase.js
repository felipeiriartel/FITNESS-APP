import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configOk = Boolean(url && key);
export const supabase = configOk ? createClient(url, key) : null;

/** Lee todas las filas de una tabla del usuario, en páginas de 1000. */
export async function fetchAll(table, columns, order = 'log_date') {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(order, { ascending: true })
      .range(from, from + size - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < size) break;
  }
  return rows;
}

/** Extrae un mensaje legible de un error de Supabase o de una función. */
export async function mensajeError(error) {
  if (!error) return 'Error desconocido.';
  try {
    if (error.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      if (body?.error) return body.error;
    }
  } catch {
    /* sin cuerpo JSON */
  }
  return error.message || String(error);
}
