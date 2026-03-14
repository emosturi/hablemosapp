/**
 * Netlify Function: envía notificación por Telegram cuando se registra un cliente.
 * Variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, NOTIFY_SECRET.
 */
exports.handler = async function (event) {
  console.log("[notify-telegram] Invocada, method:", event.httpMethod);

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const secret = process.env.NOTIFY_SECRET;
  if (secret && event.body) {
    try {
      const body = JSON.parse(event.body);
      if (body.secret !== secret) {
        console.log("[notify-telegram] Secret incorrecto o faltante en body");
        return { statusCode: 401, body: "Unauthorized" };
      }
    } catch (_) {
      return { statusCode: 400, body: "Bad Request" };
    }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Diagnóstico: ver si Netlify está pasando las variables (sin revelar valores)
  console.log("[notify-telegram] TELEGRAM_BOT_TOKEN presente:", !!token, "| TELEGRAM_CHAT_ID presente:", !!chatId);

  if (!token || !chatId) {
    console.log("[notify-telegram] Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Configura TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Netlify" }),
    };
  }

  let clientData = {};
  try {
    const parsed = JSON.parse(event.body || "{}");
    clientData = parsed.client || parsed;
  } catch (_) {
    return { statusCode: 400, body: "Bad Request" };
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
      return {
        statusCode: 500,
        body: JSON.stringify({ error: data.description || "Error al enviar Telegram" }),
      };
    }
    console.log("[notify-telegram] Mensaje enviado a chat", chatId);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[notify-telegram]", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Error al enviar Telegram" }),
    };
  }
};
