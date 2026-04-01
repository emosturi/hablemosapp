const { requirePlatformOwner } = require("./platform-owner-auth");

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

  const r = await supabase
    .from("soporte_tickets")
    .select("id, user_id, advisor_email, subject, message, status, owner_note, created_at, updated_at, closed_at")
    .order("created_at", { ascending: false })
    .limit(300);

  if (r.error) return json(500, { error: r.error.message || "No se pudieron cargar los tickets" });
  return json(200, { ok: true, tickets: r.data || [] });
};
