const { createClient } = require("@supabase/supabase-js");

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" };
  return { supabase: createClient(url, key) };
}

function parseBearer(event) {
  const h = event && event.headers ? event.headers : {};
  const auth = h.authorization || h.Authorization || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function requirePlatformOwner(event) {
  const svc = getServiceClient();
  if (svc.error) return { statusCode: 500, error: svc.error };
  const supabase = svc.supabase;

  const jwt = parseBearer(event);
  if (!jwt) return { statusCode: 401, error: "Falta token Bearer" };

  const userRes = await supabase.auth.getUser(jwt);
  const user = userRes && userRes.data ? userRes.data.user : null;
  if (userRes.error || !user) return { statusCode: 401, error: "Token inválido o expirado" };

  const ownRes = await supabase.from("platform_owners").select("user_id").eq("user_id", user.id).maybeSingle();
  if (ownRes.error) return { statusCode: 500, error: ownRes.error.message || "Error validando owner" };
  if (!ownRes.data) return { statusCode: 403, error: "Acceso solo para cuenta propietaria" };

  return { statusCode: 200, supabase, ownerUser: user };
}

module.exports = { requirePlatformOwner };
