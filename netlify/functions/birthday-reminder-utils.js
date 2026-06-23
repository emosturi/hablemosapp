/**
 * Cumpleaños de pensionados y cónyuges → filas en recordatorios.
 * 29 de febrero → aniversario el 28 de febrero.
 */

const { addDaysYMD, hoyChile } = require("./recordatorio-hora-chile");

const BIRTHDAY_HORA = "10:00";
const AUTO_KEY_PENSIONADO_1D = "birthday_pensionado_1d";
const AUTO_KEY_CONYUGE_7D = "birthday_conyuge_7d";
const AUTO_KEY_CONYUGE_1D = "birthday_conyuge_1d";
const ALL_BIRTHDAY_AUTO_KEYS = [AUTO_KEY_PENSIONADO_1D, AUTO_KEY_CONYUGE_7D, AUTO_KEY_CONYUGE_1D];

function parseIsoDateOnly(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().split("T")[0];
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return s;
}

/** Mes/día de aniversario; 29-feb → 28-feb. */
function birthMonthDayFromIso(iso) {
  const p = parseIsoDateOnly(iso);
  if (!p) return null;
  const parts = p.split("-").map(Number);
  let month = parts[1];
  let day = parts[2];
  if (month === 2 && day === 29) day = 28;
  return { month: month, day: day };
}

function birthdayIsoInYear(year, birthIso) {
  const md = birthMonthDayFromIso(birthIso);
  if (!md) return null;
  return (
    String(year) +
    "-" +
    String(md.month).padStart(2, "0") +
    "-" +
    String(md.day).padStart(2, "0")
  );
}

