import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { mensajeError, supabase } from './lib/supabase.js';

/* Amigos, comidas compartidas y suscripción.
 * Se cargan aparte de los registros para no demorar la apertura de la app. */
const Ctx = createContext(null);
export const useSocial = () => useContext(Ctx);

export const PRECIO = 4990;
export const APP_URL = typeof window !== 'undefined' ? window.location.origin : 'https://comidia.netlify.app';
const SYNC_MS = 6 * 3600_000; // se revisa el estado en Flow cada 6 horas como máximo

export function enlaceInvitacion(codigo) {
  return `${APP_URL}/?invita=${encodeURIComponent(codigo)}`;
}

export function diasRestantes(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000));
}

export function SocialProvider({ children }) {
  const [sus, setSus] = useState(null); // null = cargando
  const [amigos, setAmigos] = useState([]);
  const [recibidas, setRecibidas] = useState([]);

  const cargarSus = useCallback(async () => {
    const { data, error } = await supabase.rpc('mi_suscripcion');
    // Si la función aún no existe (migración pendiente), no se bloquea la app.
    if (error) return setSus({ estado: 'gratis', acceso: true, sinDatos: true });
    setSus(data);
    return data;
  }, []);

  const cargarAmigos = useCallback(async () => {
    const { data, error } = await supabase.rpc('mis_amigos');
    if (!error) setAmigos(data ?? []);
  }, []);

  const cargarRecibidas = useCallback(async () => {
    const { data, error } = await supabase.rpc('comidas_recibidas');
    if (!error) setRecibidas(data ?? []);
  }, []);

  const recargar = useCallback(() => Promise.all([cargarSus(), cargarAmigos(), cargarRecibidas()]), [cargarSus, cargarAmigos, cargarRecibidas]);

  /** Pide al servidor que lea el estado en Flow (después de pagar o si el dato es antiguo). */
  const sincronizar = useCallback(async () => {
    const { error } = await supabase.functions.invoke('flow', { body: { accion: 'sincronizar' } });
    if (error) console.warn('flow sincronizar:', await mensajeError(error));
    return cargarSus();
  }, [cargarSus]);

  useEffect(() => {
    (async () => {
      const s = await cargarSus();
      cargarAmigos();
      cargarRecibidas();
      const viejo = !s?.sincronizado_at || Date.now() - new Date(s.sincronizado_at).getTime() > SYNC_MS;
      if (s?.con_flow && viejo) sincronizar();
    })();
    const alVolver = () => document.visibilityState === 'visible' && (cargarRecibidas(), cargarAmigos());
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [cargarSus, cargarAmigos, cargarRecibidas, sincronizar]);

  const value = useMemo(() => ({
    sus, amigos, recibidas,
    soloAmigos: amigos.filter((a) => a.relacion === 'amigo'),
    solicitudes: amigos.filter((a) => a.relacion === 'recibida'),
    cargarSus, cargarAmigos, cargarRecibidas, recargar, sincronizar,
  }), [sus, amigos, recibidas, cargarSus, cargarAmigos, cargarRecibidas, recargar, sincronizar]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Abre el registro de tarjeta en Flow. */
export async function irAPagar() {
  const { data, error } = await supabase.functions.invoke('flow', { body: { accion: 'iniciar' } });
  if (error) throw new Error(await mensajeError(error));
  if (!data?.url) throw new Error('No se pudo abrir el pago. Intente de nuevo.');
  window.location.assign(data.url);
}

/** Comparte el enlace de invitación por el menú del teléfono o lo copia. */
export async function compartirInvitacion(codigo, toast) {
  const url = enlaceInvitacion(codigo);
  const texto = 'Le invito a Comidia para competir en el ranking. Con este enlace tiene 15 días gratis:';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Comidia', text: texto, url });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${texto} ${url}`);
    toast?.('Enlace copiado. Péguelo en WhatsApp.');
  } catch {
    window.prompt('Copie este enlace:', url);
  }
}
