/**
 * Configuración de Supabase.
 * Copia este archivo como supabase-config.js y rellena con los datos de tu proyecto.
 * En Netlify puedes usar variables de entorno y generar este archivo en el build.
 */
window.SUPABASE_URL = "https://TU_PROYECTO.supabase.co";
window.SUPABASE_ANON_KEY = "tu-anon-key-aqui";

// Opcional: correo de soporte (enlace mailto en la página «Mi suscripción» del menú de usuario).
// window.HABLEMOS_SUPPORT_EMAIL = "soporte@tudominio.cl";

// Mercado Pago (suscripción en mi-suscripcion.html): configurar en Netlify → Site settings → Environment variables:
//   MERCADOPAGO_ACCESS_TOKEN          — Access Token de la aplicación (producción o prueba).
//   MERCADOPAGO_PLAN_MENSUAL_CLP      — Precio entero en pesos chilenos (ej. 15000).
//   MERCADOPAGO_PLAN_ANUAL_CLP        — Precio entero en pesos chilenos.
//   MERCADOPAGO_PUBLIC_SITE_URL       — URL base HTTPS de la app (ej. https://plataforma.tudominio.cl). Si omitís, Netlify suele exponer URL.
//   MERCADOPAGO_WEBHOOK_BASE_URL      — Opcional: si el webhook debe registrarse con otra URL base que la de retorno al usuario.
//   MERCADOPAGO_WEBHOOK_SECRET        — Firma del webhook en «Tus integraciones» (recomendado en producción).
//   MERCADOPAGO_WEBHOOK_ALLOW_UNSIGNED_GET=1 — Solo si usás IPN GET legacy sin cabecera x-signature y tenés WEBHOOK_SECRET definido.
// En Supabase, ejecutar supabase-migration-mercadopago-asesor-cuentas.sql para la columna mercadopago_last_payment_id.

// Opcional: notificación Telegram al registrar cliente (Netlify Function).
// Recomendado: misma URL que el sitio (evita CORS si usas dominio custom en plataforma.*).
// window.NOTIFY_FUNCTION_URL = window.location.origin + "/.netlify/functions/notify-telegram";
// window.NOTIFY_SECRET = "misma-clave-que-NOTIFY_SECRET-en-variables-de-entorno-Netlify";
// window.REMINDER_FUNCTION_URL = window.location.origin + "/.netlify/functions/send-reminder";
