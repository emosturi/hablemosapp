/**
 * Cron diario: sincroniza recordatorios de cumpleaños (pensionados y cónyuges) en la agenda.
 * Pensionado: aviso 1 día antes a las 10:00.
 * Cónyuge: aviso 7 días antes y 1 día antes a las 10:00.
 */
const { createClient } = require("@supabase/supabase-js");
const { hoyChile } = require("./recordatorio-hora-chile");
const {
  ALL_BIRTHDAY_AUTO_KEYS,
  buildBirthdayReminderRows,
  expectedBirthdayKeysForCliente,
} = require("./birthday-reminder-utils");

exports.config = {
  schedule: "0 8 * * *",
};

const CLIENTE_SELECT =
  "id, user_id, nombres, apellido_paterno, apellido_materno, telefono, fecha_nacimiento, pensionado, " +
  "conyuge_nombres, conyuge_apellido_paterno, conyuge_apellido_materno, conyuge_fecha_nacimiento, solicitud_beneficiarios";

const UPSERT_BATCH = 80;

exports.handler = async function (event) {
  const q = event.queryStringParameters || {};
  const secret = process.env.NOTIFY_SECRET;
  const isGet = event.httpMethod === "GET";
  if (isGet && secret && q.secret !== secret) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Falta ?secret= correcto para ejecutar manualmente" }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[sync-birthday-reminders] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    return { statusCode: 500, body: "Configuración incompleta" };
  }

  const hoy = hoyChile();
  console.log("[sync-birthday-reminders] Inicio. Hoy Chile:", hoy);

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: clientes, error: errCli } = await supabase
    .from("clientes")
    .select(CLIENTE_SELECT)
    .eq("pensionado", true);

  if (errCli) {
    console.error("[sync-birthday-reminders] clientes:", errCli);
    return { statusCode: 500, body: JSON.stringify({ error: errCli.message }) };
  }

  const lista = clientes || [];
  const pensionadoIds = new Set(lista.map(function (c) { return c.id; }));
  const expectedKeyByCliente = new Map();

  lista.forEach(function (c) {
    expectedKeyByCliente.set(c.id, expectedBirthdayKeysForCliente(c));
  });

  const clienteIds = lista.map(function (c) { return c.id; });
  const enviadoByClienteKey = {};

  if (clienteIds.length > 0) {
    const { data: existentes, error: errEx } = await supabase
      .from("recordatorios")
      .select("cliente_id, auto_key, fecha, enviado")
      .in("cliente_id", clienteIds)
      .in("auto_key", ALL_BIRTHDAY_AUTO_KEYS);

    if (errEx) {
      console.error("[sync-birthday-reminders] recordatorios existentes:", errEx);
      return { statusCode: 500, body: JSON.stringify({ error: errEx.message }) };
    }

    (existentes || []).forEach(function (row) {
      if (!row.cliente_id || !row.auto_key) return;
      if (!enviadoByClienteKey[row.cliente_id]) enviadoByClienteKey[row.cliente_id] = {};
      enviadoByClienteKey[row.cliente_id][row.auto_key] = {
        fecha: String(row.fecha || "").slice(0, 10),
        enviado: row.enviado,
      };
    });
  }

  const toUpsert = [];
  lista.forEach(function (c) {
    const envMap = enviadoByClienteKey[c.id] || {};
    const rows = buildBirthdayReminderRows(c, hoy, envMap);
    rows.forEach(function (r) {
      toUpsert.push(r);
    });
  });

  let upserted = 0;
  for (let i = 0; i < toUpsert.length; i += UPSERT_BATCH) {
    const batch = toUpsert.slice(i, i + UPSERT_BATCH);
    const { error: errUp } = await supabase
      .from("recordatorios")
      .upsert(batch, { onConflict: "cliente_id,auto_key" });
    if (errUp) {
      console.error("[sync-birthday-reminders] upsert:", errUp);
      return { statusCode: 500, body: JSON.stringify({ error: errUp.message }) };
    }
    upserted += batch.length;
  }

  const { data: allBirthdayRows, error: errAll } = await supabase
    .from("recordatorios")
    .select("id, cliente_id, auto_key")
    .in("auto_key", ALL_BIRTHDAY_AUTO_KEYS);

  if (errAll) {
    console.error("[sync-birthday-reminders] listar birthday:", errAll);
    return { statusCode: 500, body: JSON.stringify({ error: errAll.message }) };
  }

  const idsToDelete = [];
  (allBirthdayRows || []).forEach(function (row) {
    const cid = row.cliente_id;
    const key = row.auto_key;
    if (!cid || !key) {
      idsToDelete.push(row.id);
      return;
    }
    if (!pensionadoIds.has(cid)) {
      idsToDelete.push(row.id);
      return;
    }
    const expected = expectedKeyByCliente.get(cid) || [];
    if (expected.indexOf(key) === -1) {
      idsToDelete.push(row.id);
    }
  });

  let deleted = 0;
  for (let j = 0; j < idsToDelete.length; j += UPSERT_BATCH) {
    const chunk = idsToDelete.slice(j, j + UPSERT_BATCH);
    const { error: errDel } = await supabase.from("recordatorios").delete().in("id", chunk);
    if (errDel) {
      console.error("[sync-birthday-reminders] delete:", errDel);
      return { statusCode: 500, body: JSON.stringify({ error: errDel.message }) };
    }
    deleted += chunk.length;
  }

  const summary = {
    ok: true,
    hoy: hoy,
    pensionados: lista.length,
    upserted: upserted,
    deleted: deleted,
  };
  console.log("[sync-birthday-reminders] Listo:", summary);

  return {
    statusCode: 200,
    body: JSON.stringify(summary),
  };
};
