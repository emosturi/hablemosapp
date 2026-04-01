const { requireAdvisorSession } = require("./advisor-session-auth");
const { loadTelegramChatByPhoneMap, resolveAdvisorTelegramChatId } = require("./telegram-advisor-route");

async function computeTelegramLinked(supabase, userId, dbTelegramChatId) {
  const map = loadTelegramChatByPhoneMap();
  const cache = new Map();
  const chatId = await resolveAdvisorTelegramChatId(
    supabase,
    userId,
    map,
    cache,
    "[advisor-subscription-sync]",
    dbTelegramChatId
  );
  return !!chatId;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders),
    body: JSON.stringify(body),
  };
}

function parseIso(s) {
  if (s == null || s === "") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Suma días en calendario UTC (alineado con fechas almacenadas en ISO). */
function addDaysUtc(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function buildUpdates(row, now) {
  if (row.subscription_bypass === true) return null;

  let status = row.subscription_status;
  const end = parseIso(row.current_period_end);
  let grace = parseIso(row.subscription_grace_until);
  const updates = {};

  if (status === "trial" && !end) {
    updates.current_period_end = addDaysUtc(now, 7).toISOString();
    return updates;
  }

  const applyCanceled = () => {
    updates.subscription_status = "canceled";
    updates.subscription_grace_until = null;
    status = "canceled";
    grace = null;
  };

  if (status === "trial" && end && now > end) {
    applyCanceled();
    return updates;
  }

  if (status === "active" && end && now > end) {
    const g = addDaysUtc(end, 3);
    updates.subscription_status = "past_due";
    updates.subscription_grace_until = g.toISOString();
    status = "past_due";
    grace = g;
    if (now > g) applyCanceled();
    return Object.keys(updates).length ? updates : null;
  }

  if (status === "past_due") {
    if (!grace && end) {
      const g = addDaysUtc(end, 3);
      updates.subscription_grace_until = g.toISOString();
      grace = g;
    }
    if (grace && now > grace) {
      applyCanceled();
    }
    return Object.keys(updates).length ? updates : null;
  }

  if ((status === "none" || status == null) && !end && !row.subscription_plan) {
    updates.subscription_status = "trial";
    updates.current_period_end = addDaysUtc(now, 7).toISOString();
    updates.subscription_grace_until = null;
    return updates;
  }

  return null;
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const auth = await requireAdvisorSession(event);
  if (auth.error) return json(auth.statusCode, { error: auth.error });

  const supabase = auth.supabase;
  const userId = auth.user.id;
  const now = new Date();

  const { data: row, error: selErr } = await supabase
    .from("asesor_cuentas")
    .select(
      "user_id, account_enabled, subscription_status, subscription_plan, current_period_end, subscription_grace_until, subscription_bypass, telegram_reminders_enabled, telegram_chat_id"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) return json(500, { error: selErr.message || "Error leyendo cuenta" });

  if (!row) {
    const trialEnd = addDaysUtc(now, 7).toISOString();
    const ins = await supabase.from("asesor_cuentas").insert({
      user_id: userId,
      account_enabled: true,
      telegram_reminders_enabled: true,
      subscription_status: "trial",
      subscription_plan: null,
      current_period_end: trialEnd,
      subscription_grace_until: null,
      subscription_bypass: false,
      updated_at: now.toISOString(),
    });
    if (ins.error) return json(500, { error: ins.error.message || "No se pudo crear la cuenta de asesor" });
    const tgNew = await computeTelegramLinked(supabase, userId, null);
    return json(200, {
      ok: true,
      created: true,
      account_enabled: true,
      subscription_status: "trial",
      subscription_bypass: false,
      current_period_end: trialEnd,
      subscription_grace_until: null,
      lock_navigation: false,
      telegram_linked: tgNew,
      telegram_reminders_enabled: true,
    });
  }

  if (row.account_enabled === false) {
    const tgOff = await computeTelegramLinked(supabase, userId, row.telegram_chat_id);
    return json(200, {
      ok: true,
      account_enabled: false,
      subscription_status: row.subscription_status,
      subscription_bypass: !!row.subscription_bypass,
      current_period_end: row.current_period_end,
      subscription_grace_until: row.subscription_grace_until,
      lock_navigation: true,
      telegram_linked: tgOff,
      telegram_reminders_enabled: row.telegram_reminders_enabled !== false,
    });
  }

  const updates = buildUpdates(row, now);
  if (updates && Object.keys(updates).length) {
    updates.updated_at = now.toISOString();
    const upd = await supabase.from("asesor_cuentas").update(updates).eq("user_id", userId);
    if (upd.error) return json(500, { error: upd.error.message || "No se pudo actualizar el estado" });
  }

  const { data: fresh } = await supabase
    .from("asesor_cuentas")
    .select(
      "account_enabled, subscription_status, current_period_end, subscription_grace_until, subscription_bypass, telegram_reminders_enabled, telegram_chat_id"
    )
    .eq("user_id", userId)
    .maybeSingle();

  const st = fresh && fresh.subscription_status;
  const bypass = !!(fresh && fresh.subscription_bypass);
  const lock = !bypass && st === "canceled";
  const tgLinked = await computeTelegramLinked(supabase, userId, fresh && fresh.telegram_chat_id);
  const tgEnabled = fresh ? fresh.telegram_reminders_enabled !== false : true;

  return json(200, {
    ok: true,
    account_enabled: fresh ? fresh.account_enabled !== false : true,
    subscription_status: st || "none",
    subscription_bypass: bypass,
    current_period_end: fresh && fresh.current_period_end,
    subscription_grace_until: fresh && fresh.subscription_grace_until,
    lock_navigation: lock,
    telegram_linked: tgLinked,
    telegram_reminders_enabled: tgEnabled,
  });
};
