/**
 * Primera vez por usuario en este navegador: pide permiso de notificación y registra Web Push (VAPID).
 * Requiere window.PREVY_VAPID_PUBLIC_KEY (clave pública, segura de exponer) y service worker activo.
 */
(function (global) {
  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var rawData = global.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  function prevyPushDebugEnabled() {
    try {
      if (global.location && String(global.location.search || "").indexOf("prevy_debug_push=1") !== -1) return true;
      return global.localStorage.getItem("prevy_debug_push") === "1";
    } catch (_e) {
      return false;
    }
  }

  global.prevyRegisterWebPushOnFirstLogin = function (_supabase, accessToken, userId) {
    var dbg = prevyPushDebugEnabled();
    function log() {
      if (!dbg || !global.console || !global.console.log) return;
      global.console.log.apply(global.console, ["[prevy-push]"].concat([].slice.call(arguments)));
    }

    if (!userId || !accessToken) {
      log("omit: sin userId o accessToken");
      return Promise.resolve();
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      log("omit: sin serviceWorker o PushManager");
      return Promise.resolve();
    }
    if (typeof Notification === "undefined") {
      log("omit: sin Notification API");
      return Promise.resolve();
    }

    var vapid = global.PREVY_VAPID_PUBLIC_KEY;
    if (!vapid || typeof vapid !== "string") {
      log("omit: PREVY_VAPID_PUBLIC_KEY ausente");
      return Promise.resolve();
    }
    vapid = vapid.trim();
    if (vapid.length < 80) {
      log("omit: VAPID público demasiado corto");
      return Promise.resolve();
    }

    var storageKey = "prevy_web_push_prompt_v2_" + userId;
    try {
      var prev = localStorage.getItem(storageKey);
      if (prev) {
        log("omit: ya intentado antes (" + prev + ")");
        return Promise.resolve();
      }
    } catch (_e) {
      return Promise.resolve();
    }

    log("solicitando permiso de notificación…");
    return Notification.requestPermission()
      .then(function (perm) {
        log("permiso:", perm);
        if (perm !== "granted") {
          try {
            localStorage.setItem(storageKey, perm === "denied" ? "denied" : "dismissed");
          } catch (_e2) {}
          return;
        }
        return navigator.serviceWorker.ready.then(function (reg) {
          log("service worker listo, subscribe…");
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapid),
          });
        })
          .then(function (subscription) {
            return fetch(global.location.origin + "/.netlify/functions/save-push-subscription", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + accessToken,
              },
              body: JSON.stringify({ subscription: subscription.toJSON() }),
            }).then(function (res) {
              if (!res.ok) throw new Error("save-push " + res.status);
              log("suscripción guardada en servidor");
              try {
                localStorage.setItem(storageKey, "granted");
              } catch (_e3) {}
            });
          })
          .catch(function (err) {
            log("error subscribe o save:", err && err.message ? err.message : err);
            try {
              localStorage.removeItem(storageKey);
            } catch (_e4) {}
          });
      })
      .catch(function (err) {
        log("error requestPermission:", err && err.message ? err.message : err);
        try {
          localStorage.setItem(storageKey, "error");
        } catch (_e5) {}
      });
  };
})(window);
