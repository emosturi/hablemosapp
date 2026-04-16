/**
 * GET /.netlify/functions/diagnose-reminders?secret=NOTIFY_SECRET
 * Solo lectura: reloj Chile, variables (presencia), filas pendientes vs lo que el cron procesa.
 * No expone valores de tokens ni service role.
 */
const { createClient } = require("@supabase/supabase-js");
const { loadTelegramChatByPhoneMap } = require("./telegram-advisor-route");
const {
  hoyChile,
  ahoraChileHHmm,
  addDaysYMD,
  normalizeHHMM,
  recordatorioDebeEnviarPorHora,
} = require("./recordatorio-hora-chile");

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
  const fechaMin = addDaysYMD(hoy, -1);
  const fechaMax = addDaysYMD(hoy, 1);
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
      "El cron procesa filas enviado=false con fecha entre (hoy Chile − 1 día) y (hoy Chile + 1 día), para cubrir avisos de agenda el día anterior a una cita muy temprano.",
      "Si hora en la fila está vacía, se considera vencida al momento (no espera hora).",
      "Si hora tiene valor: recordatorios normales envían cuando hora Chile >= hora de la fila; los de agenda (mensaje que comienza por «Llamada telefónica agendada por la web.») cuando hora Chile >= (hora de la cita − 5 min).",
      "El schedule debe ser cada 5 minutos; con 15 min los avisos «5 min antes» de slots en punto pueden llegar tarde (hasta la hora de la llamada).",
      "Filas con fecha anterior a (hoy − 1) en Chile y enviado=false no entran en la ventana del cron.",
    ],
    ventana_fechas_cron: { desde: fechaMin, hasta: fechaMax },
  };

  if (!supabaseUrl || !supabaseKey) {
    out.ok = false;
    out.error = "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Netlify.";
    return json(200, out);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const pendVentana = await supabase
    .from("recordatorios")
    .select("id, user_id, fecha, hora, mensaje, enviado", { count: "exact" })
    .gte("fecha", fechaMin)
    .lte("fecha", fechaMax)
    .eq("enviado", false);

  out.pendientes_ventana_igual_que_cron = {
    count: pendVentana.count != null ? pendVentana.count : (pendVentana.data || []).length,
    error: pendVentana.error ? pendVentana.error.message : null,
    muestra: (pendVentana.data || []).slice(0, 8).map(function (r) {
      const gate = recordatorioDebeEnviarPorHora(hoy, ahora, r);
      return {
        id: r.id,
        fecha: r.fecha,
        hora_guardada: r.hora || null,
        disparo_regla: gate.umbral || null,
        offset_minutos_agenda: gate.offsetMin != null ? gate.offsetMin : 0,
        debe_enviar_ahora_segun_cron: gate.ok,
        razon: gate.reason,
        user_id: r.user_id,
      };
    }),
  };

  const pendHoy = await supabase
    .from("recordatorios")
    .select("id, user_id, fecha, hora, enviado", { count: "exact" })
    .eq("fecha", hoy)
    .eq("enviado", false);

  out.pendientes_solo_fecha_hoy = {
    count: pendHoy.count != null ? pendHoy.count : (pendHoy.data || []).length,
    error: pendHoy.error ? pendHoy.error.message : null,
    muestra: (pendHoy.data || []).slice(0, 8).map(function (r) {
      const rNorm = normalizeHHMM(r.hora);
      const sinHora = !String(r.hora || "").trim();
      const horaYaPaso = sinHora || (rNorm && rNorm <= ahora);
      return {
        id: r.id,
        fecha: r.fecha,
        hora_guardada: r.hora || null,
        hora_ya_paso_lexico_simple: horaYaPaso,
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
