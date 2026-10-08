/* Stamped service worker
   1. Offline: keeps every file of the app on the phone (list from /precache.json, made at build
      time), so Stamped opens with no internet. Your trips and photos are already on the phone.
   2. Notifications: shows group-chat messages while the app is closed (Firebase Cloud Messaging
      sends data: { title, body, tag, groupId }).
   Firebase, maps, search and routing requests are not touched here. */

const APP_CACHE = 'stamped-app-';
const FONT_CACHE = 'stamped-fonts';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch('/precache.json', { cache: 'no-store' });
      const { version, urls } = await res.json();
      const cache = await caches.open(APP_CACHE + version);
      // One by one, so a single missing file doesn't stop the rest.
      await Promise.all(
        urls.map((u) =>
          fetch(u, { cache: 'no-cache' })
            .then((r) => r.ok && cache.put(u === '/' ? '/index.html' : u, r))
            .catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep only the newest app version.
      const res = await fetch('/precache.json', { cache: 'no-store' }).catch(() => null);
      const current = res && res.ok ? APP_CACHE + (await res.json()).version : null;
      for (const key of await caches.keys()) {
        if (current && key.startsWith(APP_CACHE) && key !== current) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Anything in any of our app caches. */
async function fromCache(request) {
  for (const key of await caches.keys()) {
    if (!key.startsWith(APP_CACHE)) continue;
    const hit = await (await caches.open(key)).match(request, { ignoreSearch: true });
    if (hit) return hit;
  }
  return undefined;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: keep a copy so the app looks right offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const fresh = fetch(req)
          .then((r) => {
            if (r.ok) cache.put(req, r.clone());
            return r;
          })
          .catch(() => hit);
        return hit || fresh;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  // Sign-in pages and the notification server always go to the network.
  if (url.pathname.startsWith('/__/') || url.pathname.startsWith('/api/')) return;

  // Opening the app: try the network (so updates arrive), fall back to the saved copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 4000);
          const r = await fetch(req, { signal: ctrl.signal });
          clearTimeout(timer);
          return r;
        } catch {
          return (await fromCache('/index.html')) || Response.error();
        }
      })(),
    );
    return;
  }

  // App files (names change with every build): saved copy first, else download.
  event.respondWith(
    (async () => {
      const hit = await fromCache(req);
      if (hit) return hit;
      return fetch(req);
    })(),
  );
});

// ───────────── Notifications ─────────────

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { data: { body: event.data ? event.data.text() : '' } };
  }
  const data = payload.data || {};
  const note = payload.notification || {};
  const title = data.title || note.title || 'Stamped';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || note.body || '',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { groupId: data.groupId || null },
    }),
  );
});

// Tapping a notification opens (or focuses) the app on that trip's chat.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const groupId = event.notification.data && event.notification.data.groupId;
  const url = groupId ? '/?chat=' + encodeURIComponent(groupId) : '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if ('focus' in w) {
          await w.focus();
          if (groupId) w.postMessage({ type: 'open-chat', groupId });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
