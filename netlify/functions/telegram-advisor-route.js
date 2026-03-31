/**
 * Resuelve chat_id de Telegram por asesor: user_metadata.telefono + TELEGRAM_CHAT_BY_PHONE_JSON.
 * Usado por process-reminders y notify-telegram.
 */

function normalizarTelefonoE164(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.indexOf("56") === 0) return "+" + d;
  if (d.length >= 8 && d.length <= 15) return "+" + d;
  return "";
}

/**
 * Solo permitimos chat_id de usuario (numérico positivo).
 * Grupos/canales suelen ser negativos (ej: -100...), y se bloquean.
 */
function normalizarChatIdUsuario(chatId) {
  const raw = String(chatId || "").trim();
  if (!raw) return "";
  if (!/^\d+$/.test(raw)) return "";
  if (raw === "0") return "";
  return raw;
}

/**
 * Si hay al menos un teléfono mapeado, el envío es solo por asesor (no se usa grupo global como fallback).
 */
function isAdvisorTelegramMapConfigured(chatByPhone) {
  const o = chatByPhone || {};
  return Object.keys(o).length > 0;
}

function loadTelegramChatByPhoneMap() {
  const raw = process.env.TELEGRAM_CHAT_BY_PHONE_JSON || "";
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const out = {};
    Object.keys(parsed || {}).forEach(function (k) {
      const tel = normalizarTelefonoE164(k);
      const chatId = normalizarChatIdUsuario(parsed[k]);
      if (tel && chatId) out[tel] = chatId;
    });
    return out;
  } catch (e) {
    console.error("[telegram-advisor-route] TELEGRAM_CHAT_BY_PHONE_JSON invalido:", e.message);
    return {};
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase - service role
 * @param {string} ownerUserId - auth.users id
 * @param {Record<string,string>} chatByPhone - mapa telefono -> chat_id
 * @param {Map<string,string>} userPhoneCache - cache uid -> telefono normalizado
 * @param {string} logPrefix
 * @returns {Promise<string>} chat_id o ""
 */
async function resolveAdvisorTelegramChatId(supabase, ownerUserId, chatByPhone, userPhoneCache, logPrefix) {
  const uid = ownerUserId ? String(ownerUserId) : "";
  if (!uid) return "";

  let phoneAsesor = userPhoneCache.get(uid);
  if (phoneAsesor === undefined) {
    try {
      const userRes = await supabase.auth.admin.getUserById(uid);
      if (userRes.error) {
        console.error(logPrefix, "No se pudo leer auth user", uid, userRes.error.message);
        phoneAsesor = "";
      } else {
        const meta = (userRes.data && userRes.data.user && userRes.data.user.user_metadata) || {};
        phoneAsesor = normalizarTelefonoE164(meta.telefono || meta.phone || "");
      }
    } catch (e) {
      console.error(logPrefix, "Error leyendo user", uid, e.message);
      phoneAsesor = "";
    }
    userPhoneCache.set(uid, phoneAsesor || "");
  }

  if (phoneAsesor && chatByPhone[phoneAsesor]) return chatByPhone[phoneAsesor];
  return "";
}

module.exports = {
  normalizarTelefonoE164,
  normalizarChatIdUsuario,
  loadTelegramChatByPhoneMap,
  isAdvisorTelegramMapConfigured,
  resolveAdvisorTelegramChatId,
};
