/**
 * Configuración de Supabase.
 * Copia este archivo como supabase-config.js y rellena con los datos de tu proyecto.
 * En Netlify puedes usar variables de entorno y generar este archivo en el build.
 */
window.SUPABASE_URL = "https://TU_PROYECTO.supabase.co";
window.SUPABASE_ANON_KEY = "tu-anon-key-aqui";

// Opcional: notificación WhatsApp al registrar cliente (Netlify Function + Twilio)
// window.NOTIFY_FUNCTION_URL = "https://tu-sitio.netlify.app/.netlify/functions/notify-whatsapp";
// window.NOTIFY_SECRET = "misma-clave-que-NOTIFY_SECRET-en-variables-de-entorno-Netlify";
// Recordatorios por WhatsApp al cliente
// window.REMINDER_FUNCTION_URL = "https://tu-sitio.netlify.app/.netlify/functions/send-reminder";
