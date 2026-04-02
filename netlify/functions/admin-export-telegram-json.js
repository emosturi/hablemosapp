const { requirePlatformOwner } = require("./platform-owner-auth");
const {
  normalizarTelefonoE164,
  normalizarChatIdUsuario,
  loadTelegramChatByPhoneMap,
} = require("./telegram-advisor-route");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
  if (event.httpMethod !== "GET") return json(405, { error: "Method Not Allowed" });

  const auth = await requirePlatformOwner(event);
  if (auth.error) return json(auth.statusCode, { error: auth.error });

  const supabase = auth.supabase;

  /** Mapa ya desplegado en Netlify (asesores históricos). */
  const fromEnv = loadTelegramChatByPhoneMap();

  const { data: rows, error } = await supabase
    .from("asesor_cuentas")
    .select("user_id, telegram_chat_id")
    .not("telegram_chat_id", "is", null);

  if (error) return json(500, { error: error.message || "Error leyendo cuentas" });

  const fromDb = {};
  const skipped = [];

  for (const row of rows || []) {
    const chatId = normalizarChatIdUsuario(row.telegram_chat_id);
    if (!chatId) continue;

    const uid = row.user_id ? String(row.user_id) : "";
    if (!uid) continue;

    let userRes;
    try {
      userRes = await supabase.auth.admin.getUserById(uid);
    } catch (e) {
      skipped.push({ user_id: uid, reason: "get_user_error" });
      continue;
    }
    if (userRes.error || !userRes.data || !userRes.data.user) {
      skipped.push({ user_id: uid, reason: "usuario_no_encontrado" });
      continue;
    }

    const meta = userRes.data.user.user_metadata || {};
    const phone = normalizarTelefonoE164(meta.telefono || meta.phone || "");
    if (!phone) {
      skipped.push({ user_id: uid, reason: "sin_telefono_en_perfil" });
      continue;
    }

    fromDb[phone] = chatId;
  }

  /** Env primero; la app (Configuración Telegram) añade o sobrescribe por mismo teléfono. */
  const merged = Object.assign({}, fromEnv, fromDb);
  const pretty = JSON.stringify(merged, null, 2);

  return json(200, {
    ok: true,
    map: merged,
    pretty,
    count: Object.keys(merged).length,
    from_env_count: Object.keys(fromEnv).length,
    from_db_count: Object.keys(fromDb).length,
    skipped,
  });
};
