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
        {items.map((t) => (
          <div key={t.n} className={`toast ${t.tipo}`}>
            <Icon name={t.tipo === 'error' ? 'alerta' : 'exito'} />
            {t.texto}
          </div>
        ))}
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
      <span style={{ width: `${pct}%`, transform: listo ? undefined : 'scaleX(0)', background: color }} />
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

/* ---------------- Íconos ----------------
 * Dibujados a mano en una grilla de 24, trazo de 2 con puntas y uniones redondeadas.
 * Los círculos se escriben como dos arcos para que todo sea un solo path.
 */
const PATHS = {
  // Navegación y acciones
  hoy: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  calendario: 'M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2',
  progreso: 'M3 17l5.5-5.5 4 3L20 7M15 7h5v5',
  ajustes: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  x: 'M6 6l12 12M18 6L6 18',
  izq: 'M15 5l-7 7 7 7',
  der: 'M9 5l7 7-7 7',
  basura: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  estrella: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  mas: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  trofeo: 'M8 4h8v5a4 4 0 01-8 0zM8 6H5c0 3 1.5 4.5 3.5 5M16 6h3c0 3-1.5 4.5-3.5 5M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z',
  corona: 'M4.5 15L3.5 7l5 3.5L12 5l3.5 5.5 5-3.5-1 8zM5 19h14',
  campana: 'M6 9a6 6 0 0112 0c0 6 2.5 8 2.5 8h-17S6 15 6 9zM10 20.5a2.2 2.2 0 004 0',
  camara: 'M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zM8.5 13.5a3.5 3.5 0 107 0 3.5 3.5 0 10-7 0',
  galeria: 'M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM3 16l5-5 4 4 3-3 6 6M14.5 9a1 1 0 102 0 1 1 0 10-2 0',
  codigo: 'M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M7 8v8M10.5 8v8M13 8v8M17 8v8',
  agua: 'M12 3.5c3 3.8 6 7.2 6 10.5a6 6 0 01-12 0c0-3.3 3-6.7 6-10.5zM9 14.5a3 3 0 003 3',
  ejercicio: 'M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11',
  peso: 'M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zM8 9.5a5 5 0 018 0M12 11l1.8-2.6',
  ia: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  exito: 'M3 12a9 9 0 1018 0 9 9 0 10-18 0M8 12.5l2.8 2.8 5.7-5.8',
  alerta: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  editar: 'M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16zM13.5 6.5l4 4',
  copiar: 'M9 9h10a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V10a1 1 0 011-1zM16 9V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3',
  idea: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z',
  racha: 'M12 21a6.5 6.5 0 006.5-6.5c0-4-3-6-4-9.5-2.5 1.5-3.5 4-3.5 5.5-1-.5-2-2-2-3-2 2-3.5 4.5-3.5 7A6.5 6.5 0 0012 21z',
  buscar: 'M4 10.5a6.5 6.5 0 1013 0 6.5 6.5 0 10-13 0M15.5 15.5L20 20',
  paquete: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  descarga: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  reloj: 'M9 3h6l.6 3.6M9 21h6l.6-3.6M9 3l-.6 3.6M9 21l-.6-3.6M7 12a5 5 0 1010 0 5 5 0 10-10 0M12 10v2l1.5 1',

  // Tipos de comida
  desayuno: 'M12 4c3 0 4.5 2 6.5 2.5S22 9 21 12s-1 5.5-4 7-6 1.5-8.5.5-5-2-5-5.5S5 9 6.5 7 9 4 12 4zM9.5 13a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0',
  almuerzo: 'M3 11h18a9 7.5 0 01-18 0zM9 21h6M9 7.5c0-1.5 1.5-1.5 1.5-3M14 7.5c0-1.5 1.5-1.5 1.5-3',
  once: 'M4 9h12v4a5 5 0 01-5 5H9a5 5 0 01-5-5zM16 10h1.5a2.5 2.5 0 010 5H16M3 21h15M8 3v3M12 3v3',
  cena: 'M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z',
  colacion: 'M12 7c-2-1.5-7-1.5-7 4.5 0 4 2.5 9.5 5.5 9.5 1 0 1-.5 1.5-.5s.5.5 1.5.5c3 0 5.5-5.5 5.5-9.5 0-6-5-6-7-4.5zM12 7c0-2 1-3.5 3-4',
  bebida: 'M6 7h12l-1.5 13a1 1 0 01-1 1h-7a1 1 0 01-1-1zM6.5 12h11M13 7l2-4h3',

  // Deportes
  balon: 'M3 12a9 9 0 1018 0 9 9 0 10-18 0M12 8l3.3 2.4-1.3 3.9h-4l-1.3-3.9zM12 8V3.5M15.3 10.4l4.2-1.5M14 14.3l2.6 3.7M10 14.3l-2.6 3.7M8.7 10.4L4.5 8.9',
  correr: 'M13.5 5a1.8 1.8 0 103.6 0 1.8 1.8 0 10-3.6 0M7 10.5L10.5 8H14l2 3.5h3M12 8.5l-2 5.5 3.5 2.5-1.5 5M10 14l-1.5 3H5',
  caminar: 'M11.5 4.5a1.8 1.8 0 103.6 0 1.8 1.8 0 10-3.6 0M10.5 21l2-6-2.5-2.5 1-4.5 3 3h2.5M11 8.5L8 11v3M14.5 15l1.5 6',
  bici: 'M2 16.5a3.5 3.5 0 107 0 3.5 3.5 0 10-7 0M15 16.5a3.5 3.5 0 107 0 3.5 3.5 0 10-7 0M5.5 16.5L9 9.5h6l3.5 7M9 9.5l3 7H5.5M14 6.5h2.5L15 9.5',
  corazon: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.4 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10zM7 12h2.5L11 9.5l2 5 1.5-2.5H17',
  rayo: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  ondas: 'M3 15c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5M3 19.5c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5M15.5 5a1.8 1.8 0 103.6 0 1.8 1.8 0 10-3.6 0M6 11l4-4 3 2.5-2 2',
  raqueta: 'M9.5 9a5.5 5.5 0 1011 0 5.5 5.5 0 10-11 0M11 13l-7 7M13 6.5l4 4M17 6.5l-4 4',
  guante: 'M7 11V8a4 4 0 014-4h3a4 4 0 014 4v5a5 5 0 01-5 5H9.5A2.5 2.5 0 017 15.5zM7 11h4a2 2 0 010 4H8M8.5 18v3h8v-3',
  musica: 'M4 18a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M15 16a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M9 18V6l11-2v12',
  yoga: 'M10.2 5a1.8 1.8 0 103.6 0 1.8 1.8 0 10-3.6 0M12 9v5M5 11.5L8.5 13h7l3.5-1.5M4 18c2.5-1.5 5-2 8-2s5.5.5 8 2M9 14l-2 2.5M15 14l2 2.5',
};

