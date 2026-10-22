import { todayISO } from '../lib/dates.js';
import { Icon, Modal } from './ui.jsx';
import WaterInput from './WaterInput.jsx';

/** Hoja que abre el botón +: reúne todo lo que se puede registrar. */
export default function QuickActions({ fecha, onClose, abrir }) {
  const esHoy = fecha === todayISO();
  return (
    <Modal title={esHoy ? '¿Qué quiere registrar?' : 'Registrar en el día elegido'} onClose={onClose}>
      <div className="actions">
        <button className="action main" onClick={() => abrir('comida')}>
          <Icon name="camara" size={30} stroke={1.8} />
          <span className="stack" style={{ gap: 2 }}>
            <b>Comida o bebida</b>
            <small>Tome una foto y la IA calcula calorías y proteína</small>
          </span>
        </button>
        <button className="action" onClick={() => abrir('texto')}>
          <Icon name="editar" size={26} />
          <b>Escribir</b>
          <small>Sin foto</small>
        </button>
        <button className="action" onClick={() => abrir('codigo')}>
          <Icon name="codigo" size={26} />
          <b>Código</b>
          <small>De barras</small>
        </button>
        <button className="action" onClick={() => abrir('favoritas')}>
          <Icon name="estrella" size={26} />
          <b>Frecuente</b>
          <small>Con un toque</small>
        </button>
        <button className="action" onClick={() => abrir('ejercicio')}>
          <Icon name="ejercicio" size={26} />
          <b>Ejercicio</b>
          <small>Pesas, fútbol…</small>
        </button>
        <button className="action" onClick={() => abrir('peso')}>
          <Icon name="peso" size={26} />
          <b>Peso</b>
          <small>Y cintura</small>
        </button>
        <button className="action" onClick={() => abrir('sugerir')}>
          <Icon name="idea" size={26} />
          <b>¿Qué como?</b>
          <small>Ideas con lo que queda</small>
        </button>
        <div className="water-quick">
          <div className="section-title"><span className="badge agua"><Icon name="agua" size={18} /></span><b>Agua</b></div>
          <WaterInput fecha={fecha} />
        </div>
      </div>
    </Modal>
  );
}
