/**
 * Netlify Scheduled Function: envía los recordatorios por Telegram.
 * Se ejecuta cada 5 min (pruebas) o 15 min (producción). Solo envía cuando la hora Chile >= hora del recordatorio.
 */
const { createClient } = require("@supabase/supabase-js");

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

function normalizarTelefonoE164(phone) {
  var d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.indexOf("56") === 0) return "+" + d;
  if (d.length >= 8 && d.length <= 15) return "+" + d;
  return "";
}

function leerMapaTelefonosChatDesdeEnv() {
  // Espera un JSON tipo:
  // {" +56912345678":"123456789", "+5491122334455":"987654321" }
  var raw = process.env.TELEGRAM_CHAT_BY_PHONE_JSON || "";
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    var out = {};
    Object.keys(parsed || {}).forEach(function (k) {
      var tel = normalizarTelefonoE164(k);
      var chatId = String(parsed[k] || "").trim();
      if (tel && chatId) out[tel] = chatId;
    });
    return out;
  } catch (e) {
    console.error("[process-reminders] TELEGRAM_CHAT_BY_PHONE_JSON invalido:", e.message);
    return {};
  }
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
  const chatByPhone = leerMapaTelefonosChatDesdeEnv();
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

    let chatIdObjetivo = "";
    const uid = r.user_id ? String(r.user_id) : "";
    if (uid) {
      let phoneAsesor = userPhoneCache.get(uid);
      if (phoneAsesor === undefined) {
        try {
          const userRes = await supabase.auth.admin.getUserById(uid);
          if (userRes.error) {
            console.error("[process-reminders] No se pudo leer auth user", uid, userRes.error.message);
            phoneAsesor = "";
          } else {
            const meta = (userRes.data && userRes.data.user && userRes.data.user.user_metadata) || {};
            phoneAsesor = normalizarTelefonoE164(meta.telefono || meta.phone || "");
          }
        } catch (e) {
          console.error("[process-reminders] Error leyendo user", uid, e.message);
          phoneAsesor = "";
        }
        userPhoneCache.set(uid, phoneAsesor || "");
      }

      if (phoneAsesor) {
        chatIdObjetivo = chatByPhone[phoneAsesor] || "";
      }
    }

    // fallback opcional para no perder avisos durante migracion
    if (!chatIdObjetivo && fallbackTelegramChatId) {
      chatIdObjetivo = fallbackTelegramChatId;
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
