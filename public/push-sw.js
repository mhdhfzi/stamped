/* Stamped — shows group-chat notifications while the app is closed or in the background.
   Messages come from Firebase Cloud Messaging as data: { title, body, tag, groupId }. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