export function Icon({ name, size = 22, filled, stroke = 2, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.ia} />
    </svg>
  );
}

/* ---------------- Logotipo ----------------
 * Minúsculas condensadas dibujadas a trazo; los puntos de las íes son hojas a mano.
 */
export function Logo({ className, alto = 32 }) {
  return (
    <svg className={`logo${className ? ` ${className}` : ''}`} viewBox="-2 -2 194 64" height={alto} role="img" aria-label="Comidia">
      <g fill="none" stroke="var(--ink)" strokeWidth="10" strokeLinejoin="round">
        <path d="M21 31Q21 25 13 25Q5 25 5 33V47Q5 55 13 55Q21 55 21 49" />
        <path transform="translate(31 0)" d="M13 25Q21 25 21 33V47Q21 55 13 55Q5 55 5 47V33Q5 25 13 25Z" />
        <path transform="translate(62 0)" d="M5 60V33Q5 25 11.5 25Q18 25 18 33V60M18 33Q18 25 24.5 25Q31 25 31 33V60" />
        <path transform="translate(103 0)" d="M5 60V20" />
        <path transform="translate(118 0)" d="M21 0V60M21 33Q21 25 13 25Q5 25 5 33V47Q5 55 13 55Q21 55 21 47" />
        <path transform="translate(149 0)" d="M5 60V20" />
        <path transform="translate(164 0)" d="M21 20V60M21 33Q21 25 13 25Q5 25 5 33V47Q5 55 13 55Q21 55 21 47" />
      </g>
      <g className="logo-hoja" fill="var(--linea)">
        <path transform="translate(103 0)" d="M3.2 15.4C-2.8 12.6-.6 3.8 10.4-.2C12.6 6.9 10.2 13.1 3.2 15.4Z" />
        <path transform="translate(149 0)" d="M7.4 15.6C.4 13.8-1.6 5.6 1.6-.4C10.2 2.6 12.6 10.2 7.4 15.6Z" />
      </g>
      <g fill="none" stroke="var(--bg)" strokeWidth="1.3" strokeLinecap="round">
        <path transform="translate(103 0)" d="M3.6 14.2Q6.2 8.4 9.4 1.6" />
        <path transform="translate(149 0)" d="M6.8 14.4Q4.6 8 2.4 1.2" />
      </g>
    </svg>
  );
}

/** Estado vacío con ilustración, una frase útil y, si corresponde, la acción que lo resuelve. */
export function Vacio({ img, titulo, texto, children }) {
  return (
    <div className="vacio">
      <img src={img} alt="" width="168" height="168" loading="lazy" decoding="async" />
      <b>{titulo}</b>
      <p>{texto}</p>
      {children}
    </div>
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
