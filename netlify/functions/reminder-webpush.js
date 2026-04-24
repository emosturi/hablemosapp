/**
 * Envía una notificación Web Push a todas las suscripciones de un usuario (recordatorios PWA).
 * Requiere variables VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y opcional VAPID_SUBJECT (mailto: o https).
 */
const webpush = require("web-push");

let vapidReady = false;

function ensureVapid() {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const prv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:soporte@prevy.cl";
  if (!pub || !prv) return false;
  webpush.setVapidDetails(subject, pub, prv);
  vapidReady = true;
  return true;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase - service role
 * @param {string} userId
 * @param {{ title: string, body: string, url?: string }} payload
 */
async function sendReminderPushToUser(supabase, userId, payload) {
  if (!ensureVapid()) {
    console.warn("[reminder-webpush] Faltan VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY en Netlify; no se puede enviar push.");
    return { ok: false, reason: "no_vapid", sent: 0 };
  }
  const title = payload.title || "Prevy";
  const body = payload.body || "";
  const url = payload.url || "/agenda.html#calendario";
  const tag = payload.tag || "prevy-reminder";
  const data = JSON.stringify({ title, body, url, tag });

  const { data: rows, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    console.error("[reminder-webpush] select:", error.message);
    return { ok: false, reason: "db", sent: 0 };
  }
  if (!rows || rows.length === 0) {
    return { ok: true, sent: 0 };
  }

  let sent = 0;
  for (const row of rows) {
    const sub = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    try {
      await webpush.sendNotification(sub, data, { TTL: 86400 });
      sent += 1;
    } catch (err) {
      const code = err && err.statusCode;
      if (code === 404 || code === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", row.id);
        console.warn("[reminder-webpush] Suscripción inválida, eliminada:", row.id);
      } else {
        console.warn("[reminder-webpush] Fallo envío:", err.message || err);
      }
    }
  }
  return { ok: true, sent };
}

module.exports = { sendReminderPushToUser };
