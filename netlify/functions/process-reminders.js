/**
 * Netlify Scheduled Function: envía los recordatorios programados para hoy
 * a NOTIFY_WHATSAPP_TO por WhatsApp (Twilio).
 * Se ejecuta diariamente (config.schedule).
 */
const twilio = require("twilio");
const { createClient } = require("@supabase/supabase-js");

exports.config = {
  schedule: "0 12 * * *", // Diario a las 12:00 UTC (~9:00 Chile)
};

exports.handler = async function (event, context) {
  console.log("[process-reminders] Ejecutando…");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const to = process.env.NOTIFY_WHATSAPP_TO;

  if (!supabaseUrl || !supabaseKey || !accountSid || !authToken || !from || !to) {
    console.error("[process-reminders] Faltan variables de entorno");
    return { statusCode: 500, body: "Configuración incompleta" };
  }

  const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: pendientes, error } = await supabase
    .from("recordatorios")
    .select("id, fecha, mensaje, cliente_nombre")
    .eq("fecha", hoy)
    .eq("enviado", false);

  if (error) {
    console.error("[process-reminders] Supabase:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  if (!pendientes || pendientes.length === 0) {
    console.log("[process-reminders] Sin recordatorios para hoy");
    return { statusCode: 200, body: JSON.stringify({ enviados: 0 }) };
  }

  const toNum = to.replace(/\D/g, "").replace(/^0/, "");
  const toWhatsApp = toNum.startsWith("56") ? `whatsapp:+${toNum}` : `whatsapp:+56${toNum}`;
  const client = twilio(accountSid, authToken);

  for (const r of pendientes) {
    const texto = r.cliente_nombre
      ? `Recordatorio (${r.cliente_nombre}) para el ${r.fecha}:\n\n${r.mensaje}`
      : `Recordatorio para el ${r.fecha}:\n\n${r.mensaje}`;

    try {
      await client.messages.create({
        body: texto,
        from: from,
        to: toWhatsApp,
      });
      await supabase.from("recordatorios").update({ enviado: true }).eq("id", r.id);
      console.log("[process-reminders] Enviado:", r.id);
    } catch (err) {
      console.error("[process-reminders] Twilio error para", r.id, err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ procesados: pendientes.length }) };
};
