const { requirePlatformOwner } = require("./platform-owner-auth");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(statusCode, body) {
  return { statusCode, headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders), body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Method Not Allowed" });

  const auth = await requirePlatformOwner(event);
  if (auth.error) return json(auth.statusCode, { error: auth.error });
  const supabase = auth.supabase;

  let allUsers = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const r = await supabase.auth.admin.listUsers({ page, perPage });
    if (r.error) return json(500, { error: r.error.message || "No se pudieron listar usuarios" });
    const users = (r.data && r.data.users) || [];
    allUsers = allUsers.concat(users);
    if (users.length < perPage) break;
    page += 1;
    if (page > 20) break;
  }

  const ids = allUsers.map(function (u) { return u.id; });
  let cuentasById = {};
  if (ids.length) {
    const c = await supabase.from("asesor_cuentas").select("user_id, account_enabled, subscription_plan, subscription_status, current_period_end");
    if (!c.error && Array.isArray(c.data)) {
      c.data.forEach(function (x) { cuentasById[x.user_id] = x; });
    }
  }

  const data = allUsers.map(function (u) {
    const m = u.user_metadata || {};
    const c = cuentasById[u.id] || {};
    return {
      user_id: u.id,
      email: u.email || "",
      telefono: m.telefono || m.phone || "",
      created_at: u.created_at || null,
      last_sign_in_at: u.last_sign_in_at || null,
      account_enabled: c.account_enabled !== false,
      subscription_plan: c.subscription_plan || null,
      subscription_status: c.subscription_status || "none",
      current_period_end: c.current_period_end || null,
    };
  });

  data.sort(function (a, b) { return String(a.email).localeCompare(String(b.email)); });
  return json(200, { ok: true, advisors: data });
};
