importScripts('/sw-navigation.js');

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', function (event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      requireInteraction: true, // 사용자가 상호작용할 때까지 알림 유지
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '2',
        url: data.url || '/',
      },
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
        .catch((err) => console.error('[SW] showNotification error:', err))
    );
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const targetUrl = event.notification.data && event.notification.data.url;

  event.waitUntil(
    self.FomopomoSwNavigation.focusOrOpenNotificationTarget({
      clientsApi: clients,
      targetUrl,
      origin: self.location.origin,
    })
  );
});
