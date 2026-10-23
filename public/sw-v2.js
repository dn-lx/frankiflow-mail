// No mailbox responses or authenticated API requests are cached on this device.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FrankiFlow Mail · Offline</title><body style="font:16px system-ui;background:#f7f9f8;color:#253b36;padding:15vh 10vw"><h1>You’re offline.</h1><p>Reconnect to load your mailbox. Saved device drafts remain on this device.</p><button onclick="location.reload()">Try again</button></body></html>', { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } })));
});
self.addEventListener("push", event => {
  let data = {}; try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || "FrankiFlow Mail", { body: data.body || "You have new mail.", icon: "/icon-192.png", badge: "/icon-192.png", tag: data.tag || "frankiflow-mail", data: { url: data.url || "/" } }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  let target = self.location.origin + "/";
  try { const candidate = new URL(event.notification.data?.url || "/", self.location.origin); if (candidate.origin === self.location.origin) target = candidate.href; } catch {}
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    for (const client of clients) if (new URL(client.url).origin === self.location.origin) { await client.navigate(target); return client.focus(); }
    return self.clients.openWindow(target);
  }));
});
