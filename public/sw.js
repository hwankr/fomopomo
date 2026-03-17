self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', function (event) {
  console.log('[SW] Push Received!'); // ✨ Debug Log
  if (event.data) {
    const data = event.data.json();
    console.log('[SW] Push Data:', data); // ✨ Debug Log
    const options = {
      body: data.body,
      requireInteraction: true, // ✨ Keep notification until user interacts
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '2',
        url: data.url || '/',
      },
    };
    
    console.log('[SW] Showing notification with options:', options); // ✨ Debug Log

    event.waitUntil(
      self.registration.showNotification(data.title, options)
        .then(() => console.log('[SW] showNotification success'))
        .catch((err) => console.error('[SW] showNotification error:', err))
    );
  }
});

self.addEventListener('notificationclick', function (event) {
  console.log('Notification click received.');
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
