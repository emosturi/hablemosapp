/**
 * Configuración de Supabase. Rellena con los datos de tu proyecto en supabase.com
 * Puedes copiar desde supabase-config.example.js
 */
window.SUPABASE_URL = "https://ndxelneraoabehyrplrv.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_G3-iWOKWSEq84ndlF3kViw_msMmwBT9";

// Notificación WhatsApp al registrar cliente (Netlify Function + Twilio)
window.NOTIFY_FUNCTION_URL = "https://hablemosapp.netlify.app/.netlify/functions/notify-telegram";
window.NOTIFY_SECRET = "romi1960";
// Recordatorios por WhatsApp al cliente
window.REMINDER_FUNCTION_URL = "https://hablemosapp.netlify.app/.netlify/functions/send-reminder";

window.ASESOR_REGISTRO_HABILITADO = true; // false = cerrado
window.ASESOR_REGISTRO_CODIGO = "TU-CODIGO-SEGURO"; // opcional
window.ASESOR_REGISTRO_DOMINIOS = ["tuempresa.cl", "asesores.tuempresa.cl"]; // opcional