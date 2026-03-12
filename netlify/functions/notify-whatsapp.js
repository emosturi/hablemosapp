/**
 * Netlify Function: envía notificación por WhatsApp al asesor cuando se registra un cliente.
 * Requiere: Twilio cuenta con WhatsApp Sandbox (o número aprobado), y variables de entorno.
 */
const twilio = require("twilio");

exports.handler = async function (event) {
  console.log("[notify-whatsapp] Invocada, method:", event.httpMethod);

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const secret = process.env.NOTIFY_SECRET;
  if (secret && event.body) {
    try {
      const body = JSON.parse(event.body);
      if (body.secret !== secret) {
        console.log("[notify-whatsapp] Secret incorrecto o faltante en body");
        return { statusCode: 401, body: "Unauthorized" };
      }
      console.log("[notify-whatsapp] Secret OK");
    } catch (_) {
      console.log("[notify-whatsapp] Body JSON inválido");
      return { statusCode: 400, body: "Bad Request" };
    }
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // ej: whatsapp:+14155238886 (sandbox)
  const to = process.env.NOTIFY_WHATSAPP_TO;     // ej: 56912345678

  if (!accountSid || !authToken || !from || !to) {
    const missing = []; if (!accountSid) missing.push("TWILIO_ACCOUNT_SID"); if (!authToken) missing.push("TWILIO_AUTH_TOKEN"); if (!from) missing.push("TWILIO_WHATSAPP_FROM"); if (!to) missing.push("NOTIFY_WHATSAPP_TO");
    console.log("[notify-whatsapp] Faltan variables de entorno:", missing.join(", "));
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Configura TWILIO_* y NOTIFY_WHATSAPP_TO en Netlify" }),
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

  const toNumber = to.replace(/\D/g, "").replace(/^0/, "");
  const toWhatsApp = toNumber.startsWith("56") ? `whatsapp:+${toNumber}` : `whatsapp:+56${toNumber}`;

  try {
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      body: msg,
      from: from,
      to: toWhatsApp,
    });
    console.log("[notify-whatsapp] WhatsApp enviado a", toWhatsApp);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[notify-whatsapp] Twilio error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Error al enviar WhatsApp" }),
    };
  }
};
