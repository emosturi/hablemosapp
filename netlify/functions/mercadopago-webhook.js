const crypto = require("crypto");
const { getServiceClient } = require("./advisor-session-auth");

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), "hex");
    const bb = Buffer.from(String(b), "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch (_) {
    return false;
  }
}

function parseXSignature(headerVal) {
  const out = { ts: null, v1: null };
  if (!headerVal) return out;
  String(headerVal)
    .split(",")
    .map((p) => p.trim())
    .forEach((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return;
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      if (k === "ts") out.ts = v;
      if (k === "v1") out.v1 = v;
    });
  return out;
}

function normalizeDataIdForManifest(id) {
  const s = String(id || "");
  if (/^[a-zA-Z0-9]+$/.test(s)) return s.toLowerCase();
  return s;
}

/**
 * Firma según documentación Mercado Pago: id y ts en el manifiesto; data.id en query (?data.id=).
 * @see https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks
 */
function verifyMpWebhookSignature(event, dataIdFallback) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true;

  const h = event.headers || {};
  const xSig = h["x-signature"] || h["X-Signature"] || "";
  const xReq = h["x-request-id"] || h["X-Request-Id"] || "";
  const qs = event.queryStringParameters || {};
  const fromQs = qs["data.id"];
  const dataID = normalizeDataIdForManifest(fromQs != null ? fromQs : dataIdFallback != null ? dataIdFallback : "");

  if (!xSig) {
    if (event.httpMethod === "GET" && process.env.MERCADOPAGO_WEBHOOK_ALLOW_UNSIGNED_GET === "1") return true;
    return false;
  }

  if (!xReq || !dataID) return false;

  const { ts, v1 } = parseXSignature(xSig);
  if (!ts || !v1) return false;

  const manifest = `id:${dataID};request-id:${xReq};ts:${ts};`;
  const hmac = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return timingSafeEqualHex(hmac, v1);
}

async function fetchPayment(paymentId, accessToken) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { error: `payment ${res.status}` };
  return { payment: await res.json() };
}

