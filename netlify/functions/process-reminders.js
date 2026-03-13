/**
 * Netlify Scheduled Function: envía los recordatorios programados para hoy
 * a NOTIFY_WHATSAPP_TO por WhatsApp (Twilio).
 * Se ejecuta cada hora; solo envía cuando la hora actual (Chile) >= hora del recordatorio.
 */
const twilio = require("twilio");
const { createClient } = require("@supabase/supabase-js");

exports.config = {
  schedule: "0 * * * *", // Cada hora (para respetar la hora indicada)
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
  const ahoraChile = new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hour12: false });
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: pendientes, error } = await supabase
    .from("recordatorios")
    .select("id, fecha, hora, mensaje, cliente_nombre, cliente_telefono")
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
    if (r.hora && r.hora.trim() && r.hora > ahoraChile) continue;

    const cabecera = [];
    if (r.cliente_nombre) cabecera.push(r.cliente_nombre);
    if (r.cliente_telefono) cabecera.push("Tel: " + r.cliente_telefono);
    const cabeceraStr = cabecera.length > 0 ? " (" + cabecera.join(", ") + ")" : "";
    const texto = `Recordatorio${cabeceraStr} para el ${r.fecha}${r.hora ? " a las " + r.hora : ""}:\n\n${r.mensaje}`;

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
