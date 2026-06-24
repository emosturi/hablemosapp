/**
 * Panel UI para activar / re-registrar Web Push (Ayuda, Recordatorios, etc.).
 * Requiere pwa-push-register.js cargado antes o en paralelo.
 */
(function (global) {
  function qs(id, root) {
    return (root || document).getElementById(id);
  }

  /**
   * @param {{ accessToken: string, userId: string, panelId?: string, titleId?: string, detailId?: string, btnId?: string }} opts
   */
  global.prevyInitPushNotifyPanel = function (opts) {
    opts = opts || {};
    var accessToken = opts.accessToken;
    var userId = opts.userId;
    var panelId = opts.panelId || "pushNotifyPanel";
    var titleId = opts.titleId || "pushStatusTitle";
    var detailId = opts.detailId || "pushStatusDetail";
    var btnId = opts.btnId || "btnActivarPush";

    var panel = qs(panelId);
    var titleEl = qs(titleId);
    var detailEl = qs(detailId);
    var btn = qs(btnId);
    if (!panel || !detailEl || !accessToken || !userId) return;

    function setPanelState(kind, title, detail, showBtn) {
      panel.style.display = "block";
      panel.classList.remove("is-ok", "is-warn");
      if (kind) panel.classList.add(kind);
      if (titleEl && title) titleEl.textContent = title;
      detailEl.textContent = detail || "";
      if (btn) {
        btn.style.display = showBtn ? "inline-block" : "none";
        btn.disabled = false;
      }
    }

    function refreshPushStatus() {
      if (typeof global.prevyGetWebPushStatus !== "function") {
        setPanelState(
          "is-warn",
          "Notificaciones en este dispositivo",
          "Actualiza la app (recarga con «Actualizar» si aparece el aviso) para habilitar el registro push.",
          false
        );
        return;
      }
      global.prevyGetWebPushStatus().then(function (st) {
        if (!st.supported) {
          setPanelState(
            "is-warn",
            "Notificaciones no disponibles",
            "Este navegador no admite notificaciones push. Usa Chrome en Android o instala la PWA desde el menú del navegador.",
            false
          );
          return;
        }
        if (!st.hasVapid) {
          setPanelState(
            "is-warn",
            "Configuración incompleta",
            "Falta la clave pública VAPID en el cliente. Contacta a soporte.",
            false
          );
          return;
        }
        if (st.permission === "granted" && st.hasSubscription) {
          setPanelState(
            "is-ok",
            "Notificaciones activas en este dispositivo",
            "Recibirás avisos push además de Telegram. Si dejaron de llegar, pulsa el botón para volver a registrar este equipo.",
            true
          );
          if (btn) btn.textContent = "Volver a registrar este dispositivo";
          return;
        }
        if (st.permission === "denied") {
          setPanelState(
            "is-warn",
            "Notificaciones bloqueadas",
            "Debes permitir notificaciones en Ajustes del sitio (icono del candado o «i» en la barra de direcciones) y luego pulsar el botón.",
            true
          );
          if (btn) btn.textContent = "Activar notificaciones en este dispositivo";
          return;
        }
        setPanelState(
          "is-warn",
          "Notificaciones no activadas",
          "Activa los avisos en este teléfono o tablet para recibir recordatorios aunque no abras Telegram.",
          true
        );
        if (btn) btn.textContent = "Activar notificaciones en este dispositivo";
      });
    }

    refreshPushStatus();

    if (!btn || btn.getAttribute("data-prevy-push-wired") === "1") return;
    btn.setAttribute("data-prevy-push-wired", "1");

    btn.addEventListener("click", function () {
      if (typeof global.prevyRegisterWebPush !== "function") return;
      btn.disabled = true;
      btn.textContent = "Registrando…";
      global
        .prevyRegisterWebPush(accessToken, userId, { force: true })
        .then(function (res) {
          if (res && res.ok) {
            setPanelState(
              "is-ok",
              "Notificaciones activas en este dispositivo",
              "Listo. Los próximos recordatorios también llegarán como push.",
              true
            );
            btn.textContent = "Volver a registrar este dispositivo";
            btn.disabled = false;
            return;
          }
          var reason = (res && res.reason) || "error";
          if (reason === "denied") {
            setPanelState(
              "is-warn",
              "Permiso denegado",
              "Ve a Ajustes del sitio → Notificaciones → Permitir, y vuelve a pulsar el botón.",
              true
            );
          } else if (reason === "dismissed") {
            setPanelState(
              "is-warn",
              "Permiso no concedido",
              "Debes aceptar el diálogo de notificaciones cuando aparezca.",
              true
            );
          } else {
            setPanelState(
              "is-warn",
              "No se pudo registrar",
              "Intenta de nuevo. Si usas Android, abre la app en Chrome (no en un navegador embebido).",
              true
            );
          }
          btn.textContent = "Activar notificaciones en este dispositivo";
          btn.disabled = false;
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = "Activar notificaciones en este dispositivo";
          refreshPushStatus();
        });
    });
  };
})(window);
