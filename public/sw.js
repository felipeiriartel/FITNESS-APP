// Comidia · service worker: solo recibe y muestra los recordatorios.
// No guarda la app en caché, así cada versión nueva se ve al tiro.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let datos = {};
  try {
    datos = e.data ? e.data.json() : {};
  } catch {
    datos = { body: e.data?.text() };
  }
  const titulo = datos.title || 'Comidia';
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.body || '',
      tag: datos.tag || 'comidia',
      renotify: true,
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      data: { url: datos.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url.startsWith(self.location.origin) && 'focus' in v) return v.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
