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

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await requireAdvisorSession(event);
  if (auth.error) return json(auth.statusCode, { error: auth.error });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_e) {
    return json(400, { error: "JSON inválido" });
  }

  const sub = body.subscription;
  if (!sub || typeof sub.endpoint !== "string" || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return json(400, { error: "subscription inválida" });
  }

  const row = {
    user_id: auth.user.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.supabase.from("push_subscriptions").upsert(row, {
    onConflict: "endpoint",
  });

  if (error) {
    console.error("[save-push-subscription]", error);
    return json(500, { error: error.message || "No se pudo guardar la suscripción" });
  }

  return json(200, { ok: true });
};
