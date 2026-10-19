import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fmt } from '../lib/format.js';

/* ---------------- Hoja inferior (modal) ----------------
 * - Encabezado y botón principal (footer) fijos mientras se desplaza el contenido.
 * - Se cierra deslizando hacia abajo desde la parte superior.
 * - El botón "atrás" de Android cierra la hoja en vez de salir de la app.
 */
const abiertos = []; // hojas abiertas, la última es la de arriba
let siguienteId = 0;
let ignorarPop = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorarPop > 0) {
      ignorarPop--;
      return;
    }
    const arriba = abiertos[abiertos.length - 1];
    if (arriba) {
      arriba.porAtras = true;
      arriba.cerrar();
    }
  });
}

export function Modal({ title, onClose, children, footer }) {
  const [cerrando, setCerrando] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cerrado = useRef(false);
  const sheetRef = useRef(null);
  const arrastre = useRef(null);

  const cerrar = useCallback(() => {
    if (cerrado.current) return;
    cerrado.current = true;
    setCerrando(true);
    setTimeout(() => onCloseRef.current(), 190);
  }, []);

  useEffect(() => {
    const yo = { id: ++siguienteId, cerrar, porAtras: false };
    abiertos.push(yo);
    const st = window.history.state;
    // Si la entrada actual es de una hoja que ya se cerró (se pasó de una hoja a otra), se reutiliza.
    if (st?.comidiaHoja && !abiertos.some((a) => a.id === st.comidiaHoja)) {
      window.history.replaceState({ ...st, comidiaHoja: yo.id }, '');
    } else {
      window.history.pushState({ ...(st ?? {}), comidiaHoja: yo.id }, '');
    }
    const onKey = (e) => e.key === 'Escape' && cerrar();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      abiertos.splice(abiertos.indexOf(yo), 1);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (yo.porAtras) return;
      setTimeout(() => {
        if (abiertos.length) return; // otra hoja tomó su lugar
        if (window.history.state?.comidiaHoja) {
          ignorarPop++;
          window.history.back();
        }
      }, 0);
    };
  }, [cerrar]);

  // Deslizar hacia abajo para cerrar.
  const tocar = {
    onTouchStart: (e) => {
      arrastre.current = { y0: e.touches[0].clientY, dy: 0 };
      if (sheetRef.current) sheetRef.current.style.transition = 'none';
    },
    onTouchMove: (e) => {
      const a = arrastre.current;
      if (!a || !sheetRef.current) return;
      a.dy = Math.max(0, e.touches[0].clientY - a.y0);
      sheetRef.current.style.transform = `translateY(${a.dy}px)`;
    },
    onTouchEnd: () => {
      const a = arrastre.current;
      arrastre.current = null;
      const el = sheetRef.current;
      if (!a || !el) return;
      if (a.dy > 90) return cerrar();
      el.style.transition = 'transform 0.25s var(--ease-out)';
      el.style.transform = '';
    },
  };

  return (
    <div className={`backdrop${cerrando ? ' closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div ref={sheetRef} className={`sheet${footer ? ' has-footer' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-top" {...tocar}>
          <div className="grabber" />
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn round" onClick={cerrar} aria-label="Cerrar">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Vibración breve al confirmar (solo en teléfonos que lo permiten). */
export function vibrar(patron = 12) {
  try {
    navigator.vibrate?.(patron);
  } catch {
    /* sin vibración */
  }
}

/* ---------------- Avisos breves ---------------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  const toast = useCallback((texto, tipo = 'ok') => {
    const n = ++id.current;
    vibrar(tipo === 'error' ? [30, 40, 30] : 12);
    setItems((p) => [...p.slice(-2), { n, texto, tipo }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.n !== n)), tipo === 'error' ? 4500 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.n} className={`toast ${t.tipo}`}>{t.texto}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Anillo de calorías ---------------- */
const COLOR_RING = { ok: 'var(--palta)', leve: 'var(--choclo)', exceso: 'var(--aji)', bajo: 'var(--cielo)', sin: 'var(--surface-2)' };

export function Ring({ value, max, estado, children }) {
  const r = 88;
  const c = 2 * Math.PI * r;
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setListo(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const offset = c * (1 - (listo ? pct : 0));
  return (
    <div className="ring">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle className="track" cx="100" cy="100" r={r} fill="none" strokeWidth="18" />
        <circle className="fill" cx="100" cy="100" r={r} fill="none" strokeWidth="18" strokeLinecap="round"
          stroke={COLOR_RING[estado] ?? COLOR_RING.ok} strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

/* ---------------- Barras ---------------- */
export function Bar({ value, max, color, thin }) {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setListo(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar${thin ? ' thin' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${listo ? pct : 0}%`, background: color }} />
    </div>
  );
}

export function Macro({ nombre, value, target, color }) {
  return (
    <div className="macro">
      <span className="name" style={{ color }}>{nombre}</span>
      <div className="top">
        <b className="num">{fmt(value)}</b>
        <small className="num">/ {fmt(target)} g</small>
      </div>
      <Bar value={value} max={target} color={color} thin />
    </div>
  );
}

/* ---------------- Íconos ---------------- */
const PATHS = {
  hoy: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  calendario: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  progreso: 'M4 19l5-6 4 3 7-9M4 19h16',
  ajustes: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  x: 'M6 6l12 12M18 6L6 18',
  izq: 'M15 5l-7 7 7 7',
  der: 'M9 5l7 7-7 7',
  basura: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  estrella: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  mas: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
};

export function Icon({ name, size = 22, filled, stroke = 2, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
