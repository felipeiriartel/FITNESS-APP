import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { todayISO } from '../lib/dates.js';
import { useData } from '../data.jsx';
import { Modal, useToast } from './ui.jsx';

/** Hoja que abre el botón ＋: reúne todo lo que se puede registrar. */
export default function QuickActions({ fecha, onClose, abrir }) {
  const { userId, reload } = useData();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const esHoy = fecha === todayISO();

  async function agua(ml) {
    setOcupado(true);
    const { error } = await supabase.from('water_logs').insert({ user_id: userId, log_date: fecha, ml });
    setOcupado(false);
    if (error) return toast(error.message, 'error');
    toast(`💧 ${ml >= 1000 ? `${ml / 1000} L` : `${ml} ml`} de agua registrados`);
    reload();
  }

  return (
    <Modal title={esHoy ? '¿Qué quiere registrar?' : 'Registrar en el día elegido'} onClose={onClose}>
      <div className="actions">
        <button className="action main" onClick={() => abrir('comida')}>
          <span className="emoji">📷</span>
          <span className="stack" style={{ gap: 2 }}>
            <b>Comida o bebida</b>
            <small>Tome una foto y la IA calcula calorías y proteína</small>
          </span>
        </button>
        <button className="action" onClick={() => abrir('favoritas')}>
          <span className="emoji">⭐</span>
          <b>Frecuente</b>
          <small>Con un toque</small>
        </button>
        <button className="action" onClick={() => abrir('ejercicio')}>
          <span className="emoji">🏋️</span>
          <b>Ejercicio</b>
          <small>Pesas, fútbol…</small>
        </button>
        <button className="action" onClick={() => abrir('peso')}>
          <span className="emoji">⚖️</span>
          <b>Peso</b>
          <small>Y cintura</small>
        </button>
        <div className="water-quick">
          <span className="emoji">💧</span>
          <b className="grow">Agua</b>
          <button className="btn small" disabled={ocupado} onClick={() => agua(250)}>+250 ml</button>
          <button className="btn small" disabled={ocupado} onClick={() => agua(500)}>+500 ml</button>
        </div>
      </div>
    </Modal>
  );
}
