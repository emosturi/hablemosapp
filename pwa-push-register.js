/**
 * Web Push (VAPID): registro en primer login, re-sincronización si el permiso ya está concedido
 * y reintento manual (force). Requiere window.PREVY_VAPID_PUBLIC_KEY y service worker activo.
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

  function prevyPushStorageKey(userId) {
    return "prevy_web_push_prompt_v2_" + userId;
  }

  function prevyPushDebugEnabled() {
    try {
      if (global.location && String(global.location.search || "").indexOf("prevy_debug_push=1") !== -1) return true;
      return global.localStorage.getItem("prevy_debug_push") === "1";
    } catch (_e) {
      return false;
    }
  }

  function createPushLogger(forceDebug) {
    var dbg = forceDebug || prevyPushDebugEnabled();
    return function () {
      if (!dbg || !global.console || !global.console.log) return;
      global.console.log.apply(global.console, ["[prevy-push]"].concat([].slice.call(arguments)));
    };
  }

  function getVapidPublicKey(log) {
    var vapid = global.PREVY_VAPID_PUBLIC_KEY;
    if (!vapid || typeof vapid !== "string") {
      log("omit: PREVY_VAPID_PUBLIC_KEY ausente");
      return null;
    }
    vapid = vapid.trim();
    if (vapid.length < 80) {
      log("omit: VAPID público demasiado corto");
      return null;
    }
    return vapid;
  }

  function pushCapabilitiesOk(log) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      log("omit: sin serviceWorker o PushManager");
      return false;
    }
    if (typeof Notification === "undefined") {
      log("omit: sin Notification API");
      return false;
    }
    return true;
  }

  function savePushSubscription(accessToken, subscription, log) {
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
    });
  }

  function subscribePushManager(reg, vapid, log) {
    var appKey = urlBase64ToUint8Array(vapid);
    return reg.pushManager.getSubscription().then(function (existing) {
      if (existing) {
        log("suscripción existente en navegador, sincronizando…");
        return existing;
      }
      log("nueva suscripción push…");
      return reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey,
      });
    });
  }

  function syncGrantedPush(accessToken, userId, vapid, storageKey, log) {
    return navigator.serviceWorker.ready
      .then(function (reg) {
        return subscribePushManager(reg, vapid, log);
      })
      .then(function (subscription) {
        return savePushSubscription(accessToken, subscription, log).then(function () {
          try {
            localStorage.setItem(storageKey, "granted");
          } catch (_e) {}
          return { ok: true, reason: "synced" };
        });
      })
      .catch(function (err) {
        log("error sync:", err && err.message ? err.message : err);
        return navigator.serviceWorker.ready
          .then(function (reg) {
            return reg.pushManager.getSubscription().then(function (sub) {
              if (!sub) return null;
              return sub.unsubscribe().catch(function () {});
            });
          })
          .then(function () {
            return navigator.serviceWorker.ready.then(function (reg) {
              return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapid),
              });
            });
          })
          .then(function (subscription) {
            if (!subscription) throw err;
            return savePushSubscription(accessToken, subscription, log).then(function () {
              try {
                localStorage.setItem(storageKey, "granted");
              } catch (_e2) {}
              return { ok: true, reason: "resubscribed" };
            });
          })
          .catch(function (err2) {
            log("error re-subscribe:", err2 && err2.message ? err2.message : err2);
            try {
              localStorage.removeItem(storageKey);
            } catch (_e3) {}
            return { ok: false, reason: "sync_failed" };
          });
      });
  }

  /**
   * @param {string} accessToken
   * @param {string} userId
   * @param {{ force?: boolean }} [opts] force=true pide permiso de nuevo (botón manual)
   */
  global.prevyRegisterWebPush = function (accessToken, userId, opts) {
    opts = opts || {};
    var force = !!opts.force;
    var log = createPushLogger(force);

    if (!userId || !accessToken) {
      log("omit: sin userId o accessToken");
      return Promise.resolve({ ok: false, reason: "no_session" });
    }
    if (!pushCapabilitiesOk(log)) {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    }

    var vapid = getVapidPublicKey(log);
    if (!vapid) return Promise.resolve({ ok: false, reason: "no_vapid" });

    var storageKey = prevyPushStorageKey(userId);
    var stored = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch (_e) {
      return Promise.resolve({ ok: false, reason: "storage" });
    }

    if (Notification.permission === "granted") {
      log("permiso granted, sincronizar/re-suscribir");
      return syncGrantedPush(accessToken, userId, vapid, storageKey, log);
    }

    if (!force && stored) {
      log("omit prompt: estado guardado (" + stored + ")");
      return Promise.resolve({ ok: false, reason: stored });
    }

    if (force) {
      try {
        localStorage.removeItem(storageKey);
      } catch (_e2) {}
      stored = null;
    }

    if (Notification.permission === "denied") {
      log("permiso denegado en el navegador");
      try {
        localStorage.setItem(storageKey, "denied");
      } catch (_e3) {}
      return Promise.resolve({ ok: false, reason: "denied" });
    }

    log("solicitando permiso de notificación…");
    return Notification.requestPermission()
      .then(function (perm) {
        log("permiso:", perm);
        if (perm !== "granted") {
          try {
            localStorage.setItem(storageKey, perm === "denied" ? "denied" : "dismissed");
          } catch (_e4) {}
          return { ok: false, reason: perm === "denied" ? "denied" : "dismissed" };
        }
        return syncGrantedPush(accessToken, userId, vapid, storageKey, log);
      })
      .catch(function (err) {
        log("error requestPermission:", err && err.message ? err.message : err);
        try {
          localStorage.setItem(storageKey, "error");
        } catch (_e5) {}
        return { ok: false, reason: "error" };
      });
  };

  /** Compatibilidad: login automático (re-sincroniza si ya hay permiso). */
  global.prevyRegisterWebPushOnFirstLogin = function (_supabase, accessToken, userId) {
    return global.prevyRegisterWebPush(accessToken, userId, { force: false });
  };

  /** Estado local para UI (recordatorios, ajustes). */
  global.prevyGetWebPushStatus = function () {
    var supported = !!(
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      typeof Notification !== "undefined"
    );
    var permission = supported ? Notification.permission : "unsupported";
    var hasVapid = !!(global.PREVY_VAPID_PUBLIC_KEY && String(global.PREVY_VAPID_PUBLIC_KEY).trim().length >= 80);

    if (!supported || permission !== "granted") {
      return Promise.resolve({
        supported: supported,
        permission: permission,
        hasSubscription: false,
        hasVapid: hasVapid,
      });
    }

    return navigator.serviceWorker.ready
      .then(function (reg) {
        return reg.pushManager.getSubscription();
      })
      .then(function (sub) {
        return {
          supported: true,
          permission: permission,
          hasSubscription: !!sub,
          hasVapid: hasVapid,
        };
      })
      .catch(function () {
        return {
          supported: true,
          permission: permission,
          hasSubscription: false,
          hasVapid: hasVapid,
        };
      });
  };
})(window);
