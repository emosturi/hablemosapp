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

  global.prevyRegisterWebPushOnFirstLogin = function (_supabase, accessToken, userId) {
    if (!userId || !accessToken) return Promise.resolve();
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return Promise.resolve();
    if (typeof Notification === "undefined") return Promise.resolve();

    var vapid = global.PREVY_VAPID_PUBLIC_KEY;
    if (!vapid || typeof vapid !== "string") return Promise.resolve();
    vapid = vapid.trim();
    if (vapid.length < 80) return Promise.resolve();

    var storageKey = "prevy_web_push_prompt_v2_" + userId;
    try {
      if (localStorage.getItem(storageKey)) return Promise.resolve();
    } catch (_e) {
      return Promise.resolve();
    }

    return Notification.requestPermission()
      .then(function (perm) {
        if (perm !== "granted") {
          try {
            localStorage.setItem(storageKey, perm === "denied" ? "denied" : "dismissed");
          } catch (_e2) {}
          return;
        }
        return navigator.serviceWorker.ready.then(function (reg) {
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
              try {
                localStorage.setItem(storageKey, "granted");
              } catch (_e3) {}
            });
          })
          .catch(function () {
            try {
              localStorage.removeItem(storageKey);
            } catch (_e4) {}
          });
      })
      .catch(function () {
        try {
          localStorage.setItem(storageKey, "error");
        } catch (_e5) {}
      });
  };
})(window);