function fmtDMY(iso) {
  const p = parseIsoDateOnly(iso);
  if (!p) return "";
  const parts = p.split("-");
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

function nombreCompletoDesdePartes(nombres, apPat, apMat) {
  return [nombres, apPat, apMat]
    .map(function (x) {
      return x != null ? String(x).trim() : "";
    })
    .filter(Boolean)
    .join(" ");
}

function nombrePensionado(cliente) {
  const n = nombreCompletoDesdePartes(
    cliente.nombres,
    cliente.apellido_paterno,
    cliente.apellido_materno
  );
  return n || "Pensionado/a";
}

function primerBeneficiarioConyuge(solicitudBeneficiarios) {
  const fb = solicitudBeneficiarios;
  if (!fb || !Array.isArray(fb)) return null;
  for (let i = 0; i < fb.length; i++) {
    const b = fb[i];
    const p = String((b && b.parentesco) || "").toLowerCase();
    if (p === "cónyuge" || p === "conyuge" || p.indexOf("conviviente") !== -1) return b;
  }
  return null;
}

function resolverConyuge(cliente) {
  const benef = primerBeneficiarioConyuge(cliente.solicitud_beneficiarios);
  let fnac = parseIsoDateOnly(cliente.conyuge_fecha_nacimiento);
  if (!fnac && benef) {
    fnac = parseIsoDateOnly(benef.fecha_nacimiento || benef.fechaNacimiento);
  }
  if (!fnac) return null;

  const nombre = nombreCompletoDesdePartes(
    cliente.conyuge_nombres || (benef && benef.nombres),
    cliente.conyuge_apellido_paterno || (benef && (benef.apellido_paterno || benef.apellidoPaterno)),
    cliente.conyuge_apellido_materno || (benef && (benef.apellido_materno || benef.apellidoMaterno))
  );
  if (!nombre) return null;

  return { fechaNacimiento: fnac, nombre: nombre };
}

/**
 * Próxima fecha de aviso (días antes del cumpleaños) en o después de hoy.
 * @returns {{ reminderDate: string, birthdayDate: string } | null}
 */
function nextReminderSchedule(hoyIso, birthIso, daysBefore) {
  const birth = parseIsoDateOnly(birthIso);
  if (!birth || !birthMonthDayFromIso(birth)) return null;

  let year = parseInt(String(hoyIso).slice(0, 4), 10);
  if (!Number.isFinite(year)) return null;

  let birthdayDate = birthdayIsoInYear(year, birth);
  let reminderDate = addDaysYMD(birthdayDate, -daysBefore);

  while (reminderDate < hoyIso) {
    year += 1;
    birthdayDate = birthdayIsoInYear(year, birth);
    if (!birthdayDate) return null;
    reminderDate = addDaysYMD(birthdayDate, -daysBefore);
  }

  return { reminderDate: reminderDate, birthdayDate: birthdayDate };
}

function buildBirthdayReminderRows(cliente, hoyIso, enviadoByKey) {
  if (!cliente || cliente.pensionado !== true) return [];

  const userId = cliente.user_id;
  const clienteId = cliente.id;
  if (!userId || !clienteId) return [];

  const nombrePen = nombrePensionado(cliente);
  const tel = (cliente.telefono || "").toString().trim() || null;
  const rows = [];
  const envMap = enviadoByKey || {};

  function pushRow(autoKey, reminderDate, birthdayDate, mensaje, clienteNombreDisplay) {
    const prev = envMap[autoKey];
    const enviado =
      prev && prev.fecha === reminderDate && (prev.enviado === true || prev.enviado === "true")
        ? true
        : false;

    rows.push({
      user_id: userId,
      cliente_id: clienteId,
      cliente_nombre: clienteNombreDisplay,
      cliente_telefono: tel,
      fecha: reminderDate,
      hora: BIRTHDAY_HORA,
      mensaje: mensaje,
      enviado: enviado,
      auto_generado: true,
      auto_key: autoKey,
    });
  }

  const fnacPen = parseIsoDateOnly(cliente.fecha_nacimiento);
  if (fnacPen) {
    const sch = nextReminderSchedule(hoyIso, fnacPen, 1);
    if (sch) {
      pushRow(
        AUTO_KEY_PENSIONADO_1D,
        sch.reminderDate,
        sch.birthdayDate,
        "[AUTO] Mañana es el cumpleaños de " +
          nombrePen +
          " (pensionado/a). Fecha de cumpleaños: " +
          fmtDMY(sch.birthdayDate) +
          ".",
        nombrePen
      );
    }
  }

  const cony = resolverConyuge(cliente);
  if (cony && cony.fechaNacimiento) {
    const sch7 = nextReminderSchedule(hoyIso, cony.fechaNacimiento, 7);
    if (sch7) {
      pushRow(
        AUTO_KEY_CONYUGE_7D,
        sch7.reminderDate,
        sch7.birthdayDate,
        "[AUTO] En una semana será el cumpleaños del cónyuge de " +
          nombrePen +
          ": " +
          cony.nombre +
          ". Fecha de cumpleaños: " +
          fmtDMY(sch7.birthdayDate) +
          ".",
        "Cónyuge: " + cony.nombre
      );
    }

    const sch1 = nextReminderSchedule(hoyIso, cony.fechaNacimiento, 1);
    if (sch1) {
      pushRow(
        AUTO_KEY_CONYUGE_1D,
        sch1.reminderDate,
        sch1.birthdayDate,
        "[AUTO] Mañana es el cumpleaños del cónyuge de " +
          nombrePen +
          ": " +
          cony.nombre +
          ". Fecha de cumpleaños: " +
          fmtDMY(sch1.birthdayDate) +
          ".",
        "Cónyuge: " + cony.nombre
      );
    }
  }

  return rows;
}

/** Claves de cumpleaños que deberían existir para este cliente. */
function expectedBirthdayKeysForCliente(cliente) {
  const keys = [];
  if (!cliente || cliente.pensionado !== true) return keys;

  if (parseIsoDateOnly(cliente.fecha_nacimiento)) {
    keys.push(AUTO_KEY_PENSIONADO_1D);
  }
  const cony = resolverConyuge(cliente);
  if (cony && cony.fechaNacimiento) {
    keys.push(AUTO_KEY_CONYUGE_7D, AUTO_KEY_CONYUGE_1D);
  }
  return keys;
}

module.exports = {
  BIRTHDAY_HORA,
  AUTO_KEY_PENSIONADO_1D,
  AUTO_KEY_CONYUGE_7D,
  AUTO_KEY_CONYUGE_1D,
  ALL_BIRTHDAY_AUTO_KEYS,
  hoyChile,
  parseIsoDateOnly,
  birthMonthDayFromIso,
  birthdayIsoInYear,
  fmtDMY,
  nombrePensionado,
  resolverConyuge,
  nextReminderSchedule,
  buildBirthdayReminderRows,
  expectedBirthdayKeysForCliente,
};
