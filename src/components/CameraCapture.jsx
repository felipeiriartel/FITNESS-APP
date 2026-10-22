import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui.jsx';

/** Tamaños de plato que se ofrecen (diámetro en cm). 0 = no lo sabe. */
export const PLATOS = [0, 20, 22, 24, 26, 28, 30];
const CLAVE_PLATO = 'comidia_plato_cm';
const MARGEN = 1.12; // el recorte deja un poco de borde alrededor del círculo

export function leerPlato() {
  try {
    const v = Number(localStorage.getItem(CLAVE_PLATO));
    return PLATOS.includes(v) ? v : 0;
  } catch {
    return 0;
  }
}
function guardarPlato(cm) {
  try { localStorage.setItem(CLAVE_PLATO, String(cm)); } catch { /* sin almacenamiento */ }
}

/**
 * Cámara propia con un círculo guía para encuadrar el plato desde arriba.
 * Al disparar recorta la imagen al círculo (con un pequeño margen) y entrega
 * { blob, base64, preview, guia: { platoCm, anchoCm } }.
 * Si la cámara no se puede abrir, llama a onFallback() para usar la cámara nativa.
 */
export default function CameraCapture({ onCapture, onClose, onFallback }) {
  const videoRef = useRef(null);
  const guiaRef = useRef(null);
  const streamRef = useRef(null);
  const [lista, setLista] = useState(false);
  const [plato, setPlato] = useState(leerPlato);
  const [elegirPlato, setElegirPlato] = useState(false);
  const [disparando, setDisparando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin-camara');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } },
        });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setLista(true);
      } catch {
        if (!cancelado) onFallback();
      }
    })();
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiarPlato(cm) {
    setPlato(cm);
    guardarPlato(cm);
    setElegirPlato(false);
  }

  async function disparar() {
    const v = videoRef.current;
    const g = guiaRef.current;
    if (!v?.videoWidth || !g) return;
    setDisparando(true);
    navigator.vibrate?.(30);
    // El video se muestra con object-fit: cover; se traduce el círculo a coordenadas del video.
    const ev = v.getBoundingClientRect();
    const gc = g.getBoundingClientRect();
    const escala = Math.max(ev.width / v.videoWidth, ev.height / v.videoHeight);
    const offX = (ev.width - v.videoWidth * escala) / 2;
    const offY = (ev.height - v.videoHeight * escala) / 2;
    const cx = gc.left + gc.width / 2 - ev.left;
    const cy = gc.top + gc.height / 2 - ev.top;
    let lado = (gc.width * MARGEN) / escala;
    lado = Math.min(lado, v.videoWidth, v.videoHeight);
    let sx = (cx - offX) / escala - lado / 2;
    let sy = (cy - offY) / escala - lado / 2;
    sx = Math.max(0, Math.min(sx, v.videoWidth - lado));
    sy = Math.max(0, Math.min(sy, v.videoHeight - lado));
    const salida = Math.min(1280, Math.round(lado));
    const canvas = document.createElement('canvas');
    canvas.width = salida;
    canvas.height = salida;
    canvas.getContext('2d').drawImage(v, sx, sy, lado, lado, 0, 0, salida, salida);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    // Ancho real de la foto: el círculo es el plato y el recorte le suma el margen.
    const anchoCm = plato ? Math.round(plato * (lado / (gc.width / escala)) * 10) / 10 : 0;
    onCapture({ blob, base64: dataUrl.split(',')[1], preview: dataUrl, guia: { platoCm: plato, anchoCm } });
  }

  return createPortal(
    <div className="cam" role="dialog" aria-modal="true" aria-label="Cámara para fotografiar el plato">
      <video ref={videoRef} className="cam-video" playsInline muted autoPlay />
      <div className="cam-mask" aria-hidden="true">
        <div ref={guiaRef} className="cam-guia" />
      </div>

      <div className="cam-top">
        <button className="cam-btn" aria-label="Cerrar cámara" onClick={onClose}><Icon name="x" size={22} /></button>
        <button className="cam-plato" onClick={() => setElegirPlato((x) => !x)}>
          Plato: <b>{plato ? `${plato} cm` : 'sin medir'}</b>
        </button>
      </div>

      {elegirPlato && (
        <div className="cam-sheet">
          <b>¿Cuánto mide su plato de lado a lado?</b>
          <small>Mídalo una vez con una regla o huincha. Se guarda en este teléfono.</small>
          <div className="chips">
            {PLATOS.map((cm) => (
              <button key={cm} className={`chip${plato === cm ? ' on' : ''}`} onClick={() => cambiarPlato(cm)}>
                {cm ? `${cm} cm` : 'No sé'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="cam-bottom">
        <p className="cam-hint">
          {lista ? 'Tome la foto desde arriba, con el plato justo dentro del círculo' : 'Abriendo la cámara…'}
        </p>
        <button className="cam-shutter" aria-label="Tomar foto" disabled={!lista || disparando} onClick={disparar}>
          <span />
        </button>
      </div>
    </div>,
    document.body,
  );
}
