/**
 * Netlify Function: notificación Telegram al registrar un cliente.
 * Envía solo al chat del asesor dueño (TELEGRAM_CHAT_BY_PHONE_JSON + user_metadata.telefono).
 * Variables: TELEGRAM_BOT_TOKEN, NOTIFY_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   TELEGRAM_CHAT_BY_PHONE_JSON (recomendado). No usa TELEGRAM_CHAT_ID como fallback.
 */
const { createClient } = require("@supabase/supabase-js");
const { loadTelegramChatByPhoneMap, resolveAdvisorTelegramChatId } = require("./telegram-advisor-route");

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

  let parsedBody = {};
  try {
    parsedBody = JSON.parse(event.body || "{}");
  } catch (_) {
    return withCors(400, "Bad Request");
  }

  const secret = process.env.NOTIFY_SECRET;
  if (secret && parsedBody.secret !== secret) {
    console.log("[notify-telegram] Secret incorrecto o faltante");
    return withCors(401, "Unauthorized");
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!token) {
    return withCors(
      500,
      JSON.stringify({ error: "Falta TELEGRAM_BOT_TOKEN" }),
      { "Content-Type": "application/json" }
    );
  }

  if (!supabaseUrl || !supabaseKey) {
    return withCors(
      500,
      JSON.stringify({ error: "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" }),
      { "Content-Type": "application/json" }
    );
  }

  const clientData = parsedBody.client || {};
  let ownerUserId = (parsedBody.owner_user_id || clientData.user_id || "").toString().trim();

  if (!ownerUserId && parsedBody.invite_token) {
    const invite = String(parsedBody.invite_token || "").trim();
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRe.test(invite)) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: inv, error: invErr } = await supabase
        .from("registro_afiliados_invites")
        .select("owner_user_id")
        .eq("id", invite)
        .maybeSingle();
      if (invErr) {
        console.error("[notify-telegram] invite lookup:", invErr.message);
      } else if (inv && inv.owner_user_id) {
        ownerUserId = String(inv.owner_user_id);
      }
    }
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const chatByPhone = loadTelegramChatByPhoneMap();
  const userPhoneCache = new Map();

  let chatIdObjetivo = "";
  if (ownerUserId) {
    chatIdObjetivo = await resolveAdvisorTelegramChatId(
      supabase,
      ownerUserId,
      chatByPhone,
      userPhoneCache,
      "[notify-telegram]"
    );
  }

  if (!chatIdObjetivo) {
    console.warn(
      "[notify-telegram] Sin destino Telegram (owner:",
      ownerUserId || "n/a",
      "). Configure TELEGRAM_CHAT_BY_PHONE_JSON y telefono en metadata del asesor."
    );
    return withCors(
      200,
      JSON.stringify({
        ok: false,
        delivered: false,
        reason: "no_telegram_route",
        hint: "TELEGRAM_CHAT_BY_PHONE_JSON y user_metadata.telefono del asesor",
      }),
      { "Content-Type": "application/json" }
    );
  }
  console.log("[notify-telegram] Destino asesor chat_id:", chatIdObjetivo, "owner:", ownerUserId || "n/a");

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
      body: JSON.stringify({ chat_id: chatIdObjetivo, text: msg }),
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
    console.log("[notify-telegram] Enviado a chat", chatIdObjetivo);
    return withCors(200, JSON.stringify({ ok: true, delivered: true }), { "Content-Type": "application/json" });
  } catch (err) {
    console.error("[notify-telegram]", err);
    return withCors(
      500,
      JSON.stringify({ error: err.message || "Error al enviar Telegram" }),
      { "Content-Type": "application/json" }
    );
  }
};
