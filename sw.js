/* Plataforma asesores: caché solo de estáticos propios. Sin HTML ni APIs. */
const CACHE_NAME = "hablemos-static-v3";
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/app-shell.css",
  "/theme-init.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .catch(function () {})
      .then(function () {
        return self.skipWaiting();
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
