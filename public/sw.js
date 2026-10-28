// Service worker PATRIM Hub : appli installable + pages déjà vues disponibles hors connexion.
const CACHE = "patrim-hub-v2";
const SHELL = ["/", "/logo.png", "/emblem.png", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/renseignements/") || url.pathname.startsWith("/informations/")) return;
  // Réseau d'abord, cache en secours
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === "navigate" || /\.(js|css|png|svg|woff2?)$/.test(url.pathname) || url.pathname.startsWith("/_next/static"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/")))
  );
});

// Notifications envoyées par le Hub (nouveaux leads, briefing du matin)
self.addEventListener("push", (e) => {
  let n = {};
  try {
    n = e.data ? e.data.json() : {};
  } catch {}
  e.waitUntil(
    self.registration.showNotification(n.titre || "PATRIM Hub", {
      body: n.texte || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: n.tag,
      renotify: !!n.tag && !n.discret,
      silent: !!n.discret,
      data: { url: n.url || "/" },
    })
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tous) => {
      const ouvert = tous.find((c) => c.url.startsWith(self.location.origin));
      if (ouvert) return ouvert.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : undefined));
      return self.clients.openWindow(url);
    })
  );
});
