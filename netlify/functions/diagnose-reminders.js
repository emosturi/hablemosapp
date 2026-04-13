/**
 * GET /.netlify/functions/diagnose-reminders?secret=NOTIFY_SECRET
 * Solo lectura: reloj Chile, variables (presencia), filas pendientes vs lo que el cron procesa.
 * No expone valores de tokens ni service role.
 */
const { createClient } = require("@supabase/supabase-js");
const { loadTelegramChatByPhoneMap } = require("./telegram-advisor-route");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(code, body) {
  return {
    statusCode: code,
    headers: Object.assign({ "Content-Type": "application/json" }, cors),
    body: JSON.stringify(body),
  };
}

function hoyChile() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

function ahoraChileHHmm() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  let h = "00";
  let m = "00";
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].type === "hour") h = String(parts[i].value).padStart(2, "0");
    if (parts[i].type === "minute") m = String(parts[i].value).padStart(2, "0");
  }
  return h + ":" + m;
}

function horaRecordatorioNorm(horaRaw) {
  const horaRecordatorio = (horaRaw || "").trim();
  if (!horaRecordatorio) return "";
  const rh = horaRecordatorio.split(":");
  return (rh[0] || "0").padStart(2, "0") + ":" + (rh[1] || "0").padStart(2, "0");
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Usa GET" });

  const q = event.queryStringParameters || {};
  const secret = process.env.NOTIFY_SECRET;
  if (secret && q.secret !== secret) {
    return json(401, { error: "Añade ?secret= con el mismo NOTIFY_SECRET que en Netlify (como en process-reminders manual)." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hoy = hoyChile();
  const ahora = ahoraChileHHmm();
  const nowUtc = new Date().toISOString();

  const env = {
    SUPABASE_URL: !!String(supabaseUrl || "").trim(),
    SUPABASE_SERVICE_ROLE_KEY: !!String(supabaseKey || "").trim(),
    TELEGRAM_BOT_TOKEN: !!String(process.env.TELEGRAM_BOT_TOKEN || "").trim(),
    NOTIFY_SECRET: !!String(process.env.NOTIFY_SECRET || "").trim(),
    VAPID_PUBLIC_KEY: !!String(process.env.VAPID_PUBLIC_KEY || "").trim(),
    VAPID_PRIVATE_KEY: !!String(process.env.VAPID_PRIVATE_KEY || "").trim(),
    TELEGRAM_CHAT_BY_PHONE_JSON: !!String(process.env.TELEGRAM_CHAT_BY_PHONE_JSON || "").trim(),
  };

  const chatMap = loadTelegramChatByPhoneMap();
  const telefonosMapeadosEnJson = Object.keys(chatMap).length;

  const out = {
    ok: true,
    server_utc_iso: nowUtc,
    chile_fecha_usada_por_cron: hoy,
    chile_hora_usada_por_cron: ahora,
    env_presente: env,
    telefonos_con_chat_id_en_json: telefonosMapeadosEnJson,
    notas: [
      "El cron solo procesa filas con fecha EXACTAMENTE igual a chile_fecha_usada_por_cron y enviado=false.",
      "Si hora en la fila está vacía, se considera vencida al momento (no espera hora).",
      "Si hora tiene valor, solo envía cuando chile_hora_usada_por_cron >= hora del recordatorio (HH:MM).",
      "Filas con fecha anterior a hoy en Chile y enviado=false NUNCA las procesa el cron (quedan olvidadas).",
    ],
  };

  if (!supabaseUrl || !supabaseKey) {
    out.ok = false;
    out.error = "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Netlify.";
    return json(200, out);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const pendHoy = await supabase
    .from("recordatorios")
    .select("id, user_id, fecha, hora, enviado", { count: "exact" })
    .eq("fecha", hoy)
    .eq("enviado", false);

  out.pendientes_hoy_misma_fecha_que_cron = {
    count: pendHoy.count != null ? pendHoy.count : (pendHoy.data || []).length,
    error: pendHoy.error ? pendHoy.error.message : null,
    muestra: (pendHoy.data || []).slice(0, 8).map(function (r) {
      const rNorm = horaRecordatorioNorm(r.hora);
      const sinHora = !String(r.hora || "").trim();
      const horaYaPaso = sinHora || (rNorm && rNorm <= ahora);
      return {
        id: r.id,
        fecha: r.fecha,
        hora_guardada: r.hora || null,
        hora_ya_paso_para_envio: horaYaPaso,
        user_id: r.user_id,
      };
    }),
  };

  const atrasados = await supabase
    .from("recordatorios")
    .select("id, fecha, hora, enviado, user_id", { count: "exact" })
    .eq("enviado", false)
    .lt("fecha", hoy)
    .order("fecha", { ascending: false })
    .limit(15);

  out.pendientes_fecha_anterior_a_hoy_chile = {
    count: atrasados.count != null ? atrasados.count : (atrasados.data || []).length,
    error: atrasados.error ? atrasados.error.message : null,
    muestra: (atrasados.data || []).slice(0, 8),
    advertencia:
      (atrasados.data || []).length > 0
        ? "Hay recordatorios no enviados con fecha pasada: el cron NO los tocará. Corrige fecha o crea uno nuevo."
        : null,
  };

  const futuros = await supabase
    .from("recordatorios")
    .select("id, fecha, hora", { count: "exact" })
    .eq("enviado", false)
    .gt("fecha", hoy)
    .limit(5);

  out.pendientes_fecha_futura = {
    count: futuros.count != null ? futuros.count : (futuros.data || []).length,
    muestra: futuros.data || [],
  };

  return json(200, out);
};
