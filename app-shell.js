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
    var ut = qs("userMenuTrigger");
    if (ut) {
      var al = "Menú de cuenta: " + name;
      if (email) al += " (" + email + ")";
      ut.setAttribute("aria-label", al);
    }
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
        var matches = Array.prototype.slice.call(
          container.querySelectorAll("a[data-owner-menu='1'], a[href='admin-panel.html']")
        );
        if (!isOwner) {
          matches.forEach(function (n) {
            if (n && n.parentNode) n.parentNode.removeChild(n);
          });
          return;
        }
        if (matches.length > 0) {
          var keep = matches[0];
          for (var i = 1; i < matches.length; i += 1) {
            var dupe = matches[i];
            if (dupe && dupe.parentNode) dupe.parentNode.removeChild(dupe);
          }
          keep.setAttribute("data-owner-menu", "1");
          return;
        }
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

    function clearSubscriptionShellLock() {
      window.HABLEMOS_SUB_LOCK_CANCELED = false;
      var layout = document.querySelector(".layout");
      if (layout) layout.classList.remove("sub-lock-canceled");
      document.documentElement.classList.remove("sub-lock-canceled");
      var b = document.getElementById("hablemosSubLockBanner");
      if (b && b.parentNode) b.parentNode.removeChild(b);
    }

    function applySubscriptionShellLock() {
      window.HABLEMOS_SUB_LOCK_CANCELED = true;
      var layout = document.querySelector(".layout");
      if (layout) layout.classList.add("sub-lock-canceled");
      document.documentElement.classList.add("sub-lock-canceled");
      var main = document.querySelector(".layout .main");
      if (main && !document.getElementById("hablemosSubLockBanner")) {
        var bar = document.createElement("div");
        bar.id = "hablemosSubLockBanner";
        bar.className = "hablemos-sub-lock-banner";
        bar.setAttribute("role", "alert");
        bar.innerHTML =
          "<p><strong>Suscripción requerida.</strong> El acceso está limitado hasta que regularices el pago en <a href=\"mi-suscripcion.html\">Mi suscripción</a>.</p>";
        var content = main.querySelector(".content");
        if (content) main.insertBefore(bar, content);
        else main.insertBefore(bar, main.firstChild);
      }
    }

    var SUB_LOCK_ALLOWED_PAGES = {
      "dashboard.html": true,
      "mi-suscripcion.html": true,
      "mis-tickets.html": true,
      "revisar-clientes.html": true,
    };

    function redirectIfSubscriptionLocked(file) {
      var base = (file || "").split("?")[0] || "";
      if (!window.HABLEMOS_SUB_LOCK_CANCELED) return;
      if (SUB_LOCK_ALLOWED_PAGES[base]) return;
      window.location.replace("dashboard.html");
    }

    var guardResolve;
    var guardSettled = false;
    window.__subscriptionGuardPromise = new Promise(function (resolve) {
      guardResolve = resolve;
    });
    window.__hablemosWhenSubscriptionReady = function () {
      return window.__subscriptionGuardPromise || Promise.resolve();
    };

    function finishSubscriptionGuard() {
      if (guardSettled) return;
      guardSettled = true;
      try {
        if (typeof guardResolve === "function") guardResolve();
      } catch (eGuard) {}
    }

    supabase.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      var uid = session && session.user && session.user.id;
      var token = session && session.access_token;
      var file = currentHtmlFile();
      document.documentElement.setAttribute("data-shell-page", (file.split("?")[0] || "").trim());

      if (!uid) {
        ensureAdvisorTicketsMenuLink(false);
        ensureOwnerMenuLink(false);
        clearSubscriptionShellLock();
        finishSubscriptionGuard();
        return;
      }

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

          if (skipAccountGuard || isOwner) {
            clearSubscriptionShellLock();
            finishSubscriptionGuard();
            return Promise.resolve(null);
          }

          if (!token) {
            clearSubscriptionShellLock();
            finishSubscriptionGuard();
            return Promise.resolve(null);
          }

          return fetch(window.location.origin + "/.netlify/functions/advisor-subscription-sync", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "application/json",
            },
            body: "{}",
          }).then(function (res) {
            return res.json().then(function (j) {
              return { httpOk: res.ok, j: j };
            });
          });
        })
        .then(function (wrapped) {
          if (wrapped === null || wrapped === undefined) return;

          var j = wrapped.j;
          if (!wrapped.httpOk || !j || j.ok !== true) {
            clearSubscriptionShellLock();
            finishSubscriptionGuard();
            return;
          }

          if (j.account_enabled === false) {
            window.location.replace("cuenta-suspendida.html");
            return;
          }

          if (j.subscription_bypass || !j.lock_navigation) {
            clearSubscriptionShellLock();
          } else {
            applySubscriptionShellLock();
            redirectIfSubscriptionLocked(file);
          }
          finishSubscriptionGuard();
        })
        .catch(function () {
          ensureOwnerMenuLink(false);
          clearSubscriptionShellLock();
          finishSubscriptionGuard();
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
