/**
 * Menú móvil del shell y cabecera de usuario.
 * Tras obtener sesión: initAppShell(); applyAppShellUser(session.user);
 * Invitado (p. ej. clientes.html): setAppShellGuest(true);
 */
(function () {
  function qs(id) {
    return document.getElementById(id);
  }

  window.initAppShell = function () {
    var t = qs("menuMobileTrigger");
    var d = qs("menuMobileDd");
    if (!t || !d) return;
    t.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !d.classList.contains("open");
      d.classList.toggle("open", open);
      t.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function () {
      d.classList.remove("open");
      t.setAttribute("aria-expanded", "false");
    });
  };

  window.applyAppShellUser = function (user) {
    if (!user) return;
    var email = user.email || "";
    var name =
      (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) ||
      (email ? email.split("@")[0] : "Asesor");
    var ne = qs("userEmail");
    var nn = qs("userDisplayName");
    var na = qs("userAvatar");
    if (ne) ne.textContent = email || "—";
    if (nn) nn.textContent = name;
    if (na) na.textContent = (String(name).charAt(0) || "?").toUpperCase();
  };

  window.setAppShellGuest = function (isGuest) {
    var layout = document.querySelector(".layout");
    if (layout) layout.classList.toggle("is-guest", !!isGuest);
  };

  window.wireAppShellLogout = function (supabase) {
    var btn = qs("btnCerrarSesionSidebar");
    if (!btn || !supabase) return;
    btn.addEventListener("click", function () {
      supabase.auth.signOut().then(function () {
        window.location.href = "login.html";
      });
    });
  };

  /** Búsqueda rápida en la barra superior (Enter). */
  window.initAppShellSearch = function () {
    var searchInput = qs("appShellSearch") || qs("dashSearch");
    if (!searchInput) return;
    searchInput.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var q = (searchInput.value || "").trim().toLowerCase();
      if (!q) return;
      if (q.indexOf("prospect") !== -1 || q.indexOf("poten") !== -1) {
        window.location.href = "clientes-potenciales.html";
        return;
      }
      if (q.indexOf("record") !== -1 || q.indexOf("alert") !== -1) {
        window.location.href = "recordatorios.html";
        return;
      }
      if (q.indexOf("client") !== -1 || q.indexOf("list") !== -1) {
        window.location.href = "revisar-clientes.html";
        return;
      }
      if (q.indexOf("form") !== -1 || q.indexOf("pens") !== -1) {
        window.location.href = "index.html";
        return;
      }
      if (q.indexOf("dash") !== -1 || q.indexOf("inicio") !== -1) {
        window.location.href = "dashboard.html";
        return;
      }
      window.location.href = "revisar-clientes.html";
    });
  };
})();
