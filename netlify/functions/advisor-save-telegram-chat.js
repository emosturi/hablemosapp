const { requireAdvisorSession } = require("./advisor-session-auth");
const { normalizarTelefonoE164, normalizarChatIdUsuario } = require("./telegram-advisor-route");

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
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const auth = await requireAdvisorSession(event);
  if (auth.error) return json(auth.statusCode, { error: auth.error });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return json(400, { error: "JSON inválido" });
  }

  const cid = normalizarChatIdUsuario(body.chat_id);
  if (!cid) {
    return json(400, {
      error:
        "Chat ID inválido. Debe ser solo números (el que te muestra el bot, sin espacios ni texto extra).",
    });
  }

  const meta = (auth.user && auth.user.user_metadata) || {};
  const phone = normalizarTelefonoE164(meta.telefono || meta.phone || "");
  if (!phone) {
    return json(400, {
      error:
        "Falta tu teléfono en el perfil de la cuenta. Actualizalo en «Mis datos (mandatario)» para que coincida con el número que usás en Telegram.",
    });
  }

  const supabase = auth.supabase;
  const userId = auth.user.id;
  const now = new Date().toISOString();

  const { data: existing, error: selErr } = await supabase
    .from("asesor_cuentas")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) return json(500, { error: selErr.message || "Error leyendo cuenta" });

  if (existing) {
    const upd = await supabase
      .from("asesor_cuentas")
      .update({
        telegram_chat_id: cid,
        telegram_chat_id_updated_at: now,
        updated_at: now,
      })
      .eq("user_id", userId);
    if (upd.error) return json(500, { error: upd.error.message || "No se pudo guardar" });
  } else {
    const trialEnd = new Date();
    trialEnd.setUTCDate(trialEnd.getUTCDate() + 7);
    const ins = await supabase.from("asesor_cuentas").insert({
      user_id: userId,
      account_enabled: true,
      telegram_reminders_enabled: true,
      subscription_status: "trial",
      subscription_plan: null,
      current_period_end: trialEnd.toISOString(),
      subscription_grace_until: null,
      subscription_bypass: false,
      telegram_chat_id: cid,
      telegram_chat_id_updated_at: now,
      updated_at: now,
    });
    if (ins.error) return json(500, { error: ins.error.message || "No se pudo crear la cuenta" });
  }

  return json(200, { ok: true, telegram_chat_id: cid, telefono_normalizado: phone });
};
