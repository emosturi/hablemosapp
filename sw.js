/* Plataforma asesores: estáticos + páginas offline de clientes. Web Push para recordatorios. */
const CACHE_NAME = "prevy-static-v30";
const OFFLINE_FALLBACK_URL = "/offline.html";
const OFFLINE_HTML_URLS = [
  "/offline.html",
  "/pension.html",
  "/editar-cliente.html",
  "/revisar-clientes.html",
];
/** URLs limpias (Netlify) → archivo cacheado */
const OFFLINE_HTML_ALIASES = {
  "/revisar-clientes": "/revisar-clientes.html",
  "/pension": "/pension.html",
  "/editar-cliente": "/editar-cliente.html",
  "/offline": "/offline.html",
};
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/app-shell.css",
  "/theme-init.js",
  "/legal-consent.js",
  "/pwa-push-register.js",
  "/pwa-push-ui.js",
  "/prevy-offline-store.js",
  "/prevy-offline-sync.js",
  "/prevy-offline-ui.js",
  "/pwa-update.js",
  "/app-shell.js",
  "/supabase-config.js",
  "/vendor/supabase.min.js",
  "/icons/icon-512.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-badge-monochrome.png",
].concat(OFFLINE_HTML_URLS);

function normalizeOfflinePath(pathname) {
  if (OFFLINE_HTML_ALIASES[pathname]) return OFFLINE_HTML_ALIASES[pathname];
  return pathname;
}

function precacheAll(cache, urls) {
  return Promise.all(
    urls.map(function (u) {
      return cache.add(u).catch(function () {
        /* Un fallo no debe impedir el resto del precache */
      });
    })
  );
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return precacheAll(cache, PRECACHE_URLS);
    })
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
    vibrate: [200, 100, 200, 100, 200],
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

function isOfflineHtml(pathname) {
  return OFFLINE_HTML_URLS.indexOf(normalizeOfflinePath(pathname)) !== -1;
}

function isNavigateRequest(request) {
  if (request.mode === "navigate") return true;
  var accept = request.headers.get("accept") || "";
  return accept.indexOf("text/html") !== -1;
}

function matchCachedOfflinePage(pathname) {
  var canonical = normalizeOfflinePath(pathname);
  return caches.match(canonical).then(function (page) {
    if (page) return page;
    if (canonical !== pathname) return caches.match(pathname);
    return null;
  });
}

function offlineNavigateResponse(pathname) {
  if (isOfflineHtml(pathname)) {
    return matchCachedOfflinePage(pathname).then(function (page) {
      return page || caches.match(OFFLINE_FALLBACK_URL);
    });
  }
  return caches.match(OFFLINE_FALLBACK_URL);
}

function cachePutCanonical(pathname, response) {
  var canonical = normalizeOfflinePath(pathname);
  caches.open(CACHE_NAME).then(function (c) {
    c.put(canonical, response);
    if (canonical !== pathname) c.put(pathname, response.clone());
  });
}

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/.netlify/")) return;

  if (isNavigateRequest(event.request)) {
    var pathname = url.pathname;
    event.respondWith(
      fetch(event.request)
        .then(function (networkResponse) {
          if (networkResponse && networkResponse.ok && isOfflineHtml(pathname)) {
            cachePutCanonical(pathname, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(function () {
          return matchCachedOfflinePage(pathname).then(function (cached) {
            if (cached) return cached;
            return caches.match(event.request).then(function (reqCached) {
              if (reqCached) return reqCached;
              return offlineNavigateResponse(pathname);
            });
          });
        })
    );
    return;
  }

  if (!isStaticAsset(url.pathname) && !isOfflineHtml(url.pathname)) return;

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
