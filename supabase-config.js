/**
 * Configuración de Supabase. Rellena con los datos de tu proyecto en supabase.com
 * Puedes copiar desde supabase-config.example.js
 */
window.SUPABASE_URL = "https://ndxelneraoabehyrplrv.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_G3-iWOKWSEq84ndlF3kViw_msMmwBT9";

// Web Push (PWA): misma clave que VAPID_PUBLIC_KEY en Netlify. Generar con: npx web-push generate-vapid-keys
window.PREVY_VAPID_PUBLIC_KEY = "BEtksq2xG0MhQo5jb8X_xjHVenWE3U4FAHV81n5aP7S1K7wVIa4HfUJieJtK7EwzRVrWlcaQdlsBRnjdwoKVsZw";

// Opcional: enlace mailto en «Mi suscripción» (menú usuario).
// window.PREVY_SUPPORT_EMAIL = "soporte@ejemplo.cl";

// Netlify Functions: mismo origen que la página (evita CORS con dominio plataforma.*).
window.NOTIFY_FUNCTION_URL =
  typeof window !== "undefined" && window.location && window.location.origin
    ? window.location.origin + "/.netlify/functions/notify-telegram"
    : "https://hablemosapp.netlify.app/.netlify/functions/notify-telegram";
window.NOTIFY_SECRET = "romi1960";
window.REMINDER_FUNCTION_URL =
  typeof window !== "undefined" && window.location && window.location.origin
    ? window.location.origin + "/.netlify/functions/send-reminder"
    : "https://hablemosapp.netlify.app/.netlify/functions/send-reminder";

window.ASESOR_REGISTRO_HABILITADO = true; // false = cerrado
//window.ASESOR_REGISTRO_DOMINIOS = ["gmail.com", "asesores.tuempresa.cl"]; // opcional

// Cierre automático por inactividad (24 h sin uso con la app visible; clics, teclado, scroll, etc. reinician el contador).
// En Supabase → Auth → JWT puedes revisar caducidad del access token si ves cierres por token y no por inactividad.
window.SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
window.installInactivityAutoLogout = function (supabaseClient, options) {
  try {
    if (!supabaseClient || !supabaseClient.auth || !window || !window.document) return;
    if (window.__inactivityLogoutInstalled) return;
    window.__inactivityLogoutInstalled = true;

    var timeoutMs = (options && options.timeoutMs) || window.SESSION_IDLE_TIMEOUT_MS || (24 * 60 * 60 * 1000);
    var redirectTo = (options && options.redirectTo) || "login.html";
    var key = "prevy:last-activity-at";
    var legacyActivityKey = "hablemosapp:last-activity-at";

    function nowMs() { return Date.now(); }
    function getLastActivity() {
      var raw = localStorage.getItem(key) || localStorage.getItem(legacyActivityKey);
      var n = parseInt(raw || "0", 10);
      return isNaN(n) || n <= 0 ? nowMs() : n;
    }
    function setLastActivity() {
      try {
        localStorage.setItem(key, String(nowMs()));
        localStorage.removeItem(legacyActivityKey);
      } catch (_ls) {}
    }
    function signOutIdle() {
      supabaseClient.auth.getSession().then(function (r) {
        var hasSession = !!(r && r.data && r.data.session);
        if (!hasSession) return;
        supabaseClient.auth.signOut().finally(function () {
          window.location.href = redirectTo + "?reason=idle";
        });
      });
    }
    function runIdleLogoutIfNeeded() {
      // No cerrar sesión en segundo plano: en móvil el intervalo sigue corriendo y el tiempo en otra app
      // no debería consumir el temporizador de inactividad; además evita condiciones de carrera al volver.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      var elapsed = nowMs() - getLastActivity();
      if (elapsed < timeoutMs) return;
      signOutIdle();
    }

    ["click", "keydown", "mousemove", "scroll", "touchstart", "focus"].forEach(function (evName) {
      window.addEventListener(evName, setLastActivity, { passive: true });
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      var elapsed = nowMs() - getLastActivity();
      if (elapsed < timeoutMs) {
        setLastActivity();
        // Tras estar en segundo plano Supabase pausa el auto-refresh del JWT; un refresh explícito reduce sesiones “perdidas” al volver.
        setTimeout(function () {
          supabaseClient.auth.refreshSession().catch(function () {});
        }, 300);
        return;
      }
      signOutIdle();
    });

    setLastActivity();
    setInterval(runIdleLogoutIfNeeded, 60 * 1000);
  } catch (_e) {
    // No bloquear la app si falla el control de inactividad.
  }
};

// Preferencia «mantener sesión en este dispositivo»: localStorage (persistente) vs sessionStorage (se pierde al cerrar pestaña/app).
// Valor en localStorage: "0" = no mantener; ausente u otro = mantener (por defecto).
window.PREVY_SESSION_PERSIST_KEY = "prevy:session-persist";

window.isPrevySessionPersistent = function () {
  try {
    return window.localStorage.getItem(window.PREVY_SESSION_PERSIST_KEY) !== "0";
  } catch (_e) {
    return true;
  }
};

window.setPrevySessionPersistPreference = function (keepOpenOnDevice) {
  try {
    if (keepOpenOnDevice) window.localStorage.removeItem(window.PREVY_SESSION_PERSIST_KEY);
    else window.localStorage.setItem(window.PREVY_SESSION_PERSIST_KEY, "0");
  } catch (_e) {}
};

window.prevySupabaseAuthStorageKeys = function (supabaseUrl) {
  try {
    var a = document.createElement("a");
    a.href = supabaseUrl || window.SUPABASE_URL || "";
    var host = a.hostname || "";
    var ref = host.split(".")[0] || "";
    if (!ref) return null;
    var base = "sb-" + ref + "-auth-token";
    return { main: base, user: base + "-user", verifier: base + "-code-verifier" };
  } catch (_e) {
    return null;
  }
};

window.clearPrevySupabaseAuthInStorage = function (storage, supabaseUrl) {
  var keys = window.prevySupabaseAuthStorageKeys(supabaseUrl);
  if (!keys || !storage) return;
  try {
    storage.removeItem(keys.main);
    storage.removeItem(keys.user);
    storage.removeItem(keys.verifier);
  } catch (_e) {}
};

/** Antes de login/registro/OAuth: guarda la preferencia y borra tokens del otro almacenamiento para no mezclar sesiones. */
window.applyPrevySessionPersistenceChoice = function (keepOpenOnDevice, supabaseUrl) {
  var url = supabaseUrl || window.SUPABASE_URL;
  window.setPrevySessionPersistPreference(!!keepOpenOnDevice);
  if (keepOpenOnDevice) window.clearPrevySupabaseAuthInStorage(window.sessionStorage, url);
  else window.clearPrevySupabaseAuthInStorage(window.localStorage, url);
};

window.createPrevySupabaseClient = function (optionalUrl, optionalKey) {
  var url = optionalUrl || window.SUPABASE_URL;
  var key = optionalKey || window.SUPABASE_ANON_KEY;
  if (!url || !key || !window.supabase || !window.supabase.createClient) return null;
  var storage = window.isPrevySessionPersistent() ? window.localStorage : window.sessionStorage;
  return window.supabase.createClient(url, key, {
    auth: {
      storage: storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
};