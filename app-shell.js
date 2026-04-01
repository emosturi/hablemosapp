/**
 * Menú móvil del shell y cabecera de usuario.
 * Tras obtener sesión: initAppShell(); applyAppShellUser(session.user);
 * Invitado (p. ej. clientes.html): setAppShellGuest(true);
 */
(function () {
  function qs(id) {
    return document.getElementById(id);
  }

  function syncMobileMenuTriggerAria(open) {
    var t = qs("menuMobileTrigger");
    if (!t) return;
    t.setAttribute("aria-expanded", open ? "true" : "false");
    t.setAttribute("aria-label", open ? "Cerrar menú de navegación" : "Abrir menú de navegación");
  }

  function closeMobileMenu() {
    var d = qs("menuMobileDd");
    if (d) d.classList.remove("open");
    syncMobileMenuTriggerAria(false);
  }

  function closeUserMenu() {
    var ut = qs("userMenuTrigger");
    var ud = qs("userMenuDd");
    if (ud) ud.classList.remove("open");
    if (ut) ut.setAttribute("aria-expanded", "false");
  }

  function closeMobileSearchExpand() {
    var bar = document.querySelector("header.topbar");
    var btn = qs("topbarSearchToggle");
    if (bar) bar.classList.remove("topbar-search-open");
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Buscar en la app");
    }
  }

  window.initAppShell = function () {
    var t = qs("menuMobileTrigger");
    var d = qs("menuMobileDd");
    if (t && d) {
      syncMobileMenuTriggerAria(false);
      t.addEventListener("click", function (e) {
        e.stopPropagation();
        closeUserMenu();
        closeMobileSearchExpand();
        var open = !d.classList.contains("open");
        d.classList.toggle("open", open);
        syncMobileMenuTriggerAria(open);
      });
    }

    var ut = qs("userMenuTrigger");
    var ud = qs("userMenuDd");
    if (ut && ud) {
      ut.addEventListener("click", function (e) {
        e.stopPropagation();
        closeMobileMenu();
        closeMobileSearchExpand();
        var open = !ud.classList.contains("open");
        ud.classList.toggle("open", open);
        ut.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    var searchToggle = qs("topbarSearchToggle");
    var topbar = document.querySelector("header.topbar");
    var searchInput = qs("appShellSearch");
    var searchWrap =
      topbar && searchInput && searchInput.closest ? searchInput.closest(".search-wrap") : null;
    if (searchToggle && topbar && searchInput) {
      searchToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        closeMobileMenu();
        closeUserMenu();
        var open = !topbar.classList.contains("topbar-search-open");
        topbar.classList.toggle("topbar-search-open", open);
        searchToggle.setAttribute("aria-expanded", open ? "true" : "false");
        searchToggle.setAttribute("aria-label", open ? "Cerrar búsqueda" : "Buscar en la app");
        if (open) {
          setTimeout(function () {
            searchInput.focus();
          }, 0);
        }
      });
    }
    if (searchWrap) {
      searchWrap.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }

    document.addEventListener("click", function () {
      closeMobileMenu();
      closeUserMenu();
      closeMobileSearchExpand();
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
    var btn = qs("btnCerrarSesionMenu");
    if (!supabase) return;

    function ensureAdvisorTicketsMenuLink(show) {
      var userMenu = qs("userMenuDd");
      if (!userMenu) return;
      var existing = userMenu.querySelector("a[data-advisor-tickets='1'], a[href='mis-tickets.html']");
      if (!show) {
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        return;
      }
      if (existing) return;
      var anchorBefore = userMenu.querySelector(".user-menu-theme");
      var a = document.createElement("a");
      a.href = "mis-tickets.html";
      a.textContent = "Soporte";
      a.className = "user-menu-item";
      a.setAttribute("role", "menuitem");
      a.setAttribute("data-advisor-tickets", "1");
      var active = window.location && /mis-tickets\.html(?:\?|$)/.test(window.location.pathname || "");
      if (active) {
        a.classList.add("active");
        a.setAttribute("aria-current", "page");
      }
      if (anchorBefore && anchorBefore.parentNode === userMenu) {
        userMenu.insertBefore(a, anchorBefore);
      } else {
        userMenu.appendChild(a);
      }
    }

    function ensureOwnerMenuLink(isOwner) {
      function upsertLink(container) {
        if (!container) return;
        var existing = container.querySelector("a[data-owner-menu='1']");
        if (!isOwner) {
          if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
          return;
        }
        if (existing) return;
        var a = document.createElement("a");
        a.href = "admin-panel.html";
        a.textContent = "Panel owner";
        a.setAttribute("data-owner-menu", "1");
        var active = window.location && /admin-panel\.html(?:\?|$)/.test(window.location.pathname || "");
        if (active) a.classList.add("active");
        container.appendChild(a);
      }

      var sidebars = document.querySelectorAll(".sidebar");
      sidebars.forEach(function (sb) { upsertLink(sb); });
      var mobileDd = qs("menuMobileDd");
      upsertLink(mobileDd);
    }

    function currentHtmlFile() {
      var path = (window.location && window.location.pathname) || "";
      var parts = path.split("/");
      return parts[parts.length - 1] || "";
    }

    supabase.auth.getSession().then(function (r) {
      var uid = r && r.data && r.data.session && r.data.session.user && r.data.session.user.id;
      if (!uid) {
        ensureAdvisorTicketsMenuLink(false);
        ensureOwnerMenuLink(false);
        return;
      }

      var file = currentHtmlFile();
      var skipAccountGuard = file === "login.html" || file === "cuenta-suspendida.html";

      supabase
        .from("platform_owners")
        .select("user_id")
        .eq("user_id", uid)
        .maybeSingle()
        .then(function (res) {
          var isOwner = !!(res && !res.error && res.data && res.data.user_id);
          ensureAdvisorTicketsMenuLink(!isOwner);
          ensureOwnerMenuLink(isOwner);

          if (skipAccountGuard || isOwner) return null;

          return supabase
            .from("asesor_cuentas")
            .select("account_enabled")
            .eq("user_id", uid)
            .maybeSingle();
        })
        .then(function (acctRes) {
          if (!acctRes) return;
          if (acctRes.error) return;
          var row = acctRes.data;
          if (row && row.account_enabled === false) {
            window.location.replace("cuenta-suspendida.html");
          }
        })
        .catch(function () {
          ensureOwnerMenuLink(false);
        });
    });

    if (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        supabase.auth.signOut().then(function () {
          window.location.href = "login.html";
        });
      });
    }
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
      if (q.indexOf("reserv") !== -1 && (q.indexOf("agenda") !== -1 || q.indexOf("llamad") !== -1)) {
        window.location.href = "mi-agenda-llamadas.html";
        return;
      }
      if (q.indexOf("agenda") !== -1 || q.indexOf("dispon") !== -1 || q.indexOf("llamad") !== -1) {
        window.location.href = "disponibilidad-asesor.html";
        return;
      }
      if (q.indexOf("record") !== -1 || q.indexOf("alert") !== -1) {
        window.location.href = "recordatorios.html";
        return;
      }
      if (q.indexOf("ticket") !== -1 || q.indexOf("soporte") !== -1 || q.indexOf("ayuda") !== -1) {
        window.location.href = "mis-tickets.html";
        return;
      }
      if (q.indexOf("client") !== -1 || q.indexOf("list") !== -1) {
        window.location.href = "revisar-clientes.html";
        return;
      }
      if (q.indexOf("form") !== -1 || q.indexOf("pens") !== -1) {
        window.location.href = "pension.html";
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
