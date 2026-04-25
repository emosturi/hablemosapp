/* Plataforma asesores: caché solo de estáticos propios. Sin HTML ni APIs. Web Push para recordatorios. */
const CACHE_NAME = "prevy-static-v20";
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/app-shell.css",
  "/theme-init.js",
  "/pwa-push-register.js",
  "/pwa-update.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-badge-monochrome.png",
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
  var data = { title: "Prevy", body: "", url: "/agenda.html#calendario", tag: "prevy-reminder" };
  try {
    if (event.data) {
      var j = event.data.json();
      if (j.title) data.title = j.title;
      if (j.body) data.body = j.body;
      if (j.url) data.url = j.url;
      if (j.tag) data.tag = j.tag;
    }
  } catch (_e) {}
  var root = self.location.origin;
  var opts = {
    body: data.body,
    icon: root + "/icons/icon-192.png",
    badge: root + "/icons/icon-badge-monochrome.png",
    tag: data.tag,
    renotify: true,
    silent: false,
    data: { url: data.url },
  };
  event.waitUntil(self.registration.showNotification(data.title, opts));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = "/agenda.html#calendario";
  try {
    if (event.notification && event.notification.data && event.notification.data.url) {
      url = String(event.notification.data.url);
    }
  } catch (_e) {}
  var abs = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      function openFresh() {
        if (clients.openWindow) return clients.openWindow(abs);
        return Promise.resolve();
      }
      function sameOriginClientUrl(c) {
        try {
          if (!c.url) return false;
          return new URL(c.url).origin === self.location.origin;
        } catch (_e) {
          return false;
        }
      }
      /* Chrome/Android: priorizar ventana PWA (standalone) sobre la pestaña del navegador. */
      function clientPwaScore(c) {
        try {
          var dm = c.displayMode;
          if (dm === "standalone" || dm === "fullscreen" || dm === "minimal-ui") return 2;
        } catch (_e) {}
        return 0;
      }
      function notifyPageNavigate(c) {
        try {
          c.postMessage({ type: "PREVY_NOTIFICATION_NAVIGATE", url: abs });
        } catch (_e) {}
      }
      function focusThenNavigate(c) {
        var fp = null;
        try {
          if ("focus" in c) fp = c.focus();
        } catch (_e) {}
        var afterFocus = fp && typeof fp.then === "function" ? fp : Promise.resolve();
        return afterFocus.then(function () {
          notifyPageNavigate(c);
          if (typeof c.navigate === "function") {
            try {
              var np = c.navigate(abs);
              if (np && typeof np.then === "function") {
                return np.catch(function () {});
              }
            } catch (_nav) {}
          }
        });
      }
      var same = [];
      for (var i = 0; i < list.length; i++) {
        if (sameOriginClientUrl(list[i])) same.push(list[i]);
      }
      if (same.length === 0) return openFresh();
      same.sort(function (a, b) {
        return clientPwaScore(b) - clientPwaScore(a);
      });
      for (var j = 0; j < same.length; j++) {
        notifyPageNavigate(same[j]);
      }
      return focusThenNavigate(same[0]);
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
