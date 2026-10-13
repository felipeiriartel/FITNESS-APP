import { useEffect, useState } from 'react';
import { fmt } from '../lib/format.js';

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Bar({ value, max, color, thin }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar${thin ? ' thin' : ''}`}>
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function MacroBar({ label, value, target, color, unit = 'g' }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row between">
        <small>{label}</small>
        <small className="num">
          <b style={{ color: 'var(--text)' }}>{fmt(value)}</b> / {fmt(target)} {unit}
        </small>
      </div>
      <Bar value={value} max={target} color={color} thin />
    </div>
  );
}

const PATHS = {
  hoy: 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4',
  calendario: 'M4 5h16v15H4zM4 9h16M8 13h2M12 13h2M16 13h2M8 16h2M12 16h2',
  progreso: 'M4 19l5-6 4 3 7-9M4 19h16',
  ajustes: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14.3 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 002 1.2l.4 2.6h4l.4-2.6a7 7 0 002-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  x: 'M6 6l12 12M18 6L6 18',
  izq: 'M15 5l-7 7 7 7',
  der: 'M9 5l7 7-7 7',
  basura: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  estrella: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  camara: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  mas: 'M12 5v14M5 12h14',
  gota: 'M12 3.5c3.5 4.2 6 7.6 6 10.5a6 6 0 01-12 0c0-2.9 2.5-6.3 6-10.5z',
  pesa: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
  plato: 'M12 20a8 8 0 100-16 8 8 0 000 16zM12 16a4 4 0 100-8 4 4 0 000 8z',
  balanza: 'M5 20h14l-1.5-12h-11zM9 8a3 3 0 016 0',
};

export function Icon({ name, size = 20, filled }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Pill({ estado, children }) {
  return <span className={`pill ${estado}`}>{children}</span>;
}

export function ErrorBox({ children }) {
  if (!children) return null;
  return <div className="alert error" role="alert">{children}</div>;
}

/**
 * El plato: el borde se llena a medida que se consumen calorías.
 * Verde dentro de la meta, amarillo con leve exceso, rojo con exceso.
 */
export function Plate({ consumido, meta, estado, children }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = meta > 0 ? Math.min(1, consumido / meta) : 0;
  // Se llena una vez al abrir la pantalla.
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setListo(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const color = estado === 'exceso' ? 'var(--tomate)' : estado === 'leve' ? 'var(--choclo)' : 'var(--palta)';
  return (
    <div className="plate">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" className="rim-track" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" className="rim-fill" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={listo ? c * (1 - pct) : c} />
        <circle cx="60" cy="60" r="40" className="dish" />
      </svg>
      <div className="plate-center">{children}</div>
    </div>
  );
}
