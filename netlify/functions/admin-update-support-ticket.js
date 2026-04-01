const { requirePlatformOwner } = require("./platform-owner-auth");

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

  const auth = await requirePlatformOwner(event);
  if (auth.error) return json(auth.statusCode, { error: auth.error });
  const supabase = auth.supabase;

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return json(400, { error: "Body inválido" });
  }

  const id = String(body.id || "").trim();
  const status = String(body.status || "").trim();
  const ownerNote = body.owner_note == null ? null : String(body.owner_note).trim();
  if (!id) return json(400, { error: "Falta id" });
  if (!status || !{ open: true, in_progress: true, closed: true }[status]) {
    return json(400, { error: "status inválido" });
  }

  const now = new Date().toISOString();
  const patch = {
    status,
    owner_note: ownerNote || null,
    updated_at: now,
    closed_at: status === "closed" ? now : null,
  };

  const r = await supabase.from("soporte_tickets").update(patch).eq("id", id);
  if (r.error) return json(500, { error: r.error.message || "No se pudo actualizar el ticket" });
  return json(200, { ok: true });
};
