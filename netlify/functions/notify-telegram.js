/**
 * Netlify Function: envía notificación por Telegram cuando se registra un cliente.
 * Variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, NOTIFY_SECRET.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function withCors(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign({}, corsHeaders, extraHeaders || {}),
    body: body == null ? "" : body,
  };
}

exports.handler = async function (event) {
  console.log("[notify-telegram] Invocada, method:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return withCors(204, "");
  }

  if (event.httpMethod !== "POST") {
    return withCors(405, "Method Not Allowed");
  }

  const secret = process.env.NOTIFY_SECRET;
  if (secret && event.body) {
    try {
      const body = JSON.parse(event.body);
      if (body.secret !== secret) {
        console.log("[notify-telegram] Secret incorrecto o faltante en body");
        return withCors(401, "Unauthorized");
      }
    } catch (_) {
      return withCors(400, "Bad Request");
    }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Diagnóstico: ver si Netlify está pasando las variables (sin revelar valores)
  console.log("[notify-telegram] TELEGRAM_BOT_TOKEN presente:", !!token, "| TELEGRAM_CHAT_ID presente:", !!chatId);

  if (!token || !chatId) {
    console.log("[notify-telegram] Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID");
    return withCors(
      500,
      JSON.stringify({ error: "Configura TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Netlify" }),
      { "Content-Type": "application/json" }
    );
  }

  let clientData = {};
  try {
    const parsed = JSON.parse(event.body || "{}");
    clientData = parsed.client || parsed;
  } catch (_) {
    return withCors(400, "Bad Request");
  }

  const nombre = [clientData.nombres, clientData.apellido_paterno, clientData.apellido_materno]
    .filter(Boolean)
    .join(" ");
  const msg =
    "Nuevo cliente registrado:\n" +
    "RUT: " + (clientData.rut || "") + "\n" +
    "Nombre: " + (nombre || "-") + "\n" +
    "Teléfono: " + (clientData.telefono || "-") + "\n" +
    "Revisar en la app y usar para mandato/contrato cuando esté correcto.";

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      console.error("[notify-telegram] Telegram error:", data.description);
      return withCors(
        500,
        JSON.stringify({ error: data.description || "Error al enviar Telegram" }),
        { "Content-Type": "application/json" }
      );
    }
    console.log("[notify-telegram] Mensaje enviado a chat", chatId);
    return withCors(200, JSON.stringify({ ok: true }), { "Content-Type": "application/json" });
  } catch (err) {
    console.error("[notify-telegram]", err);
    return withCors(
      500,
      JSON.stringify({ error: err.message || "Error al enviar Telegram" }),
      { "Content-Type": "application/json" }
    );
  }
};
