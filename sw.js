const CACHE = 'frankiflow-mail-dev-v18';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/styles.css',
  '/assets/modern.css',
  '/assets/account-security.css',
  '/assets/settings-cleanup.css',
  '/assets/app.js',
  '/assets/enhancements.js',
  '/assets/account-security.js',
  '/assets/settings-cleanup.js',
  '/assets/config.js',
  '/assets/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/index.html');
        throw new Error('Offline and resource not cached');
      })
  );
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { title: 'FrankiFlow Mail', body: 'New email received.' }; }
  const title = data.title || 'FrankiFlow Mail';
  const options = {
    body: data.body || 'New email received.',
    icon: '/assets/icon.svg',
    tag: data.tag || 'frankiflow-mail',
    renotify: true,
    data: { url: data.url || '/' },
    vibrate: [100, 60, 100]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
      const sameOrigin = clients.find(client => {
        try { return new URL(client.url).origin === self.location.origin; } catch { return false; }
      });
      if (sameOrigin) {
        if ('navigate' in sameOrigin) await sameOrigin.navigate(target);
        return sameOrigin.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
