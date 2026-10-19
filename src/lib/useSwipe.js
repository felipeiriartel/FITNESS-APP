import { useRef } from 'react';

// Elementos donde un deslizamiento horizontal tiene otro significado.
const IGNORAR = 'input, textarea, select, .scroll-x, .chips.scroll, [data-noswipe]';

/**
 * Deslizar a la izquierda o derecha (para cambiar de día o de mes).
 * Devuelve los manejadores táctiles para el contenedor.
 */
export function useSwipe({ izquierda, derecha }) {
  const t = useRef(null);
  return {
    onTouchStart: (e) => {
      if (e.touches.length !== 1 || e.target.closest(IGNORAR)) {
        t.current = null;
        return;
      }
      t.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    },
    onTouchEnd: (e) => {
      const s = t.current;
      t.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Date.now() - s.t > 600 || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (dx < 0) izquierda?.();
      else derecha?.();
    },
  };
}
