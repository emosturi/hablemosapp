const { requirePlatformOwner } = require("./platform-owner-auth");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, body) {
  return { statusCode, headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders), body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const auth = await requirePlatformOwner(event);
  if (auth.error) return json(auth.statusCode, { error: auth.error });
  const supabase = auth.supabase;

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return json(400, { error: "Body inválido" });
  }

  const userId = String(body.user_id || "").trim();
  if (!userId) return json(400, { error: "Falta user_id" });

  const allowedPlans = { mensual: true, anual: true };
  const allowedStatus = { trial: true, active: true, past_due: true, canceled: true, none: true };
  const plan = body.subscription_plan == null || body.subscription_plan === "" ? null : String(body.subscription_plan);
  const status = body.subscription_status == null || body.subscription_status === "" ? null : String(body.subscription_status);
  if (plan && !allowedPlans[plan]) return json(400, { error: "subscription_plan inválido" });
  if (status && !allowedStatus[status]) return json(400, { error: "subscription_status inválido" });

  const payload = {
    user_id: userId,
    account_enabled: body.account_enabled !== false,
    subscription_plan: plan,
    subscription_status: status,
    current_period_end: body.current_period_end || null,
    updated_at: new Date().toISOString(),
  };

  const r = await supabase.from("asesor_cuentas").upsert(payload, { onConflict: "user_id" });
  if (r.error) return json(500, { error: r.error.message || "No se pudo actualizar la cuenta" });

  return json(200, { ok: true });
};
