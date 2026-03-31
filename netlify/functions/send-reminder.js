/**
 * Netlify Function: guarda un recordatorio en Supabase para enviarlo en la fecha indicada.
 * El envío lo hace process-reminders (cron): Telegram al chat del asesor (user_id + TELEGRAM_CHAT_BY_PHONE_JSON).
 * Body: { secret, fecha, hora?, mensaje, user_id?, cliente_id?, cliente_nombre?, cliente_telefono? }
 * user_id: obligatorio si no hay cliente_id en public.clientes (p. ej. recordatorio solo con nombre/teléfono desde cliente potencial).
 */
const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const secret = process.env.NOTIFY_SECRET;
  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
    if (secret && body.secret !== secret) {
      return { statusCode: 401, body: "Unauthorized" };
    }
  } catch (_) {
    return { statusCode: 400, body: "Bad Request" };
  }

  const fecha = (body.fecha || "").toString().trim();
  const mensaje = (body.mensaje || "").toString().trim();

  if (!fecha || !mensaje) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Faltan fecha o mensaje" }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Falta configuración Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)" }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let userId = (body.user_id || "").toString().trim() || null;
    if (!userId && body.cliente_id) {
      const cr = await supabase.from("clientes").select("user_id").eq("id", body.cliente_id).maybeSingle();
      userId = cr.data && cr.data.user_id ? String(cr.data.user_id) : null;
    }
    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Falta user_id o cliente_id válido para asociar el recordatorio al asesor (multi-usuario).",
        }),
      };
    }

    const { error } = await supabase.from("recordatorios").insert({
      user_id: userId,
      cliente_id: body.cliente_id || null,
      cliente_nombre: (body.cliente_nombre || "").toString().trim() || null,
      cliente_telefono: (body.cliente_telefono || "").toString().trim() || null,
      fecha: fecha,
      hora: (body.hora || "").toString().trim() || null,
      mensaje: mensaje,
    });

    if (error) {
      console.error("[send-reminder] Supabase error:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message || "Error al guardar recordatorio" }),
      };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[send-reminder]", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Error inesperado" }),
    };
  }
};
