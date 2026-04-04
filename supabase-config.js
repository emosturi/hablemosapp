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

// Cierre automático por inactividad (1 hora sin uso con la app visible).
// Puedes subir el valor (p. ej. 2h) si lo necesitas; en Supabase → Auth → JWT también puedes revisar caducidad del access token.
window.SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
window.installInactivityAutoLogout = function (supabaseClient, options) {
  try {
    if (!supabaseClient || !supabaseClient.auth || !window || !window.document) return;
    if (window.__inactivityLogoutInstalled) return;
    window.__inactivityLogoutInstalled = true;

    var timeoutMs = (options && options.timeoutMs) || window.SESSION_IDLE_TIMEOUT_MS || (60 * 60 * 1000);
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