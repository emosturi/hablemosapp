/**
 * Registra el service worker (páginas sin app-shell.js, p. ej. login).
 */
(function () {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function onLoad() {
    window.removeEventListener("load", onLoad);
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {});
  });
})();
