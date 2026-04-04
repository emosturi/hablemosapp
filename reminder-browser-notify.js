/**
 * Avisos del navegador cuando un recordatorio pasa a enviado=true (mismo momento que process-reminders / Telegram).
 * Requiere permiso de notificaciones; hace polling a Supabase y evita duplicados con localStorage por usuario.
 */
(function () {
  var POLL_MS = 52000;
  var STORAGE_PREFIX = "prevy_reminder_seen_v1:";

  var intervalId = null;
  var lastSupabase = null;
  var lastUserId = null;
  var bootstrapped = false;

  function todayChileYmd() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  }

  function seenStorageKey(uid) {
    return STORAGE_PREFIX + uid;
  }

  function loadSeenSet(uid) {
    try {
      var raw = localStorage.getItem(seenStorageKey(uid));
      if (!raw) return {};
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return {};
      var o = {};
      arr.forEach(function (id) {
        if (id) o[String(id)] = true;
      });
      return o;
    } catch (_e) {
      return {};
    }
  }

  function saveSeenSet(uid, map) {
    try {
      var keys = Object.keys(map);
      if (keys.length > 300) keys = keys.slice(-300);
      localStorage.setItem(seenStorageKey(uid), JSON.stringify(keys));
    } catch (_e) {}
  }

  function stopPolling() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    bootstrapped = false;
  }

  function playBeep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.24);
    } catch (_e) {}
  }

  function showReminderNotification(row) {
    var id = row.id;
    var cliente = (row.cliente_nombre || "").trim();
    var msg = (row.mensaje || "").trim();
    var hora = (row.hora || "").trim();
    var title = "Recordatorio Prevy";
    var body = msg || "Tienes un recordatorio.";
    if (cliente) body = cliente + (body ? " — " + body : "");
    if (hora) {
      var ht = hora.length >= 5 ? hora.slice(0, 5) : hora;
      body = ht + " · " + body;
    }
    if (body.length > 180) body = body.slice(0, 178) + "…";

    var opts = {
      body: body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "prevy-reminder-" + id,
      renotify: true,
      silent: false,
      data: { url: "/recordatorios.html" },
    };

    function fallbackNotification() {
      try {
        return new Notification(title, opts);
      } catch (_e) {
        return null;
      }
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then(function (reg) {
          if (reg && typeof reg.showNotification === "function") return reg.showNotification(title, opts);
          return fallbackNotification();
        })
        .catch(function () {
          fallbackNotification();
        });
    } else {
      fallbackNotification();
    }

    playBeep();
  }

  function poll() {
    var supabase = lastSupabase;
    var uid = lastUserId;
    if (!supabase || !uid || typeof window.Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    var today = todayChileYmd();
    supabase
      .from("recordatorios")
      .select("id, cliente_nombre, mensaje, hora")
      .eq("user_id", uid)
      .eq("fecha", today)
      .eq("enviado", true)
      .then(function (res) {
        if (res.error || !res.data) return;
        var seen = loadSeenSet(uid);
        var rows = res.data;
        if (!bootstrapped) {
          rows.forEach(function (r) {
            if (r && r.id) seen[String(r.id)] = true;
          });
          saveSeenSet(uid, seen);
          bootstrapped = true;
          return;
        }
        rows.forEach(function (r) {
          if (!r || !r.id) return;
          var sid = String(r.id);
          if (seen[sid]) return;
          seen[sid] = true;
          saveSeenSet(uid, seen);
          showReminderNotification(r);
        });
      });
  }

  function startPolling() {
    stopPolling();
    if (typeof window.Notification === "undefined" || Notification.permission !== "granted") return;
    intervalId = setInterval(poll, POLL_MS);
    poll();
  }

  window.initReminderBrowserNotify = function (supabase, userId) {
    if (!userId || !supabase) return;
    if (typeof window.Notification === "undefined") return;
    lastSupabase = supabase;
    lastUserId = userId;
    stopPolling();
    if (Notification.permission === "granted") startPolling();
  };

  window.prevyRequestReminderNotifications = function () {
    if (typeof window.Notification === "undefined") {
      return Promise.resolve("unsupported");
    }
    return Notification.requestPermission().then(function (perm) {
      if (perm === "granted" && lastSupabase && lastUserId) {
        startPolling();
      }
      return perm;
    });
  };

  window.__prevyReminderNotifyCleanup = function () {
    stopPolling();
    lastSupabase = null;
    lastUserId = null;
  };
})();
