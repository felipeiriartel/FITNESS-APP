import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { TIPOS_COMIDA } from '../lib/calc.js';
import { addDays, formatLargo, todayISO } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { ErrorBox, Modal, Spinner, useToast } from './ui.jsx';

/** Copia comidas de otro día al día que se está viendo. */
export default function CopyDay({ fecha, onClose }) {
  const { userId, reload } = useData();
  const toast = useToast();
  const [origen, setOrigen] = useState(addDays(fecha, -1));
  const [comidas, setComidas] = useState(null);
  const [elegidas, setElegidas] = useState(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    setComidas(null);
    supabase.from('meals').select('*').eq('log_date', origen).order('created_at').then(({ data, error: e }) => {
      if (!vigente) return;
      if (e) return setError(e.message);
      setComidas(data ?? []);
      setElegidas(new Set((data ?? []).map((c) => c.id)));
    });
    return () => {
      vigente = false;
    };
  }, [origen]);

  const alternar = (id) => setElegidas((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const seleccion = (comidas ?? []).filter((c) => elegidas.has(c.id));
  const total = seleccion.reduce((s, c) => s + c.kcal, 0);

  async function copiar() {
    if (!seleccion.length) return;
    setOcupado(true);
    setError(null);
    const filas = seleccion.map((c) => ({
      user_id: userId, log_date: fecha, meal_type: c.meal_type, description: c.description,
      kcal: c.kcal, protein_g: c.protein_g, carbs_g: c.carbs_g, fat_g: c.fat_g,
      items: c.items, ai_confidence: c.ai_confidence, source: c.source,
    }));
    const { error: e } = await supabase.from('meals').insert(filas);
    setOcupado(false);
    if (e) return setError(e.message);
    toast(`📋 ${filas.length} ${filas.length === 1 ? 'comida copiada' : 'comidas copiadas'} (${fmt(total)} kcal)`);
    await reload();
    onClose();
  }

  const atajos = [
    { label: 'Ayer', d: addDays(fecha, -1) },
    { label: 'Anteayer', d: addDays(fecha, -2) },
    { label: 'Hace una semana', d: addDays(fecha, -7) },
  ];

  return (
    <Modal title="Copiar comidas de otro día" onClose={onClose}>
      <div className="stack">
        <div className="chips">
          {atajos.map((a) => (
            <button key={a.d} className={`chip${origen === a.d ? ' on' : ''}`} onClick={() => setOrigen(a.d)}>{a.label}</button>
          ))}
        </div>
        <label className="field">
          Otro día
          <input type="date" value={origen} max={todayISO()} onChange={(e) => e.target.value && setOrigen(e.target.value)} />
        </label>
        <small className="muted">Comidas del {formatLargo(origen).toLowerCase()}. Desmarque las que no quiera copiar.</small>

        {comidas === null && <div className="empty"><Spinner /></div>}
        {comidas?.length === 0 && <div className="empty"><span className="emoji">🍽️</span>No hay comidas registradas ese día.</div>}
        {comidas?.length > 0 && (
          <div className="list">
            {comidas.map((c) => (
              <label className="list-item check" key={c.id} style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={elegidas.has(c.id)} onChange={() => alternar(c.id)} />
                <span aria-hidden="true">{TIPOS_COMIDA.find((t) => t.id === c.meal_type)?.emoji}</span>
                <span className="grow item-title" style={{ fontWeight: 600 }}>{c.description}</span>
                <span className="item-kcal num">{fmt(c.kcal)}</span>
              </label>
            ))}
          </div>
        )}
        <ErrorBox>{error}</ErrorBox>
        <button className="btn primary big block" disabled={ocupado || !seleccion.length} onClick={copiar}>
          {ocupado ? <><Spinner /> Copiando…</> : seleccion.length
            ? `Copiar ${seleccion.length} ${seleccion.length === 1 ? 'comida' : 'comidas'} (${fmt(total)} kcal)`
            : 'Elija al menos una comida'}
        </button>
      </div>
    </Modal>
  );
}
