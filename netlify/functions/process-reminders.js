/**
 * Netlify Scheduled Function: envía recordatorios por Telegram al chat del asesor (misma lógica que notify-telegram).
 * Cada fila en recordatorios.user_id define el dueño; TELEGRAM_CHAT_BY_PHONE_JSON + metadata.telefono del asesor.
 * Nunca usa TELEGRAM_CHAT_ID como grupo: todos los recordatorios van solo al chat del asesor dueño.
 * Cron: cada 5 minutos. Con intervalos mayores (p. ej. 15 min) y slots de agenda en punto, el aviso
 * "5 minutos antes" puede degradarse hasta coincidir con la hora de la llamada.
 * Agenda (mensaje fijo desde SQL): envía cuando hora Chile >= (hora de la cita − 5 min), ver recordatorio-hora-chile.js.
 */
const { createClient } = require("@supabase/supabase-js");
const { loadTelegramChatByPhoneMap } = require("./telegram-advisor-route");
const { sendTelegramToAdvisor } = require("./telegram-send");
const { sendReminderPushToUser } = require("./reminder-webpush");
const {
  hoyChile,
  ahoraChileHHmm,
  addDaysYMD,
  recordatorioDebeEnviarPorHora,
} = require("./recordatorio-hora-chile");

exports.config = {
  schedule: "*/5 * * * *",
};

function buildReminderPushPayload(r) {
  const msg = (r.mensaje || "").trim();
  let body = msg || "Tienes un recordatorio.";
  if (r.cliente_nombre) body = r.cliente_nombre + (body ? " — " + body : "");
  if (r.hora) {
    const ht = String(r.hora).length >= 5 ? String(r.hora).slice(0, 5) : r.hora;
    body = ht + " · " + body;
  }
  if (body.length > 180) body = body.slice(0, 178) + "…";
  return {
    title: "Recordatorio Prevy",
    body,
    url: "/recordatorios.html",
    tag: "prevy-r-" + r.id,
  };
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
  const telegramToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!supabaseUrl || !supabaseKey) {
    console.error("[process-reminders] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    return { statusCode: 500, body: "Configuración incompleta" };
  }
  if (!telegramToken) {
    console.warn("[process-reminders] TELEGRAM_BOT_TOKEN vacío: no habrá Telegram; se intentará solo Web Push.");
  }

  const hoy = hoyChile();
  const ahoraChile = ahoraChileHHmm();
  const fechaMin = addDaysYMD(hoy, -1);
  const fechaMax = addDaysYMD(hoy, 1);
  console.log("[process-reminders] Hoy (Chile):", hoy, "Hora (Chile):", ahoraChile, "Rango fechas:", fechaMin, "…", fechaMax);

  const supabase = createClient(supabaseUrl, supabaseKey);
  const chatByPhone = loadTelegramChatByPhoneMap();
  const userPhoneCache = new Map();
  var enviados = 0;
  var omitidosSinRuta = 0;

  const { data: pendientes, error } = await supabase
    .from("recordatorios")
    .select("id, user_id, fecha, hora, mensaje, cliente_nombre, cliente_telefono")
    .gte("fecha", fechaMin)
    .lte("fecha", fechaMax)
    .eq("enviado", false);

  if (error) {
    console.error("[process-reminders] Supabase:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  if (!pendientes || pendientes.length === 0) {
    console.log("[process-reminders] Sin recordatorios en ventana de fechas");
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
    const gate = recordatorioDebeEnviarPorHora(hoy, ahoraChile, r);
    if (!gate.ok) {
      if (gate.reason === "aun_no") {
        console.log("[process-reminders] Aún no es hora:", r.id, "umbral", gate.umbral && gate.umbral.hhmm, "ahora", ahoraChile, "offsetMin", gate.offsetMin);
      } else if (gate.reason === "umbral_otro_dia") {
        console.log("[process-reminders] Umbral en otro día (omitir hoy):", r.id, "umbral_fecha", gate.umbral && gate.umbral.date);
      }
      continue;
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
        const wpOff = await sendReminderPushToUser(supabase, uid, buildReminderPushPayload(r));
        if (wpOff && wpOff.sent) console.log("[process-reminders] Web Push enviados:", wpOff.sent, "user:", uid);
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

    let wpResult = null;
    if (envio.ok) {
      console.log("[process-reminders] Destino asesor chat_id:", envio.chatId, "recordatorio:", r.id);
    } else {
      if (envio.reason === "no_telegram_route" || envio.reason === "missing_owner_user_id") {
        omitidosSinRuta += 1;
        console.warn("[process-reminders] Sin ruta Telegram para recordatorio:", r.id, "user_id:", uid || "n/a", "— se intenta Web Push");
      } else {
        console.error("[process-reminders] Error de envío Telegram:", r.id, envio.reason, envio.error || "", "— se intenta Web Push");
      }
      try {
        wpResult = await sendReminderPushToUser(supabase, uid, buildReminderPushPayload(r));
        if (wpResult && wpResult.sent > 0) {
          console.log("[process-reminders] Web Push (sin Telegram previo):", wpResult.sent, "user:", uid, "recordatorio:", r.id);
        }
      } catch (err) {
        console.error("[process-reminders] Web Push tras fallo Telegram:", r.id, err.message);
      }
    }

    const entregadoTelegram = !!envio.ok;
    const entregadoPush = wpResult && wpResult.sent > 0;

    try {
      if (entregadoTelegram) {
        await supabase.from("recordatorios").update({ enviado: true }).eq("id", r.id);
        console.log("[process-reminders] Enviado (Telegram):", r.id);
        enviados += 1;
        const wpOk = await sendReminderPushToUser(supabase, uid, buildReminderPushPayload(r));
        if (wpOk && wpOk.sent) console.log("[process-reminders] Web Push enviados:", wpOk.sent, "user:", uid);
      } else if (entregadoPush) {
        await supabase.from("recordatorios").update({ enviado: true }).eq("id", r.id);
        console.log("[process-reminders] Enviado (solo Web Push):", r.id);
        enviados += 1;
      } else {
        console.error(
          "[process-reminders] Recordatorio sin ningún canal: id=",
          r.id,
          "user_id=",
          uid || "n/a",
          "— configura Telegram (configuración Telegram / chat ID) o activa notificaciones PWA. Marcando enviado en BD para no reintentar en bucle."
        );
        await supabase.from("recordatorios").update({ enviado: true }).eq("id", r.id);
      }
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
