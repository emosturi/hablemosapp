/**
 * Tras insertar un mensaje de chat de soporte, envía Web Push al asesor o a todos los platform_owners.
 * POST { "message_id": "<uuid>" } con Authorization: Bearer <jwt del remitente>.
 */
const { requireAdvisorSession } = require("./advisor-session-auth");
const { sendReminderPushToUser } = require("./reminder-webpush");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders),
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await requireAdvisorSession(event);
  if (auth.error) return json(auth.statusCode, { error: auth.error });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_e) {
    return json(400, { error: "JSON inválido" });
  }

  const messageId = body.message_id ? String(body.message_id).trim() : "";
  if (!messageId) return json(400, { error: "Falta message_id" });

  const supabase = auth.supabase;
  const me = auth.user.id;

  const msgRes = await supabase
    .from("support_chat_messages")
    .select("id, sender_user_id, body, thread_id")
    .eq("id", messageId)
    .maybeSingle();

  if (msgRes.error) return json(500, { error: msgRes.error.message || "Error leyendo mensaje" });
  const msg = msgRes.data;
  if (!msg) return json(404, { error: "Mensaje no encontrado" });
  if (msg.sender_user_id !== me) return json(403, { error: "No autorizado" });

  const thRes = await supabase
    .from("support_chat_threads")
    .select("id, advisor_user_id, advisor_email")
    .eq("id", msg.thread_id)
    .maybeSingle();

  if (thRes.error) return json(500, { error: thRes.error.message || "Error leyendo hilo" });
  const thread = thRes.data;
  if (!thread) return json(404, { error: "Hilo no encontrado" });

  const ownRes = await supabase.from("platform_owners").select("user_id").eq("user_id", me).maybeSingle();
  const iAmOwner = !!(ownRes && !ownRes.error && ownRes.data && ownRes.data.user_id);
  const iAmAdvisor = thread.advisor_user_id === me;

  if (!iAmOwner && !iAmAdvisor) return json(403, { error: "No participas en este hilo" });

  const senderIsOwner = iAmOwner;

  const preview = String(msg.body || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const url = "/dashboard.html#prevy-support-chat";
  const tag = "prevy-chat-" + String(thread.id);

  let sent = 0;

  if (senderIsOwner) {
    const title = "Mensaje del equipo Prevy";
    const bodyText =
      preview || "Tienes una nueva respuesta en el chat de soporte.";
    const r = await sendReminderPushToUser(supabase, thread.advisor_user_id, {
      title,
      body: bodyText,
      url,
      tag,
    });
    sent = r.sent || 0;
  } else {
    const ownersRes = await supabase.from("platform_owners").select("user_id");
    if (ownersRes.error) return json(500, { error: ownersRes.error.message || "Error listando owners" });
    const title = "Chat soporte — " + (thread.advisor_email || "Asesor");
    const bodyText = preview || "Nuevo mensaje en el chat de soporte.";
    for (const row of ownersRes.data || []) {
      const uid = row && row.user_id;
      if (!uid) continue;
      const r = await sendReminderPushToUser(supabase, uid, { title, body: bodyText, url, tag });
      sent += r.sent || 0;
    }
  }

  return json(200, { ok: true, sent });
};
