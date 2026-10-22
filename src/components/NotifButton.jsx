import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase.js';
import {
  RECORDATORIOS_INICIALES, activarEnEsteTelefono, desactivarEnEsteTelefono, enviarPrueba, soporte, suscripcionActual,
} from '../lib/push.js';
import { useData } from '../data.jsx';
import { ErrorBox, Icon, Modal, Spinner, useToast } from './ui.jsx';

const zonaLocal = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';

/**
 * Campana en el encabezado: activa los recordatorios con un toque,
 * sin tener que ir a Ajustes. Si ya están activos, abre un panel corto.
 */
export default function NotifButton({ irAAjustes }) {
  const { profile, userId, reload } = useData();
  const toast = useToast();
  const conf = { ...RECORDATORIOS_INICIALES, ...(profile?.recordatorios ?? {}) };
  const [telefono, setTelefono] = useState(null); // null = revisando
  const [panel, setPanel] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const estado = soporte();

  useEffect(() => {
    suscripcionActual().then((s) => setTelefono(Boolean(s))).catch(() => setTelefono(false));
  }, []);

  const activo = Boolean(conf.activo && telefono);

  async function guardar(cambios) {
    const { error: e } = await supabase.from('profiles')
      .update({ recordatorios: { ...conf, ...cambios }, zona_horaria: zonaLocal() })
      .eq('user_id', userId);
    if (e) throw new Error('No se pudieron guardar los recordatorios.');
    await reload();
  }

  async function ejecutar(fn) {
    setOcupado(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message ?? String(e));
      setPanel(true);
    } finally {
      setOcupado(false);
    }
  }

  const activar = () => ejecutar(async () => {
    await activarEnEsteTelefono(userId);
    setTelefono(true);
    await guardar({ activo: true });
    await enviarPrueba().catch(() => {});
    setPanel(false);
    toast('Recordatorios activados');
  });

  const desactivar = () => ejecutar(async () => {
    await desactivarEnEsteTelefono();
    setTelefono(false);
    await guardar({ activo: false });
    setPanel(false);
    toast('Recordatorios desactivados');
  });

  const probar = () => ejecutar(async () => {
    await enviarPrueba();
    toast('Notificación de prueba enviada');
  });

  function tocar() {
    if (ocupado || telefono === null) return;
    if (!activo && estado === 'ok') activar();
    else setPanel(true);
  }

  const horas = [...(conf.agua ?? [])].sort();
  const etiqueta = activo ? 'Recordatorios activados' : 'Activar recordatorios';

  return (
    <>
      <button className={`icon-btn round bell${activo ? ' on' : ''}`} onClick={tocar} aria-label={etiqueta} title={etiqueta}
        disabled={ocupado}>
        {ocupado ? <Spinner /> : <Icon name="campana" filled={activo} size={21} />}
        {!activo && telefono !== null && <span className="bell-dot" aria-hidden="true" />}
      </button>

      {/* Se dibuja fuera del encabezado (que tiene desenfoque y atraparía la hoja). */}
      {panel && createPortal(
        <Modal title="Recordatorios" onClose={() => { setPanel(false); setError(null); }}>
          <div className="stack">
            {estado === 'instalar-ios' && (
              <div className="alert warn">
                <b>En iPhone, primero instale Comidia.</b> Toque <b>Compartir</b> (el cuadrado con flecha) y luego{' '}
                <b>Agregar a pantalla de inicio</b>. Abra Comidia desde ese ícono y toque otra vez la campana.
              </div>
            )}
            {estado === 'no-soportado' && (
              <div className="alert warn">Este navegador no permite notificaciones. Pruebe con Chrome, Edge, Firefox o Safari actualizado.</div>
            )}
            {estado === 'ok' && activo && (
              <>
                <p className="muted">Le avisaremos en este teléfono:</p>
                <ul className="bell-list">
                  <li><Icon name="agua" /> Agua: {horas.length ? horas.join(' · ') : 'sin horarios'}</li>
                  <li><Icon name="almuerzo" /> Calorías que le quedan: {conf.calorias ?? 'sin horario'}</li>
                </ul>
                <div className="grid2">
                  <button className="btn small" disabled={ocupado} onClick={probar}>Enviar prueba</button>
                  <button className="btn small" onClick={() => { setPanel(false); irAAjustes(); }}>Cambiar horarios</button>
                </div>
                <button className="btn small ghost danger block" disabled={ocupado} onClick={desactivar}>Desactivar recordatorios</button>
              </>
            )}
            {estado === 'ok' && !activo && (
              <button className="btn primary block" disabled={ocupado} onClick={activar}>
                {ocupado ? <Spinner /> : <Icon name="campana" />} Activar recordatorios
              </button>
            )}
            <ErrorBox>{error}</ErrorBox>
          </div>
        </Modal>,
        document.body,
      )}
    </>
  );
}
