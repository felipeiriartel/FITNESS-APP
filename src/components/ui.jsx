import { useEffect } from 'react';
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
