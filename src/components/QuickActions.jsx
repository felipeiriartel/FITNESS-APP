import { todayISO } from '../lib/dates.js';
import { Modal } from './ui.jsx';
import WaterInput from './WaterInput.jsx';

/** Hoja que abre el botón ＋: reúne todo lo que se puede registrar. */
export default function QuickActions({ fecha, onClose, abrir }) {
  const esHoy = fecha === todayISO();
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
        <button className="action" onClick={() => abrir('texto')}>
          <span className="emoji">✍️</span>
          <b>Escribir</b>
          <small>Sin foto</small>
        </button>
        <button className="action" onClick={() => abrir('codigo')}>
          <span className="emoji">🔲</span>
          <b>Código</b>
          <small>De barras</small>
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
        <button className="action" onClick={() => abrir('sugerir')}>
          <span className="emoji">💡</span>
          <b>¿Qué como?</b>
          <small>Ideas con lo que queda</small>
        </button>
        <div className="water-quick">
          <div className="section-title"><span className="emoji" aria-hidden="true">💧</span><b>Agua</b></div>
          <WaterInput fecha={fecha} />
        </div>
      </div>
    </Modal>
  );
}
