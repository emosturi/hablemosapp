/**
 * Registra el service worker y notifica al usuario cuando hay una nueva versión.
 *
 * Flujo:
 *   1. Se registra /sw.js en load.
 *   2. Escucha `updatefound` de la registration → nuevo worker → statechange a `installed`.
 *   3. Si hay un controller activo (no es la primera instalación), muestra un banner inferior
 *      "Hay una nueva versión disponible — Actualizar".
 *   4. Click en "Actualizar" → postMessage({type:'SKIP_WAITING'}) al worker en espera →
 *      el SW hace skipWaiting → el navegador dispara `controllerchange` → recarga la página.
 *   5. `registration.update()` se llama al volver a foreground y cada 1 h para detectar
 *      nuevas versiones sin esperar al siguiente cold start.
 *
 * Usado por app-shell.js (páginas con shell) y por pwa-register.js (login/dashboard).
 * El flag window.__prevyPwaUpdateInit evita doble inicialización.
 */
(function () {
  if (!("serviceWorker" in navigator)) return;
  if (window.__prevyPwaUpdateInit) return;
  window.__prevyPwaUpdateInit = true;

  var reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  function showUpdateBanner(waitingWorker) {
    if (!waitingWorker) return;
    if (document.getElementById("prevy-pwa-update-banner")) return;

    var bar = document.createElement("div");
    bar.id = "prevy-pwa-update-banner";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    bar.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:2147483646;" +
      "background:#0b3d5c;color:#fff;padding:12px 16px;" +
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;" +
      "font-size:14px;line-height:1.3;" +
      "display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;" +
      "box-shadow:0 -2px 10px rgba(0,0,0,0.25);";

    var msg = document.createElement("span");
    msg.textContent = "Hay una nueva versión disponible.";
    msg.style.cssText = "flex:1 1 auto;min-width:160px;";

    var btnUpdate = document.createElement("button");
    btnUpdate.type = "button";
    btnUpdate.textContent = "Actualizar";
    btnUpdate.style.cssText =
      "background:#fff;color:#0b3d5c;border:0;border-radius:6px;" +
      "padding:8px 14px;font-weight:600;font-size:14px;cursor:pointer;";
    btnUpdate.addEventListener("click", function () {
      btnUpdate.disabled = true;
      btnUpdate.textContent = "Actualizando…";
      try {
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
      } catch (_e) {
        window.location.reload();
      }
    });

    var btnDismiss = document.createElement("button");
    btnDismiss.type = "button";
    btnDismiss.textContent = "Después";
    btnDismiss.style.cssText =
      "background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.5);" +
      "border-radius:6px;padding:8px 12px;font-size:14px;cursor:pointer;";
    btnDismiss.addEventListener("click", function () {
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    });

    bar.appendChild(msg);
    bar.appendChild(btnUpdate);
    bar.appendChild(btnDismiss);
    (document.body || document.documentElement).appendChild(bar);
  }

  function track(registration) {
    if (!registration) return;
    /* Si ya había un worker "waiting" al cargar (y hay controller activo), mostrar banner de inmediato. */
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateBanner(registration.waiting);
    }
    registration.addEventListener("updatefound", function () {
      var nw = registration.installing;
      if (!nw) return;
      nw.addEventListener("statechange", function () {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateBanner(nw);
        }
      });
    });
  }

  function startRegistration() {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(function (registration) {
        track(registration);

        /* Verificar versión cada hora mientras la pestaña esté abierta. */
        setInterval(function () {
          registration.update().catch(function () {});
        }, 60 * 60 * 1000);

        /* Verificar también al volver la pestaña/PWA a foreground. */
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") {
            registration.update().catch(function () {});
          }
        });
      })
      .catch(function () {});
  }

  if (document.readyState === "complete") {
    startRegistration();
  } else {
    window.addEventListener("load", function onLoad() {
      window.removeEventListener("load", onLoad);
      startRegistration();
    });
  }
})();
