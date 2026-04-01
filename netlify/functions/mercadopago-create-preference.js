const { requireAdvisorSession } = require("./advisor-session-auth");

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

function publicSiteUrl() {
  return String(process.env.MERCADOPAGO_PUBLIC_SITE_URL || process.env.URL || "").replace(/\/$/, "");
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const auth = await requireAdvisorSession(event);
  if (auth.error) return json(auth.statusCode, { error: auth.error });

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return json(500, { error: "Falta MERCADOPAGO_ACCESS_TOKEN en el servidor" });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return json(400, { error: "Body inválido" });
  }

  const plan = String(body.plan || "").trim();
  if (plan !== "mensual" && plan !== "anual") return json(400, { error: "plan debe ser mensual o anual" });

  const priceMensual = parseInt(process.env.MERCADOPAGO_PLAN_MENSUAL_CLP || "", 10);
  const priceAnual = parseInt(process.env.MERCADOPAGO_PLAN_ANUAL_CLP || "", 10);
  const unitPrice = plan === "mensual" ? priceMensual : priceAnual;
  if (!Number.isFinite(unitPrice) || unitPrice < 1) {
    return json(500, {
      error: "Configura MERCADOPAGO_PLAN_MENSUAL_CLP y MERCADOPAGO_PLAN_ANUAL_CLP (números enteros en pesos chilenos)",
    });
  }

  const base = publicSiteUrl();
  if (!base) {
    return json(500, {
      error:
        "Configura MERCADOPAGO_PUBLIC_SITE_URL (recomendado) o deja que Netlify defina URL, con la URL pública HTTPS de la app",
    });
  }

  const successUrl = `${base}/mi-suscripcion.html?mp=ok`;
  const failureUrl = `${base}/mi-suscripcion.html?mp=fail`;
  const pendingUrl = `${base}/mi-suscripcion.html?mp=pending`;

  const webhookBase = String(process.env.MERCADOPAGO_WEBHOOK_BASE_URL || base).replace(/\/$/, "");
  const notificationUrl = `${webhookBase}/.netlify/functions/mercadopago-webhook`;

  const userId = auth.user.id;
  const email = auth.user.email || undefined;

  const title =
    plan === "mensual" ? "Suscripcion HablemosApp - Plan mensual" : "Suscripcion HablemosApp - Plan anual";

  const preferenceBody = {
    items: [
      {
        id: plan,
        title,
        quantity: 1,
        currency_id: "CLP",
        unit_price: unitPrice,
      },
    ],
    external_reference: userId,
    metadata: { plan, user_id: userId },
    back_urls: {
      success: successUrl,
      failure: failureUrl,
      pending: pendingUrl,
    },
    auto_return: "approved",
    locale: "es_CL",
    notification_url: notificationUrl,
  };

  if (process.env.MERCADOPAGO_CHECKOUT_BINARY_MODE === "1") {
    preferenceBody.binary_mode = true;
  }

  const descriptor = String(process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR || "").trim();
  if (descriptor) preferenceBody.statement_descriptor = descriptor.slice(0, 22);

  if (email) preferenceBody.payer = { email };

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferenceBody),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || res.statusText || "Error Mercado Pago";
    console.error("MP preference error", res.status, data);
    return json(502, {
      error: typeof msg === "string" ? msg : "No se pudo crear la preferencia de pago",
    });
  }

  const initPoint = data.init_point || data.sandbox_init_point;
  if (!initPoint) return json(502, { error: "Respuesta de Mercado Pago sin URL de checkout" });

  return json(200, { init_point: initPoint, preference_id: data.id });
};
