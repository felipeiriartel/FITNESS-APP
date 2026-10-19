// Recordatorios: suscripción a notificaciones push del navegador o teléfono.
import { mensajeError, supabase } from './supabase.js';

// Clave pública VAPID (la privada vive solo en Supabase Vault).
const VAPID_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY
  || 'BGrdVTHNI8H2oaWGR0KBNYnv2onL3u2AWxEggvCUGYG7l3tKx-wT3THzExTcgjAIakBC6z7rTUJ3hvsj-VPU2w4';

export const RECORDATORIOS_INICIALES = { activo: false, agua: ['11:00', '16:00'], calorias: '20:00' };

export const esIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const instalada = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

/** 'ok' | 'instalar-ios' | 'no-soportado' */
export function soporte() {
  const api = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (esIOS() && !instalada()) return 'instalar-ios';
  return api ? 'ok' : 'no-soportado';
}

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker:', e));
  });
}

function aBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registro() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js');
}

/** ¿Este teléfono ya tiene una suscripción activa? */
export async function suscripcionActual() {
  if (soporte() !== 'ok') return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Pide permiso, suscribe este teléfono y lo guarda en la cuenta. */
export async function activarEnEsteTelefono(userId) {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    throw new Error(permiso === 'denied'
      ? 'Las notificaciones están bloqueadas para Comidia. Actívelas en los ajustes del teléfono o del navegador y vuelva a intentar.'
      : 'Debe permitir las notificaciones para recibir los recordatorios.');
  }
  const reg = await registro();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(VAPID_PUBLICA) });
  }
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 300) },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error('No se pudo guardar este teléfono. Intente de nuevo.');
  return sub;
}

/** Quita la suscripción de este teléfono. */
export async function desactivarEnEsteTelefono() {
  const sub = await suscripcionActual();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => {});
}

export async function enviarPrueba() {
  const { error } = await supabase.functions.invoke('send-reminders', { body: { prueba: true } });
  if (error) throw new Error(await mensajeError(error));
}
