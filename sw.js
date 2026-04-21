/* Plataforma asesores: caché solo de estáticos propios. Sin HTML ni APIs. Web Push para recordatorios. */
const CACHE_NAME = "prevy-static-v14";
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/app-shell.css",
  "/theme-init.js",
  "/pwa-push-register.js",
  "/pwa-update.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", function (event) {
  /* Sin skipWaiting automático: la nueva versión queda "waiting" hasta que el cliente
     envíe {type:'SKIP_WAITING'} (botón "Actualizar" del banner). Así el usuario siempre
     sabe cuándo pasa a la nueva versión y puede completar el flujo en curso. */
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .catch(function () {})
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== CACHE_NAME) return caches.delete(key);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", function (event) {
  var data = { title: "Prevy", body: "", url: "/recordatorios.html", tag: "prevy-reminder" };
  try {
    if (event.data) {
      var j = event.data.json();
      if (j.title) data.title = j.title;
      if (j.body) data.body = j.body;
      if (j.url) data.url = j.url;
      if (j.tag) data.tag = j.tag;
    }
  } catch (_e) {}
  var opts = {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag,
    renotify: true,
    silent: false,
    data: { url: data.url },
  };
  event.waitUntil(self.registration.showNotification(data.title, opts));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = "/recordatorios.html";
  try {
    if (event.notification && event.notification.data && event.notification.data.url) {
      url = String(event.notification.data.url);
    }
  } catch (_e) {}
  var abs = new URL(url, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url && "focus" in c) {
          c.focus();
          if (typeof c.navigate === "function") {
            try {
              c.navigate(abs);
            } catch (_nav) {}
          }
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(abs);
    })
  );
});

function isStaticAsset(pathname) {
  return /\.(css|js|png|svg|ico|woff2?|webmanifest)$/i.test(pathname);
}

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/.netlify/")) return;

  if (!isStaticAsset(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) {
        fetch(event.request)
          .then(function (networkResponse) {
            if (networkResponse && networkResponse.ok) {
              var copy = networkResponse.clone();
              caches.open(CACHE_NAME).then(function (c) {
                c.put(event.request, copy);
              });
            }
          })
          .catch(function () {});
        return cached;
      }
      return fetch(event.request).then(function (networkResponse) {
        if (!networkResponse || !networkResponse.ok) return networkResponse;
        var copy = networkResponse.clone();
        caches.open(CACHE_NAME).then(function (c) {
          c.put(event.request, copy);
        });
        return networkResponse;
      });
    })
  );
});