async function fetchMerchantOrder(orderId, accessToken) {
  const res = await fetch(`https://api.mercadopago.com/merchant_orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { error: `merchant_order ${res.status}` };
  return { order: await res.json() };
}

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s));
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function planFromPayment(payment) {
  const meta = payment.metadata || {};
  const p = meta.plan != null ? String(meta.plan).trim() : "";
  if (p === "mensual" || p === "anual") return p;
  const items = payment.additional_info && payment.additional_info.items;
  if (items && items[0] && items[0].id) {
    const id = String(items[0].id).trim();
    if (id === "mensual" || id === "anual") return id;
  }
  return null;
}

async function resetPayerReferralDiscount(supabase, payerId, plan) {
  const col = plan === "mensual" ? "referral_discount_percent_mensual" : "referral_discount_percent_anual";
  const r = await supabase
    .from("asesor_cuentas")
    .update({ [col]: 0, updated_at: new Date().toISOString() })
    .eq("user_id", payerId);
  if (r.error) console.error("resetPayerReferralDiscount", r.error);
}

async function creditReferrerFromPayment(supabase, referredUserId, paymentId, plan) {
  const { data: attr } = await supabase.from("referral_attributions").select("referrer_user_id").eq("referred_user_id", referredUserId).maybeSingle();
  if (!attr || !attr.referrer_user_id) return;

  const { data: priorConv } = await supabase.from("referral_conversions").select("id").eq("referred_user_id", referredUserId).limit(1).maybeSingle();
  if (priorConv) return;

  const { error: convErr } = await supabase.from("referral_conversions").insert({
    mp_payment_id: paymentId,
    referrer_user_id: attr.referrer_user_id,
    referred_user_id: referredUserId,
    plan,
  });
  if (convErr) {
    if (String(convErr.code || "") === "23505") return;
    console.error("referral_conversions insert", convErr);
    return;
  }

  const col = plan === "mensual" ? "referral_discount_percent_mensual" : "referral_discount_percent_anual";
  const { data: acc } = await supabase.from("asesor_cuentas").select(col).eq("user_id", attr.referrer_user_id).maybeSingle();
  const cur = acc && typeof acc[col] === "number" ? acc[col] : 0;
  const next = Math.min(90, cur + 15);

  const { data: refAccRow } = await supabase.from("asesor_cuentas").select("user_id").eq("user_id", attr.referrer_user_id).maybeSingle();
  if (!refAccRow) {
    const insRef = await supabase.from("asesor_cuentas").insert({
      user_id: attr.referrer_user_id,
      account_enabled: true,
      telegram_reminders_enabled: true,
      [col]: next,
      updated_at: new Date().toISOString(),
    });
    if (insRef.error) console.error("referrer asesor_cuentas insert", insRef.error);
    return;
  }

  const upd = await supabase
    .from("asesor_cuentas")
    .update({ [col]: next, updated_at: new Date().toISOString() })
    .eq("user_id", attr.referrer_user_id);
  if (upd.error) console.error("referrer discount update", upd.error);
}

async function applyApprovedPayment(supabase, payment) {
  const paymentId = payment.id != null ? String(payment.id) : "";
  const ext = payment.external_reference != null ? String(payment.external_reference).trim() : "";
  if (!paymentId || !isUuid(ext)) {
    return { skipped: true, reason: "missing id or external_reference" };
  }

  const plan = planFromPayment(payment);
  if (!plan) return { skipped: true, reason: "unknown plan" };

  const { data: row } = await supabase
    .from("asesor_cuentas")
    .select("mercadopago_last_payment_id, current_period_end")
    .eq("user_id", ext)
    .maybeSingle();

  if (row && row.mercadopago_last_payment_id === paymentId) {
    return { skipped: true, reason: "already applied" };
  }

  const now = new Date();
  let base = now;
  if (row && row.current_period_end) {
    const end = new Date(row.current_period_end);
    if (!isNaN(end.getTime()) && end > base) base = end;
  }
  const periodEnd = addMonths(base, plan === "anual" ? 12 : 1);

  const upd = {
    subscription_plan: plan,
    subscription_status: "active",
    current_period_end: periodEnd.toISOString(),
    mercadopago_last_payment_id: paymentId,
    updated_at: now.toISOString(),
  };

  if (!row) {
    const ins = Object.assign(
      {
        user_id: ext,
        account_enabled: true,
        telegram_reminders_enabled: true,
      },
      upd
    );
    const r = await supabase.from("asesor_cuentas").insert(ins);
    if (r.error) return { error: r.error.message };
    await resetPayerReferralDiscount(supabase, ext, plan);
    await creditReferrerFromPayment(supabase, ext, paymentId, plan);
    return { ok: true };
  }

  const r = await supabase.from("asesor_cuentas").update(upd).eq("user_id", ext);
  if (r.error) return { error: r.error.message };
  await resetPayerReferralDiscount(supabase, ext, plan);
  await creditReferrerFromPayment(supabase, ext, paymentId, plan);
  return { ok: true };
}

async function processPaymentId(paymentId, accessToken, supabase) {
  const got = await fetchPayment(paymentId, accessToken);
  if (got.error) {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ received: true, note: got.error }) };
  }
  const payment = got.payment;
  if (payment.status !== "approved") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ received: true, status: payment.status }),
    };
  }
  const res = await applyApprovedPayment(supabase, payment);
  if (res.error) console.error("mercadopago-webhook apply", res.error);
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ received: true, applied: res.ok === true }),
  };
}

exports.handler = async function (event) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const svc = getServiceClient();
  if (svc.error) {
    console.error(svc.error);
    return { statusCode: 500, body: svc.error };
  }
  const supabase = svc.supabase;

  if (!accessToken) {
    console.error("MERCADOPAGO_ACCESS_TOKEN missing");
    return { statusCode: 500, body: "config error" };
  }

  const method = event.httpMethod || "";

  if (method === "GET") {
    const qs = event.queryStringParameters || {};
    const topic = String(qs.topic || "").toLowerCase();
    const id = qs.id != null ? qs.id : qs["data.id"];
    if (id == null || String(id).trim() === "") {
      return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: "ok" };
    }

    const idStr = String(id).trim();
    if (!verifyMpWebhookSignature(event, idStr)) {
      console.warn("mercadopago-webhook: firma inválida o ausente (GET)");
      return { statusCode: 401, body: "invalid signature" };
    }

    if (topic === "payment" || topic === "") {
      return processPaymentId(idStr, accessToken, supabase);
    }
    if (topic === "merchant_order") {
      const mo = await fetchMerchantOrder(idStr, accessToken);
      if (mo.error) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ received: true, note: mo.error }),
        };
      }
      const payments = (mo.order && mo.order.payments) || [];
      let last = { statusCode: 200, body: "{}" };
      for (const pay of payments) {
        if (!pay || pay.id == null) continue;
        last = await processPaymentId(String(pay.id), accessToken, supabase);
      }
      return last;
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ received: true, topic: topic || "unknown" }),
    };
  }

  if (method === "POST") {
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (_) {
      return { statusCode: 400, body: "invalid json" };
    }

    const qs = event.queryStringParameters || {};
    const dataId = body.data && body.data.id != null ? body.data.id : qs["data.id"];

    if (!verifyMpWebhookSignature(event, dataId)) {
      console.warn("mercadopago-webhook: firma inválida o ausente (POST)");
      return { statusCode: 401, body: "invalid signature" };
    }

    const t = String(body.type || "").toLowerCase();
    if (t === "payment" && dataId != null) {
      return processPaymentId(String(dataId), accessToken, supabase);
    }
    if (t === "merchant_order" && dataId != null) {
      const mo = await fetchMerchantOrder(String(dataId), accessToken);
      if (mo.error) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ received: true, note: mo.error }),
        };
      }
      const payments = (mo.order && mo.order.payments) || [];
      let last = { statusCode: 200, body: "{}" };
      for (const pay of payments) {
        if (!pay || pay.id == null) continue;
        last = await processPaymentId(String(pay.id), accessToken, supabase);
      }
      return last;
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ received: true }),
    };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
