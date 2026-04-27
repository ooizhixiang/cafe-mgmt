// Service worker for Cafe Management PWA
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const { title, body, url, tag } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: tag || 'cafe-mgmt',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: url || '/' },
    })
  );
});

// Handle notification click — navigate to relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if one is open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url);
    })
  );
});
