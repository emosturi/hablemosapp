/**
 * Banner offline: estado de red, pendientes, sincronización y navegación local.
 */
(function (global) {
  var wired = false;
  var currentSupabase = null;
  var currentUserId = null;

  function pendingCount() {
    if (!global.prevyOfflineStore) return Promise.resolve(0);
    return global.prevyOfflineStore.countPending();
  }

  function updateBanner() {
    var bar = global.document.getElementById("prevy-offline-bar");
    if (!bar) return;
    var online = global.prevyOfflineIsOnline && global.prevyOfflineIsOnline();
    global.document.documentElement.setAttribute("data-prevy-offline", online ? "0" : "1");
    var nav = bar.querySelector(".prevy-offline-nav");
    if (nav) nav.style.display = online ? "none" : "flex";
    pendingCount().then(function (n) {
      var msg = bar.querySelector(".prevy-offline-msg");
      var btn = bar.querySelector(".prevy-offline-sync-btn");
      if (!msg) return;
      if (!online) {
        bar.classList.add("is-offline");
        msg.textContent =
          n > 0
            ? "Sin conexión — " + n + " cambio(s) guardado(s) en este dispositivo."
            : "Sin conexión — puedes ver y editar clientes cacheados.";
      } else if (n > 0) {
        bar.classList.add("is-offline");
        msg.textContent = n + " cambio(s) pendiente(s) de subir al servidor.";
      } else {
        bar.classList.remove("is-offline");
        msg.textContent = "";
      }
      if (btn) {
        btn.style.display = online && n > 0 ? "inline-block" : "none";
      }
      bar.style.display = !online || n > 0 ? "block" : "none";
    });
  }

  function ensureBanner() {
    if (global.document.getElementById("prevy-offline-bar")) return;
    var bar = global.document.createElement("div");
    bar.id = "prevy-offline-bar";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    bar.innerHTML =
      '<div class="prevy-offline-bar-inner">' +
      '<span class="prevy-offline-msg"></span>' +
      '<nav class="prevy-offline-nav" aria-label="Secciones offline">' +
      '<a href="/revisar-clientes.html">Clientes</a>' +
      '<a href="/pension.html">Nueva pensión</a>' +
      '<a href="/offline.html">Sin conexión</a>' +
      "</nav>" +
      '<button type="button" class="prevy-offline-sync-btn">Sincronizar ahora</button>' +
      "</div>";
    (global.document.body || global.document.documentElement).appendChild(bar);
    var btn = bar.querySelector(".prevy-offline-sync-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        if (!currentSupabase || !currentUserId) return;
        btn.disabled = true;
        btn.textContent = "Sincronizando…";
        global
          .prevyOfflineSyncPending(currentSupabase, currentUserId)
          .then(function (r) {
            if (r && r.errors && r.errors.length) {
              global.alert("Algunos cambios no se pudieron subir. Revisa la conexión e inténtalo de nuevo.");
            }
            return global.prevyOfflineRefreshCache(currentSupabase, currentUserId);
          })
          .finally(function () {
            btn.disabled = false;
            btn.textContent = "Sincronizar ahora";
            updateBanner();
          });
      });
    }
  }

  global.prevyOfflineUiAttach = function (supabase, userId) {
    currentSupabase = supabase;
    currentUserId = userId;
    ensureBanner();
    updateBanner();
    if (!wired) {
      wired = true;
      global.addEventListener("online", updateBanner);
      global.addEventListener("offline", updateBanner);
      global.addEventListener("prevy-offline-changed", updateBanner);
    }
    if (global.prevyOfflineInit) global.prevyOfflineInit(supabase, userId);
  };
})(window);
