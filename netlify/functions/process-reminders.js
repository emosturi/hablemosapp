/**
 * Netlify Scheduled Function: envía recordatorios por Telegram al chat del asesor (misma lógica que notify-telegram).
 * Cada fila en recordatorios.user_id define el dueño; TELEGRAM_CHAT_BY_PHONE_JSON + metadata.telefono del asesor.
 * Si el mapa por teléfono está configurado, no se usa TELEGRAM_CHAT_ID como grupo (privacidad).
 * Se ejecuta cada 5 min (pruebas) o 15 min (producción). Solo envía cuando la hora Chile >= hora del recordatorio.
 */
const { createClient } = require("@supabase/supabase-js");
const {
  loadTelegramChatByPhoneMap,
  isAdvisorTelegramMapConfigured,
  resolveAdvisorTelegramChatId,
} = require("./telegram-advisor-route");

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

async function enviarTelegram(token, chatId, texto) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
  const data = await res.json().catch(() => ({}));
  return data.ok;
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
  const fallbackTelegramChatId = (process.env.TELEGRAM_CHAT_ID || "").trim(); // opcional

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
    return { statusCode: 200, body: JSON.stringify({ ok: true, hoy, ahoraChile, enviados: 0 }) };
  }

  console.log("[process-reminders] Pendientes:", pendientes.length, pendientes.map(function (p) { return { id: p.id, fecha: p.fecha, hora: p.hora }; }));

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
    let chatIdObjetivo = await resolveAdvisorTelegramChatId(
      supabase,
      uid,
      chatByPhone,
      userPhoneCache,
      "[process-reminders]"
    );

    // Grupo global solo si aún no configuraste mapa por asesor (migración legacy)
    if (!chatIdObjetivo && fallbackTelegramChatId && !isAdvisorTelegramMapConfigured(chatByPhone)) {
      chatIdObjetivo = fallbackTelegramChatId;
    }
    if (!chatIdObjetivo && fallbackTelegramChatId && isAdvisorTelegramMapConfigured(chatByPhone)) {
      console.warn(
        "[process-reminders] Mapa por asesor activo: no se usa TELEGRAM_CHAT_ID. Recordatorio sin chat para user_id:",
        uid || "n/a"
      );
    }

    if (!chatIdObjetivo) {
      omitidosSinRuta += 1;
      console.warn("[process-reminders] Sin ruta Telegram para recordatorio:", r.id, "user_id:", uid || "n/a");
      continue;
    }

    try {
      const ok = await enviarTelegram(telegramToken, chatIdObjetivo, texto);
      if (ok) {
        await supabase.from("recordatorios").update({ enviado: true }).eq("id", r.id);
        console.log("[process-reminders] Enviado:", r.id);
        enviados += 1;
      } else {
        console.error("[process-reminders] Telegram no envió:", r.id);
      }
    } catch (err) {
      console.error("[process-reminders] Error para", r.id, err.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, hoy, ahoraChile, procesados: pendientes.length, enviados, omitidosSinRuta }),
  };
};
