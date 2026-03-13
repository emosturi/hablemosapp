/**
 * Netlify Scheduled Function: envía los recordatorios a NOTIFY_WHATSAPP_TO por WhatsApp (Twilio).
 * Se ejecuta cada 15 minutos (ver netlify.toml). Solo envía cuando la hora Chile >= hora del recordatorio,
 * así cada recordatorio se envía en la ejecución correspondiente a su hora (p. ej. recordatorio 09:30 → envío en la pasada de las 09:30).
 */
const twilio = require("twilio");
const { createClient } = require("@supabase/supabase-js");

exports.config = {
  schedule: "*/15 * * * *", // Cada 15 min (:00, :15, :30, :45 UTC); también definido en netlify.toml
};

function hoyChile() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }); // YYYY-MM-DD
}

function ahoraChileHHmm() {
  const s = new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour12: false, hour: "2-digit", minute: "2-digit" });
  const parts = s.split(":");
  const h = (parts[0] || "0").padStart(2, "0");
  const m = (parts[1] || "0").padStart(2, "0");
  return h + ":" + m;
}

exports.handler = async function (event, context) {
  // Invocación manual: GET con ?secret=NOTIFY_SECRET para ver logs y respuesta
  const q = event.queryStringParameters || {};
  const secret = process.env.NOTIFY_SECRET;
  const isGet = event.httpMethod === "GET";
  if (isGet && secret && q.secret !== secret) {
    return { statusCode: 401, body: JSON.stringify({ error: "Falta ?secret= correcto para ejecutar manualmente" }) };
  }

  console.log("[process-reminders] Ejecutando…", isGet ? "(invocación manual)" : "(programada)");

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

  const hoy = hoyChile();
  const ahoraChile = ahoraChileHHmm();
  console.log("[process-reminders] Hoy (Chile):", hoy, "Hora (Chile):", ahoraChile);

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
    return { statusCode: 200, body: JSON.stringify({ ok: true, hoy, ahoraChile, enviados: 0 }) };
  }

  console.log("[process-reminders] Pendientes:", pendientes.length, pendientes.map(function (p) { return { id: p.id, fecha: p.fecha, hora: p.hora }; }));

  const toNum = to.replace(/\D/g, "").replace(/^0/, "");
  const toWhatsApp = toNum.startsWith("56") ? `whatsapp:+${toNum}` : `whatsapp:+56${toNum}`;
  const client = twilio(accountSid, authToken);

  for (const r of pendientes) {
    const horaRecordatorio = (r.hora || "").trim();
    if (horaRecordatorio) {
      const rh = horaRecordatorio.split(":");
      const rNorm = (rh[0] || "0").padStart(2, "0") + ":" + (rh[1] || "0").padStart(2, "0");
      if (rNorm > ahoraChile) {
        console.log("[process-reminders] Aún no es hora:", r.id, "hora", rNorm, "ahora", ahoraChile);
        continue;
      }
    }

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

  return { statusCode: 200, body: JSON.stringify({ ok: true, hoy, ahoraChile, procesados: pendientes.length }) };
};
