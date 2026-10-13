import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchAll, supabase } from './lib/supabase.js';
import { calcularMetas, construirContexto } from './lib/calc.js';
import { todayISO } from './lib/dates.js';

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

const vacio = { profile: null, weights: [], meals: [], exercises: [], water: [], favorites: [] };

export function DataProvider({ userId, children }) {
  const [raw, setRaw] = useState(vacio);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [prof, weights, meals, exercises, water, favorites] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        fetchAll('weight_logs', 'id,log_date,weight_kg,waist_cm,note'),
        fetchAll('meals', 'id,log_date,kcal,protein_g,carbs_g,fat_g'),
        fetchAll('exercise_logs', 'id,log_date,exercise_type,duration_min,intensity,kcal_est,description'),
        fetchAll('water_logs', 'id,log_date,ml,created_at'),
        fetchAll('favorite_meals', '*', 'name'),
      ]);
      if (prof.error) throw prof.error;
      setRaw({ profile: prof.data, weights, meals, exercises, water, favorites });
      setError(null);
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(() => {
    const ctx = construirContexto(raw);
    const hoy = todayISO();
    const metas = raw.profile && ctx.weights.length ? calcularMetas(raw.profile, ctx, hoy) : null;
    return { ...raw, ctx, metas, userId, loading, error, reload };
  }, [raw, userId, loading, error, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
