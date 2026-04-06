const { requireAdvisorSession } = require("./advisor-session-auth");

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

function normalizeCode(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return s.slice(0, 16);
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const auth = await requireAdvisorSession(event);
  if (auth.error) return json(auth.statusCode, { error: auth.error });
  const supabase = auth.supabase;
  const user = auth.user;

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return json(400, { error: "Body inválido" });
  }

  let code = normalizeCode(body.code || body.ref || "");
  const meta = (user && user.user_metadata) || {};
  if (!code && meta.referral_code_used) code = normalizeCode(meta.referral_code_used);

  if (!code || code.length < 4) {
    return json(200, { ok: false, reason: "no_code" });
  }

  const { data: existing } = await supabase.from("referral_attributions").select("referrer_user_id").eq("referred_user_id", user.id).maybeSingle();
  if (existing && existing.referrer_user_id) {
    return json(200, { ok: true, already: true });
  }

  const { data: linkRow, error: linkErr } = await supabase
    .from("asesor_referral_links")
    .select("user_id")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();
  if (linkErr) return json(500, { error: linkErr.message || "Error buscando código" });

  let referrerId = linkRow && linkRow.user_id ? linkRow.user_id : null;
  if (!referrerId) {
    const { data: refAccount, error: refErr } = await supabase.from("asesor_cuentas").select("user_id").eq("referral_code", code).maybeSingle();
    if (refErr) return json(500, { error: refErr.message || "Error buscando código" });
    if (!refAccount || !refAccount.user_id) return json(400, { error: "Código de referido inválido" });
    referrerId = refAccount.user_id;
  }

  if (referrerId === user.id) return json(400, { error: "No puedes usar tu propio código de referido" });

  const ins = await supabase.from("referral_attributions").insert({
    referred_user_id: user.id,
    referrer_user_id: referrerId,
    referral_code: code,
  });
  if (ins.error) {
    if (String(ins.error.message || "").toLowerCase().indexOf("duplicate") !== -1) {
      return json(200, { ok: true, already: true });
    }
    return json(500, { error: ins.error.message || "No se pudo registrar el referido" });
  }

  const nextMeta = Object.assign({}, meta);
  delete nextMeta.referral_code_used;
  await supabase.auth.admin.updateUserById(user.id, { user_metadata: nextMeta });

  return json(200, { ok: true });
};
