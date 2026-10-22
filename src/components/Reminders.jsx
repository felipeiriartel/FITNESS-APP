import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import {
  RECORDATORIOS_INICIALES, activarEnEsteTelefono, desactivarEnEsteTelefono, enviarPrueba, esIOS, soporte, suscripcionActual,
} from '../lib/push.js';
import { fmt } from '../lib/format.js';
import { useData } from '../data.jsx';
import { ErrorBox, Icon, Spinner, useToast } from './ui.jsx';

const MAX_AGUA = 6;
const zonaLocal = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';
const ordenar = (horas) => [...new Set(horas.filter(Boolean))].sort();

/** Sugiere una hora nueva para el agua, 3 horas después de la última. */
function siguienteHora(horas) {
  const ultima = horas.length ? horas[horas.length - 1] : '08:00';
  const [h, m] = ultima.split(':').map(Number);
  const nueva = Math.min(h + 3, 22);
  return `${String(nueva).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function Reminders() {
  const { profile, userId, metas, reload } = useData();
  const toast = useToast();
  const guardado = { ...RECORDATORIOS_INICIALES, ...(profile?.recordatorios ?? {}) };
  const [conf, setConf] = useState(guardado);
  const [telefonoActivo, setTelefonoActivo] = useState(null); // null = revisando
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const estado = soporte();

  useEffect(() => {
    suscripcionActual().then((s) => setTelefonoActivo(Boolean(s))).catch(() => setTelefonoActivo(false));
  }, []);

  const cambiado = JSON.stringify(conf) !== JSON.stringify(guardado);

  async function guardar(nueva) {
    const { error: e } = await supabase
      .from('profiles')
      .update({ recordatorios: nueva, zona_horaria: zonaLocal() })
      .eq('user_id', userId);
    if (e) throw new Error('No se pudieron guardar los recordatorios.');
    setConf(nueva);
    await reload();
  }

  async function ejecutar(fn) {
    setOcupado(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setOcupado(false);
    }
  }

  const activar = () => ejecutar(async () => {
    await activarEnEsteTelefono(userId);
    setTelefonoActivo(true);
    await guardar({ ...conf, activo: true, agua: ordenar(conf.agua) });
    await enviarPrueba().catch(() => {});
    toast('Recordatorios activados');
  });

  const desactivar = () => ejecutar(async () => {
    await desactivarEnEsteTelefono();
    setTelefonoActivo(false);
    await guardar({ ...conf, activo: false });
    toast('Recordatorios desactivados');
  });

  const guardarHoras = () => ejecutar(async () => {
    await guardar({ ...conf, agua: ordenar(conf.agua) });
    toast('Horarios guardados');
  });

  const probar = () => ejecutar(async () => {
    await enviarPrueba();
    toast('Notificación de prueba enviada');
  });

  const setAgua = (i, v) => setConf((c) => ({ ...c, agua: c.agua.map((h, j) => (j === i ? v : h)) }));
  const quitarAgua = (i) => setConf((c) => ({ ...c, agua: c.agua.filter((_, j) => j !== i) }));
  const agregarAgua = () => setConf((c) => ({ ...c, agua: [...ordenar(c.agua), siguienteHora(ordenar(c.agua))] }));

  const activo = guardado.activo && telefonoActivo;

  return (
    <section className="card stack reminders">
      <div className="row between" style={{ alignItems: 'center' }}>
        <h2>Recordatorios</h2>
        {telefonoActivo === null ? null : <span className={`pill ${activo ? 'ok' : 'sin'}`}>{activo ? 'Activados' : 'Apagados'}</span>}
      </div>
      <p className="muted">
        Avisos en su teléfono para tomar agua (cuánto le falta) y para saber cuántas calorías le quedan para su meta del día.
      </p>

      {estado === 'instalar-ios' && (
        <div className="alert warn">
          <b>En iPhone, primero instale Comidia.</b> Toque <b>Compartir</b> (el cuadrado con flecha) y luego{' '}
          <b>Agregar a pantalla de inicio</b>. Abra Comidia desde ese ícono y vuelva aquí para activar los recordatorios.
        </div>
      )}
      {estado === 'no-soportado' && (
        <div className="alert warn">Este navegador no permite notificaciones. Pruebe con Chrome, Edge, Firefox o Safari actualizado.</div>
      )}

      {estado === 'ok' && (
        <>
          <div className="stack" style={{ gap: 10 }}>
            <div className="reminder-head">
              <span className="badge agua"><Icon name="agua" size={18} /></span>
              <div className="grow">
                <b>Agua</b>
                <small>{metas ? `Meta ${fmt(metas.agua / 1000, 1)} L. Si ya la cumplió, no le avisa.` : 'Según su meta de agua.'}</small>
              </div>
            </div>
            <div className="times">
              {conf.agua.map((h, i) => (
                <div className="time-chip" key={i}>
                  <input type="time" step="900" value={h} aria-label={`Recordatorio de agua ${i + 1}`}
                    onChange={(e) => setAgua(i, e.target.value)} />
                  <button className="icon-btn" title="Quitar" onClick={() => quitarAgua(i)}><Icon name="x" size={16} /></button>
                </div>
              ))}
              {conf.agua.length < MAX_AGUA && (
                <button className="btn small ghost" onClick={agregarAgua}><Icon name="mas" size={18} /> Agregar hora</button>
              )}
            </div>
          </div>

          <div className="stack" style={{ gap: 10 }}>
            <div className="reminder-head">
              <span className="badge"><Icon name="almuerzo" size={18} /></span>
              <div className="grow">
                <b>Calorías que le quedan</b>
                <small>Le dice cuántas kcal y proteína le faltan, o le recuerda registrar si no ha anotado nada.</small>
              </div>
            </div>
            <div className="times">
              {conf.calorias ? (
                <div className="time-chip">
                  <input type="time" step="900" value={conf.calorias} aria-label="Recordatorio de calorías"
                    onChange={(e) => setConf((c) => ({ ...c, calorias: e.target.value }))} />
                  <button className="icon-btn" title="Quitar" onClick={() => setConf((c) => ({ ...c, calorias: null }))}><Icon name="x" size={16} /></button>
                </div>
              ) : (
                <button className="btn small ghost" onClick={() => setConf((c) => ({ ...c, calorias: '20:00' }))}><Icon name="mas" size={18} /> Agregar hora</button>
              )}
            </div>
          </div>

          <small>Los avisos llegan dentro de los 15 minutos siguientes a cada hora elegida.</small>

          {telefonoActivo === null ? (
            <Spinner />
          ) : activo ? (
            <div className="row wrap">
              {cambiado && <button className="btn small primary" disabled={ocupado} onClick={guardarHoras}>Guardar horarios</button>}
              <button className="btn small" disabled={ocupado} onClick={probar}>Enviar prueba</button>
              <button className="btn small ghost danger" disabled={ocupado} onClick={desactivar}>Desactivar</button>
            </div>
          ) : (
            <button className="btn primary block" disabled={ocupado} onClick={activar}>
              {ocupado ? <Spinner /> : <Icon name="campana" />}
              {guardado.activo ? 'Activar en este teléfono' : 'Activar recordatorios'}
            </button>
          )}
          {esIOS() && <small>En iPhone se necesita iOS 16.4 o más reciente.</small>}
        </>
      )}
      <ErrorBox>{error}</ErrorBox>
    </section>
  );
}
