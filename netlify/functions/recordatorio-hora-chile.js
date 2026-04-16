/**
 * Reglas de hora para recordatorios (zona America/Santiago, solo fecha/hora civil).
 * Agenda de llamadas: disparo 5 min antes de la hora guardada (mensaje fijo desde SQL).
 */

const AGENDA_LLAMADA_MSG_PREFIX = "Llamada telefónica agendada por la web.";

function hoyChile() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

function ahoraChileHHmm() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  let h = "00";
  let m = "00";
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].type === "hour") h = String(parts[i].value).padStart(2, "0");
    if (parts[i].type === "minute") m = String(parts[i].value).padStart(2, "0");
  }
  return h + ":" + m;
}

/** Suma días a YYYY-MM-DD (calendario civil vía UTC; suficiente para ventana ±1 día del cron). */
function addDaysYMD(ymd, deltaDays) {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function daysInMonth(y, month1to12) {
  return new Date(Date.UTC(y, month1to12, 0)).getUTCDate();
}

function normalizeHHMM(horaRaw) {
  const horaRecordatorio = (horaRaw || "").trim();
  if (!horaRecordatorio) return "";
  const rh = horaRecordatorio.split(":");
  return (rh[0] || "0").padStart(2, "0") + ":" + (rh[1] || "0").padStart(2, "0");
}

/**
 * Resta minutos a una fecha/hora civil (YYYY-MM-DD + HH:MM).
 * Cubre cruce a día anterior (p. ej. llamada 00:02 → aviso día anterior 23:57).
 */
function subtractMinutesFromFechaHora(fechaYMD, hhmm, minsToSubtract) {
  let [y, mo, d] = fechaYMD.split("-").map(Number);
  let [h, mi] = hhmm.split(":").map(Number);
  let totalMin = h * 60 + mi - minsToSubtract;
  while (totalMin < 0) {
    totalMin += 1440;
    d -= 1;
    if (d < 1) {
      mo -= 1;
      if (mo < 1) {
        mo = 12;
        y -= 1;
      }
      d = daysInMonth(y, mo);
    }
  }
  const th = Math.floor(totalMin / 60);
  const tmi = totalMin % 60;
  return {
    date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    hhmm: `${String(th).padStart(2, "0")}:${String(tmi).padStart(2, "0")}`,
  };
}

function isAgendaLlamadaRecordatorio(row) {
  const msg = (row && row.mensaje ? String(row.mensaje) : "").trim();
  return msg.startsWith(AGENDA_LLAMADA_MSG_PREFIX);
}

/**
 * ¿Debe enviarse ya por reloj Chile?
 * - Sin hora: sí (comportamiento histórico).
 * - Con hora: comparar umbral (agenda: cita − 5 min; resto: hora de la fila).
 * Solo filas cuyo umbral cae en `hoyChileStr` se consideran (resto: otro día).
 */
function recordatorioDebeEnviarPorHora(hoyChileStr, ahoraHHMM, row) {
  const horaRaw = row && row.hora != null ? row.hora : "";
  if (!String(horaRaw).trim()) {
    return { ok: true, reason: "sin_hora" };
  }
  const rNorm = normalizeHHMM(horaRaw);
  if (!rNorm) {
    return { ok: true, reason: "sin_hora" };
  }
  const offsetMin = isAgendaLlamadaRecordatorio(row) ? 5 : 0;
  const trig = subtractMinutesFromFechaHora(String(row.fecha || "").trim(), rNorm, offsetMin);
  if (trig.date !== hoyChileStr) {
    return { ok: false, reason: "umbral_otro_dia", umbral: trig, offsetMin };
  }
  if (trig.hhmm > ahoraHHMM) {
    return { ok: false, reason: "aun_no", umbral: trig, offsetMin };
  }
  return { ok: true, reason: "hora_ok", umbral: trig, offsetMin };
}

module.exports = {
  AGENDA_LLAMADA_MSG_PREFIX,
  hoyChile,
  ahoraChileHHmm,
  addDaysYMD,
  normalizeHHMM,
  subtractMinutesFromFechaHora,
  isAgendaLlamadaRecordatorio,
  recordatorioDebeEnviarPorHora,
};
