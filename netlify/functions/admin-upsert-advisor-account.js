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
    telegram_reminders_enabled: body.telegram_reminders_enabled !== false,
    subscription_plan: plan,
    subscription_status: status,
    current_period_end: body.current_period_end || null,
    updated_at: new Date().toISOString(),
  };

  if (body.subscription_bypass === true) payload.subscription_bypass = true;
  else if (body.subscription_bypass === false) payload.subscription_bypass = false;

  if (body.annual_contract_discount_percent !== undefined && body.annual_contract_discount_percent !== null) {
    const n = Number(body.annual_contract_discount_percent);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return json(400, { error: "annual_contract_discount_percent debe ser un número entre 0 y 100" });
    }
    payload.annual_contract_discount_percent = n;
  }

  if (body.subscription_grace_until !== undefined) {
    payload.subscription_grace_until = body.subscription_grace_until || null;
  }

  const r = await supabase.from("asesor_cuentas").upsert(payload, { onConflict: "user_id" });
  if (r.error) return json(500, { error: r.error.message || "No se pudo actualizar la cuenta" });

  if (body.mandatario_edicion_sin_restriccion !== undefined && body.mandatario_edicion_sin_restriccion !== null) {
    const enabled = body.mandatario_edicion_sin_restriccion === true;
    const ex = await supabase.from("asesor_mandatario_perfil").select("user_id").eq("user_id", userId).maybeSingle();
    if (ex.error) return json(500, { error: ex.error.message || "No se pudo leer perfil mandatario" });
    if (ex.data) {
      const u = await supabase
        .from("asesor_mandatario_perfil")
        .update({ mandatario_edicion_sin_restriccion: enabled })
        .eq("user_id", userId);
      if (u.error) return json(500, { error: u.error.message || "No se pudo actualizar permiso mandatario" });
    } else {
      const ins = await supabase.from("asesor_mandatario_perfil").insert({
        user_id: userId,
        datos: {},
        mandatario_edicion_sin_restriccion: enabled,
      });
      if (ins.error) return json(500, { error: ins.error.message || "No se pudo crear perfil mandatario" });
    }
  }

  return json(200, { ok: true });
};
