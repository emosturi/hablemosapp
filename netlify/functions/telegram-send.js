/**
 * Envío unificado de Telegram al asesor dueño.
 * - Resuelve chat por user_id + telefono metadata + TELEGRAM_CHAT_BY_PHONE_JSON
 * - Bloquea chats de grupo/canal (solo chat_id numérico positivo)
 */
const { resolveAdvisorTelegramChatId } = require("./telegram-advisor-route");

async function postTelegramMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = await res.json().catch(function () {
    return {};
  });
  return { ok: !!data.ok, data };
}

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @param {string} params.ownerUserId
 * @param {string} params.text
 * @param {string} params.telegramToken
 * @param {Record<string,string>} params.chatByPhone
 * @param {Map<string,string>} params.userPhoneCache
 * @param {string} params.logPrefix
 * @param {string} [params.dbTelegramChatId] - telegram_chat_id desde asesor_cuentas (opcional).
 * @returns {Promise<{ok:boolean, chatId?:string, reason?:string, error?:string}>}
 */
async function sendTelegramToAdvisor(params) {
  const supabase = params.supabase;
  const ownerUserId = params.ownerUserId ? String(params.ownerUserId) : "";
  const text = String(params.text || "");
  const telegramToken = String(params.telegramToken || "");
  const chatByPhone = params.chatByPhone || {};
  const userPhoneCache = params.userPhoneCache || new Map();
  const logPrefix = params.logPrefix || "[telegram-send]";
  const dbTelegramChatId = params.dbTelegramChatId;

  if (!ownerUserId) {
    return { ok: false, reason: "missing_owner_user_id" };
  }
  if (!telegramToken) {
    return { ok: false, reason: "missing_telegram_token" };
  }
  if (!text.trim()) {
    return { ok: false, reason: "missing_text" };
  }

  const chatId = await resolveAdvisorTelegramChatId(
    supabase,
    ownerUserId,
    chatByPhone,
    userPhoneCache,
    logPrefix,
    dbTelegramChatId
  );
  if (!chatId) {
    return { ok: false, reason: "no_telegram_route" };
  }

  const sent = await postTelegramMessage(telegramToken, chatId, text);
  if (!sent.ok) {
    return {
      ok: false,
      chatId,
      reason: "telegram_api_error",
      error: (sent.data && sent.data.description) || "Error al enviar Telegram",
    };
  }
  return { ok: true, chatId };
}

module.exports = { sendTelegramToAdvisor };
