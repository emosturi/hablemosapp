const { createClient } = require("@supabase/supabase-js");

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" };
  return { supabase: createClient(url, key) };
}

function parseBearer(event) {
  const h = (event && event.headers) || {};
  const auth = h.authorization || h.Authorization || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

/** Valida JWT de Supabase (cualquier usuario autenticado). Usa service role para getUser. */
async function requireAdvisorSession(event) {
  const svc = getServiceClient();
  if (svc.error) return { statusCode: 500, error: svc.error };
  const jwt = parseBearer(event);
  if (!jwt) return { statusCode: 401, error: "Falta token Bearer" };
  const userRes = await svc.supabase.auth.getUser(jwt);
  const user = userRes && userRes.data ? userRes.data.user : null;
  if (userRes.error || !user) return { statusCode: 401, error: "Token inválido o expirado" };
  return { statusCode: 200, supabase: svc.supabase, user };
}

module.exports = { requireAdvisorSession, parseBearer, getServiceClient };
