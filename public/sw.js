// SmartKlimat N3prenad: service worker enbart för push-notiser (se AGENTS.md).
// Tillåtna händelser: install, activate, push, notificationclick och pushsubscriptionchange.
// Den hanterar aldrig nätverksanrop och sparar ingenting, så appen laddar alltid färskt.
// src/lib/push/__tests__/serviceWorker.test.ts vaktar detta.

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

function readPayload(event) {
  if (!event.data) return {};
  try { return event.data.json() || {}; } catch (e) {
    try { return { body: event.data.text() }; } catch (e2) { return {}; }
  }
}

function sameOriginPath(value) {
  try {
    const url = new URL(typeof value === 'string' && value ? value : '/', self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search : '/';
  } catch (e) { return '/'; }
}

self.addEventListener('push', (event) => {
  const p = readPayload(event);
  const title = typeof p.title === 'string' && p.title.trim() ? p.title : 'SmartKlimat N3prenad';
  const tag = typeof p.tag === 'string' && p.tag ? p.tag : undefined;
  const options = {
    body: typeof p.body === 'string' ? p.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: { url: sameOriginPath(p.url) },
    tag,
    renotify: !!tag,
  };
  // Visa alltid en notis: iOS och Safari kan annars dra in prenumerationen.
  const tasks = [self.registration.showNotification(title, options)];
  const unread = Number(p.unread);
  if (Number.isFinite(unread) && self.navigator && 'setAppBadge' in self.navigator) {
    tasks.push((unread > 0 ? self.navigator.setAppBadge(Math.floor(unread)) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = sameOriginPath(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = windows.find((w) => { try { return new URL(w.url).origin === self.location.origin; } catch (e) { return false; } });
    if (win) {
      try { await win.focus(); } catch (e) { /* fokus kan nekas */ }
      // Sidan öppnar konversationen via samma väg som /?chat=.
      win.postMessage({ type: 'smartklimat:open-url', url: path });
      return;
    }
    await self.clients.openWindow(path);
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
    if (key) {
      try { await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); } catch (e) { /* appen synkar vid nästa start */ }
    }
    // Öppna fönster registrerar den nya prenumerationen på den inloggade.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((w) => w.postMessage({ type: 'smartklimat:push-resync' }));
  })());
});
