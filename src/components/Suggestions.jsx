import { useState } from 'react';
import { supabase, mensajeError } from '../lib/supabase.js';
import { TIPOS_COMIDA } from '../lib/calc.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { tipoPorHora } from './MealForm.jsx';
import { ErrorBox, Modal, Spinner } from './ui.jsx';

/** "¿Qué puedo comer?": la IA propone 3 comidas que calzan con lo que queda del día. */
export default function Suggestions({ fecha, onClose, abrir }) {
  const { ctx, metas } = useData();
  const consumo = ctx.intakeByDate.get(fecha) ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const restante = {
    kcal: Math.max(0, metas.meta - consumo.kcal),
    proteina_g: Math.max(0, metas.proteina - consumo.protein_g),
    carbohidratos_g: Math.max(0, metas.carbos - consumo.carbs_g),
    grasas_g: Math.max(0, metas.grasa - consumo.fat_g),
  };
  const [tipo, setTipo] = useState(tipoPorHora());
  const [preferencias, setPreferencias] = useState('');
  const [lista, setLista] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  async function sugerir() {
    setCargando(true);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke('analyze-meal', {
      body: {
        mode: 'sugerir',
        meal_type: TIPOS_COMIDA.find((t) => t.id === tipo)?.label,
        restante,
        preferencias,
      },
    });
    setCargando(false);
    if (err || data?.error) return setError(data?.error ?? (await mensajeError(err)));
    setLista(data.sugerencias ?? []);
  }

  function elegir(s) {
    abrir('comida', {
      inicial: {
        titulo: 'Registrar sugerencia',
        tipo,
        nombre: s.nombre,
        fuente: 'ia',
        items: [{
          nombre: s.nombre, cantidad: s.ingredientes.join(', '), gramos: 0, kcal: s.kcal,
          proteina_g: s.proteina_g, carbohidratos_g: s.carbohidratos_g, grasas_g: s.grasas_g,
        }],
      },
    });
  }

  return (
    <Modal title="¿Qué puedo comer?" onClose={onClose}>
      <div className="stack">
        <div className="remaining">
          <div><b className="num">{fmt(restante.kcal)}</b><small>kcal disponibles</small></div>
          <div><b className="num" style={{ color: 'var(--ciruela)' }}>{fmt(restante.proteina_g)} g</b><small>de proteína por cubrir</small></div>
        </div>

        <div className="chips" role="radiogroup" aria-label="Para qué comida">
          {TIPOS_COMIDA.filter((t) => t.id !== 'bebida').map((t) => (
            <button key={t.id} role="radio" aria-checked={tipo === t.id} className={`chip${tipo === t.id ? ' on' : ''}`} onClick={() => setTipo(t.id)}>
              <span className="emoji" aria-hidden="true">{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>
        <label className="field">
          ¿Qué tiene en casa o qué se le antoja? (opcional)
          <input value={preferencias} onChange={(e) => setPreferencias(e.target.value)}
            placeholder="Ej: tengo pollo y arroz" maxLength={300} />
        </label>
        <button className="btn primary big block" disabled={cargando} onClick={sugerir}>
          {cargando ? <><Spinner /> Pensando opciones…</> : <><span className="emoji" aria-hidden="true">💡</span> {lista ? 'Otras opciones' : 'Darme ideas'}</>}
        </button>
        <ErrorBox>{error}</ErrorBox>

        {lista && !lista.length && <p className="muted">No llegaron sugerencias. Intente de nuevo.</p>}
        {lista?.map((s) => (
          <article className="suggestion" key={s.nombre}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <h3>{s.nombre}</h3>
              <span className="item-kcal num">{fmt(s.kcal)} kcal</span>
            </div>
            {s.descripcion && <small>{s.descripcion}</small>}
            <div className="tags">
              <span className="tag p">P {fmt(s.proteina_g)} g</span>
              <span className="tag c">C {fmt(s.carbohidratos_g)} g</span>
              <span className="tag g">G {fmt(s.grasas_g)} g</span>
            </div>
            {s.ingredientes.length > 0 && <ul>{s.ingredientes.map((i) => <li key={i}>{i}</li>)}</ul>}
            <button className="btn small primary" onClick={() => elegir(s)}>Comí esto, registrarlo</button>
          </article>
        ))}
      </div>
    </Modal>
  );
}
