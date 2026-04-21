/**
 * Registra el service worker en páginas sin app-shell.js (login, dashboard).
 * Delega en /pwa-update.js para no duplicar la lógica del banner de actualización.
 */
(function () {
  if (!("serviceWorker" in navigator)) return;
  if (document.querySelector('script[data-prevy-pwa-update]')) return;
  var s = document.createElement("script");
  s.src = "/pwa-update.js";
  s.defer = true;
  s.setAttribute("data-prevy-pwa-update", "1");
  (document.head || document.documentElement).appendChild(s);
})();
