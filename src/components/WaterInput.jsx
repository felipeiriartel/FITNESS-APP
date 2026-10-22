import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { useToast } from './ui.jsx';

const RAPIDOS = [250, 500, 750, 1000];
const etiqueta = (ml) => (ml >= 1000 ? `${fmt(ml / 1000, 2)} L` : `${ml} ml`);

/**
 * Registro de agua: botones rápidos y, para otra cantidad,
 * una barra deslizable sincronizada con un campo para escribir los ml.
 */
export default function WaterInput({ fecha }) {
  const { userId, reload } = useData();
  const toast = useToast();
  const [otra, setOtra] = useState(false);
  const [ml, setMl] = useState(300);
  const [ocupado, setOcupado] = useState(false);

  async function agregar(cantidad) {
    const valor = Math.round(cantidad);
    if (!(valor >= 10 && valor <= 5000)) {
      toast('Indique una cantidad entre 10 y 5.000 ml', 'error');
      return;
    }
    setOcupado(true);
    const { error } = await supabase.from('water_logs').insert({ user_id: userId, log_date: fecha, ml: valor });
    setOcupado(false);
    if (error) return toast(error.message, 'error');
    toast(`${etiqueta(valor)} de agua registrados`);
    setOtra(false);
    reload();
  }

  const escribir = (e) => {
    const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
    setMl(Number.isFinite(n) ? Math.min(n, 5000) : 0);
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="water-buttons">
        {RAPIDOS.map((v) => (
          <button key={v} className="btn small" disabled={ocupado} onClick={() => agregar(v)}>
            +{v >= 1000 ? '1 L' : v}
          </button>
        ))}
      </div>
      {!otra ? (
        <button className="btn small ghost block" onClick={() => setOtra(true)}>Otra cantidad</button>
      ) : (
        <div className="water-custom">
          <input
            type="range" min="50" max="2000" step="50"
            value={Math.min(Math.max(ml, 50), 2000)}
            onChange={(e) => setMl(Number(e.target.value))}
            aria-label="Cantidad de agua en mililitros"
            style={{ '--pct': `${((Math.min(Math.max(ml, 50), 2000) - 50) / 1950) * 100}%` }}
          />
          <div className="row">
            <label className="water-ml">
              <input inputMode="numeric" value={ml || ''} onChange={escribir} aria-label="Mililitros" />
              <span>ml</span>
            </label>
            <button className="btn primary grow" disabled={ocupado || !ml} onClick={() => agregar(ml)}>
              Agregar {ml ? etiqueta(ml) : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
