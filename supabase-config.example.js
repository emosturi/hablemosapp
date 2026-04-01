/**
 * Configuración de Supabase.
 * Copia este archivo como supabase-config.js y rellena con los datos de tu proyecto.
 * En Netlify puedes usar variables de entorno y generar este archivo en el build.
 */
window.SUPABASE_URL = "https://TU_PROYECTO.supabase.co";
window.SUPABASE_ANON_KEY = "tu-anon-key-aqui";

// Opcional: correo de soporte (enlace mailto en la página «Mi suscripción» del menú de usuario).
// window.HABLEMOS_SUPPORT_EMAIL = "soporte@tudominio.cl";

// Opcional: notificación Telegram al registrar cliente (Netlify Function).
// Recomendado: misma URL que el sitio (evita CORS si usas dominio custom en plataforma.*).
// window.NOTIFY_FUNCTION_URL = window.location.origin + "/.netlify/functions/notify-telegram";
// window.NOTIFY_SECRET = "misma-clave-que-NOTIFY_SECRET-en-variables-de-entorno-Netlify";
// window.REMINDER_FUNCTION_URL = window.location.origin + "/.netlify/functions/send-reminder";
