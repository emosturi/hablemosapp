/**
 * Netlify Scheduled Function: envía recordatorios por Telegram al chat del asesor (misma lógica que notify-telegram).
 * Cada fila en recordatorios.user_id define el dueño; TELEGRAM_CHAT_BY_PHONE_JSON + metadata.telefono del asesor.
 * Nunca usa TELEGRAM_CHAT_ID como grupo: todos los recordatorios van solo al chat del asesor dueño.
 * Se ejecuta cada 5 min (pruebas) o 15 min (producción). Solo envía cuando la hora Chile >= hora del recordatorio.
 */
const { createClient } = require("@supabase/supabase-js");
const { loadTelegramChatByPhoneMap } = require("./telegram-advisor-route");
const { sendTelegramToAdvisor } = require("./telegram-send");

exports.config = {
  schedule: "*/5 * * * *", // Cada 5 min (pruebas); en producción usar "*/15 * * * *"
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
  const q = event.queryStringParameters || {};
  const secret = process.env.NOTIFY_SECRET;
  const isGet = event.httpMethod === "GET";
  if (isGet && secret && q.secret !== secret) {
    return { statusCode: 401, body: JSON.stringify({ error: "Falta ?secret= correcto para ejecutar manualmente" }) };
  }

  console.log("[process-reminders] Ejecutando…", isGet ? "(invocación manual)" : "(programada)");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!supabaseUrl || !supabaseKey || !telegramToken) {
    console.error("[process-reminders] Faltan variables (SUPABASE_*, TELEGRAM_BOT_TOKEN)");
    return { statusCode: 500, body: "Configuración incompleta" };
  }

  const hoy = hoyChile();
  const ahoraChile = ahoraChileHHmm();
  console.log("[process-reminders] Hoy (Chile):", hoy, "Hora (Chile):", ahoraChile);

  const supabase = createClient(supabaseUrl, supabaseKey);
  const chatByPhone = loadTelegramChatByPhoneMap();
  const userPhoneCache = new Map();
  var enviados = 0;
  var omitidosSinRuta = 0;

  const { data: pendientes, error } = await supabase
    .from("recordatorios")
    .select("id, user_id, fecha, hora, mensaje, cliente_nombre, cliente_telefono")
    .eq("fecha", hoy)
    .eq("enviado", false);

  if (error) {
    console.error("[process-reminders] Supabase:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  if (!pendientes || pendientes.length === 0) {
    console.log("[process-reminders] Sin recordatorios para hoy");
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, hoy, ahoraChile, enviados: 0, omitidosTelegramOff: 0 }),
    };
  }

  console.log("[process-reminders] Pendientes:", pendientes.length, pendientes.map(function (p) { return { id: p.id, fecha: p.fecha, hora: p.hora }; }));

  const uids = [...new Set(pendientes.map((p) => (p.user_id ? String(p.user_id) : "")).filter(Boolean))];
  const tgByUser = {};
  const tgChatByUser = {};
  if (uids.length) {
    const accRes = await supabase
      .from("asesor_cuentas")
      .select("user_id, telegram_reminders_enabled, telegram_chat_id")
      .in("user_id", uids);
    if (!accRes.error && Array.isArray(accRes.data)) {
      for (const row of accRes.data) {
        const uidKey = String(row.user_id);
        tgByUser[uidKey] = row.telegram_reminders_enabled !== false;
        tgChatByUser[uidKey] = row.telegram_chat_id || "";
      }
    }
  }

  var omitidosTelegramOff = 0;

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

    const uid = r.user_id ? String(r.user_id) : "";
    if (uid && Object.prototype.hasOwnProperty.call(tgByUser, uid) && tgByUser[uid] === false) {
      omitidosTelegramOff += 1;
      console.warn("[process-reminders] Telegram deshabilitado para asesor, se omite envío:", r.id, "user_id:", uid);
      try {
        await supabase.from("recordatorios").update({ enviado: true }).eq("id", r.id);
        console.log("[process-reminders] Marcado enviado (sin Telegram):", r.id);
      } catch (err) {
        console.error("[process-reminders] Error marcando recordatorio:", r.id, err.message);
      }
      continue;
    }

    const envio = await sendTelegramToAdvisor({
      supabase,
      ownerUserId: uid,
      text: texto,
      telegramToken,
      chatByPhone,
      userPhoneCache,
      logPrefix: "[process-reminders]",
      dbTelegramChatId: tgChatByUser[uid] || "",
    });
    if (!envio.ok) {
      if (envio.reason === "no_telegram_route" || envio.reason === "missing_owner_user_id") {
        omitidosSinRuta += 1;
        console.warn("[process-reminders] Sin ruta Telegram para recordatorio:", r.id, "user_id:", uid || "n/a");
      } else {
        console.error("[process-reminders] Error de envío Telegram:", r.id, envio.reason, envio.error || "");
      }
      continue;
    }
    console.log("[process-reminders] Destino asesor chat_id:", envio.chatId, "recordatorio:", r.id);

    try {
      await supabase.from("recordatorios").update({ enviado: true }).eq("id", r.id);
      console.log("[process-reminders] Enviado:", r.id);
      enviados += 1;
    } catch (err) {
      console.error("[process-reminders] Error para", r.id, err.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      hoy,
      ahoraChile,
      procesados: pendientes.length,
      enviados,
      omitidosSinRuta,
      omitidosTelegramOff,
    }),
  };
};
