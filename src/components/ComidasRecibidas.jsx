import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { formatCorto } from '../lib/dates.js';
import { fmt } from '../lib/format.js';
import { TIPOS_COMIDA } from '../lib/calc.js';
import { useSocial } from '../social.jsx';
import { Icon, useToast } from './ui.jsx';

/** Comidas que le compartieron sus amigos: puede revisarlas y agregarlas, o rechazarlas. */
export default function ComidasRecibidas({ abrir }) {
  const { recibidas, cargarRecibidas } = useSocial();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(null);
  if (!recibidas.length) return null;

  async function rechazar(c) {
    setOcupado(c.id);
    const { error } = await supabase.from('comidas_compartidas')
      .update({ estado: 'rechazada', respondida_at: new Date().toISOString() }).eq('id', c.id);
    setOcupado(null);
    if (error) return toast(error.message, 'error');
    toast('Comida descartada');
    cargarRecibidas();
  }

  return (
    <section className="card stack recibidas" aria-label="Comidas compartidas con usted">
      <div className="section-title"><span className="badge"><Icon name="compartir" size={18} /></span><h2>Le compartieron</h2></div>
      <div className="list">
        {recibidas.map((c) => {
          const tipo = TIPOS_COMIDA.find((t) => t.id === c.meal_type);
          return (
            <div className="recibida" key={c.id}>
              <div className="list-item">
                <span className="thumb" aria-hidden="true"><Icon name={tipo?.icono ?? 'almuerzo'} /></span>
                <span className="grow">
                  <span className="item-title">{c.description}</span>
                  <small className="muted">{c.de_nombre.split(' ')[0]} · {tipo?.label ?? 'Comida'} · {formatCorto(c.log_date)}</small>
                </span>
                <span className="item-kcal num">{fmt(c.kcal)}<small>kcal</small></span>
              </div>
              <div className="row recibida-acciones">
                <button className="btn small ghost" disabled={ocupado === c.id} onClick={() => rechazar(c)}>No la comí</button>
                <button className="btn small primary grow" disabled={ocupado === c.id} onClick={() => abrir('compartida', c)}>
                  Revisar y agregar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
