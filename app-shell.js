/**
 * Menú móvil del shell y cabecera de usuario.
 * Tras obtener sesión: initAppShell(); applyAppShellUser(session.user);
 * Invitado (p. ej. clientes.html): setAppShellGuest(true);
 */
(function () {
  (function injectPwaHead() {
    try {
      var theme = "#00696c";
      if (!document.querySelector('meta[name="theme-color"]')) {
        var tc = document.createElement("meta");
        tc.setAttribute("name", "theme-color");
        tc.setAttribute("content", theme);
        document.head.appendChild(tc);
      }
      if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
        var cap = document.createElement("meta");
        cap.setAttribute("name", "apple-mobile-web-app-capable");
        cap.setAttribute("content", "yes");
        document.head.appendChild(cap);
      }
      if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) {
        var st = document.createElement("meta");
        st.setAttribute("name", "apple-mobile-web-app-status-bar-style");
        st.setAttribute("content", "default");
        document.head.appendChild(st);
      }
      if (!document.querySelector('link[rel="manifest"]')) {
        var l = document.createElement("link");
        l.rel = "manifest";
        l.href = "/manifest.webmanifest";
        document.head.appendChild(l);
      }
      if (!document.querySelector('link[rel="apple-touch-icon"]')) {
        var at = document.createElement("link");
        at.rel = "apple-touch-icon";
        at.href = "/icons/icon-192.png";
        document.head.appendChild(at);
      }
    } catch (_e) {}
  })();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function pwaSwLoad() {
      window.removeEventListener("load", pwaSwLoad);
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {});
    });
  }

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

  /** Chat soporte: no login ni landings /www ni /prevy-landing/ */
  function prevyShouldShowSupportChatShell(file, pathname) {
    file = (file || "").split("?")[0].toLowerCase();
    pathname = pathname || "";
    if (file === "login.html") return false;
    if (file === "admin-panel.html") return false;
    if (pathname.indexOf("/www/") !== -1) return false;
    if (pathname.indexOf("/prevy-landing/") !== -1) return false;
    return true;
  }

  function prevyLoadSupportChatOnce(supabase, uid, isOwner, accessToken, file) {
    if (!prevyShouldShowSupportChatShell(file, window.location.pathname || "")) return;
    if (!uid || !accessToken) return;
    if (window.prevySupportChatBootstrapped) return;
    window.prevySupportChatBootstrapped = true;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "support-chat-widget.css";
    document.head.appendChild(link);
    var s = document.createElement("script");
    s.src = "support-chat-widget.js";
    s.async = true;
    s.onload = function () {
      if (typeof window.prevyInitSupportChat === "function") {
        window.prevyInitSupportChat(supabase, uid, !!isOwner, accessToken);
      }
    };
    document.body.appendChild(s);
  }

  function removePrevyShellBannerNodes() {
    document.querySelectorAll(".prevy-float-sub-wrap, #prevyTelegramSetupBar").forEach(function (n) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    if (!document.querySelector(".prevy-float-sub-wrap")) {
      document.body.classList.remove("prevy-has-float-sub");
    }
  }

  function clearPrevyShellBannerState() {
    removePrevyShellBannerNodes();
    try {
      delete window.PREVY_SYNC_SUBSCRIPTION;
      delete window.PREVY_TELEGRAM_LINKED;
      delete window.PREVY_TELEGRAM_REMINDERS_ENABLED;
      delete window.PREVY_SHOW_TELEGRAM_CONFIGURE_CTA;
    } catch (eClr) {}
  }

  window.prevyRemoveShellBanners = clearPrevyShellBannerState;

  function wholeDaysRemainingFromIso(iso) {
    if (!iso) return null;
    var t = new Date(iso).getTime();
    if (isNaN(t)) return null;
    var ms = t - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / 86400000);
  }

  function renderPrevyShellBanners(file, j) {
    removePrevyShellBannerNodes();
    if (!j || j.ok !== true) return;

    window.PREVY_SYNC_SUBSCRIPTION = j;
    window.PREVY_TELEGRAM_LINKED = j.telegram_linked === true;
    window.PREVY_TELEGRAM_REMINDERS_ENABLED = j.telegram_reminders_enabled !== false;
    window.PREVY_SHOW_TELEGRAM_CONFIGURE_CTA = j.show_telegram_configure_cta === true;

    var base = (file || "").split("?")[0].trim();
    var st = j.subscription_status;
    var bypass = j.subscription_bypass === true;
    var lock = j.lock_navigation === true;
    var payHref = "mi-suscripcion.html";

    function attachFloatClose(wrap) {
      var btn = wrap.querySelector(".prevy-float-sub-close");
      if (btn) {
        btn.addEventListener("click", function () {
          if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
          if (!document.querySelector(".prevy-float-sub-wrap")) {
            document.body.classList.remove("prevy-has-float-sub");
          }
        });
      }
    }

    if (!bypass && st === "trial" && j.current_period_end && !lock) {
      var dTr = wholeDaysRemainingFromIso(j.current_period_end);
      if (dTr !== null) {
        var dText =
          dTr === 0 ? "menos de 1 día" : dTr === 1 ? "1 día" : String(dTr) + " días";
        var wrap = document.createElement("div");
        wrap.className = "prevy-float-sub-wrap prevy-float-sub-trial";
        wrap.setAttribute("role", "status");
        wrap.innerHTML =
          '<div class="prevy-float-sub-inner"><div class="prevy-float-sub-body">' +
          "<p><strong>Versión de prueba (7 días).</strong> Estás usando Prevy en periodo de prueba; algunas funciones pueden estar limitadas o cambiar.</p>" +
          '<p class="prevy-float-sub-meta">Te quedan aproximadamente <strong>' +
          dText +
          "</strong> de prueba. Después necesitarás suscribirte para seguir usando la plataforma.</p>" +
          '</div><button type="button" class="prevy-float-sub-close" aria-label="Cerrar aviso">&times;</button></div>';
        document.body.appendChild(wrap);
        document.body.classList.add("prevy-has-float-sub");
        attachFloatClose(wrap);
      }
    } else if (!bypass && st === "past_due" && j.subscription_grace_until) {
      var dM = wholeDaysRemainingFromIso(j.subscription_grace_until);
      if (dM !== null) {
        var dMText =
          dM === 0 ? "menos de 24 horas" : dM === 1 ? "1 día" : String(dM) + " días";
        var wrapM = document.createElement("div");
        wrapM.className = "prevy-float-sub-wrap prevy-float-sub-mora";
        wrapM.setAttribute("role", "alert");
        wrapM.innerHTML =
          '<div class="prevy-float-sub-inner"><div class="prevy-float-sub-body">' +
          "<p><strong>Suscripción vencida.</strong> Tu período pagado finalizó; renueva para mantener el acceso completo.</p>" +
          '<p class="prevy-float-sub-meta">Quedan <strong>' +
          dMText +
          "</strong> antes de que tu cuenta pase a acceso restringido (solo pago y soporte).</p>" +
          '<p class="prevy-float-sub-actions"><a class="prevy-float-sub-cta" href="' +
          payHref +
          '">Pagar aquí</a></p></div><button type="button" class="prevy-float-sub-close" aria-label="Cerrar aviso">&times;</button></div>';
        document.body.appendChild(wrapM);
        document.body.classList.add("prevy-has-float-sub");
        attachFloatClose(wrapM);
      }
    }

    if (
      (base === "recordatorios.html" || base === "mi-agenda-llamadas.html") &&
      j.telegram_reminders_enabled !== false &&
      j.show_telegram_configure_cta !== true
    ) {
      var content = document.querySelector(".layout .main .content");
      if (content && !document.getElementById("prevyTelegramSetupBar")) {
        var tBar = document.createElement("div");
        tBar.id = "prevyTelegramSetupBar";
        var tgLinked = j.telegram_linked === true;
        tBar.className =
          "prevy-telegram-setup-bar " +
          (tgLinked ? "prevy-telegram-setup-bar-ok" : "prevy-telegram-setup-bar-missing");
        tBar.setAttribute("role", tgLinked ? "status" : "alert");
        tBar.innerHTML = tgLinked
          ? '<p><strong>Tu Telegram ya está configurado.</strong></p><p class="prevy-telegram-setup-actions"><a class="prevy-telegram-setup-btn" href="configuracion-telegram.html">Configuración Telegram</a></p>'
          : '<p><strong>Configura Telegram para recibir recordatorios.</strong></p><p class="prevy-telegram-setup-actions"><a class="prevy-telegram-setup-btn" href="configuracion-telegram.html">Ir a configuración Telegram</a></p>';
        var first = content.firstElementChild;
        if (first) content.insertBefore(tBar, first);
        else content.appendChild(tBar);
      }
    }
  }

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

    function ensureAyudaMenuLink(show) {
      var userMenu = qs("userMenuDd");
      if (!userMenu) return;
      var existing = userMenu.querySelector("a[data-ayuda-menu='1'], a[href='ayuda.html']");
      if (!show) {
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        return;
      }
      var active = window.location && /ayuda\.html(?:\?|$)/.test(window.location.pathname || "");
      if (existing) {
        existing.setAttribute("data-ayuda-menu", "1");
        existing.classList.toggle("active", active);
        if (active) existing.setAttribute("aria-current", "page");
        else existing.removeAttribute("aria-current");
        return;
      }
      var anchorBefore = userMenu.querySelector(".user-menu-theme");
      var a = document.createElement("a");
      a.href = "ayuda.html";
      a.textContent = "Ayuda";
      a.className = "user-menu-item";
      a.setAttribute("role", "menuitem");
      a.setAttribute("data-ayuda-menu", "1");
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
      function isOwnerMenuAnchor(el) {
        if (!el || el.tagName !== "A") return false;
        if (el.getAttribute("data-owner-menu") === "1") return true;
        var raw = (el.getAttribute("href") || "").trim();
        if (/admin-panel\.html([\?#]|$)/i.test(raw) || raw === "admin-panel.html") return true;
        try {
          var u = new URL(el.href, window.location.href || undefined);
          if (/admin-panel\.html$/i.test(u.pathname) || /\/admin-panel\.html$/i.test(u.pathname)) return true;
        } catch (_e) {}
        return false;
      }

      function upsertLink(container) {
        if (!container) return;
        var matches = Array.prototype.slice.call(container.querySelectorAll("a")).filter(isOwnerMenuAnchor);
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
          var active = window.location && /admin-panel\.html(?:\?|$)/.test(window.location.pathname || "");
          keep.classList.toggle("active", active);
          if (active) keep.setAttribute("aria-current", "page");
          else keep.removeAttribute("aria-current");
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
      window.PREVY_SUB_LOCK_CANCELED = false;
      var layout = document.querySelector(".layout");
      if (layout) layout.classList.remove("sub-lock-canceled");
      document.documentElement.classList.remove("sub-lock-canceled");
      var b = document.getElementById("prevySubLockBanner");
      if (b && b.parentNode) b.parentNode.removeChild(b);
    }

    function applySubscriptionShellLock() {
      window.PREVY_SUB_LOCK_CANCELED = true;
      var layout = document.querySelector(".layout");
      if (layout) layout.classList.add("sub-lock-canceled");
      document.documentElement.classList.add("sub-lock-canceled");
      var main = document.querySelector(".layout .main");
      if (main && !document.getElementById("prevySubLockBanner")) {
        var bar = document.createElement("div");
        bar.id = "prevySubLockBanner";
        bar.className = "prevy-sub-lock-banner";
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
      "configuracion-telegram.html": true,
      "mis-tickets.html": true,
      "revisar-clientes.html": true,
      "ayuda.html": true,
    };

    function redirectIfSubscriptionLocked(file) {
      var base = (file || "").split("?")[0] || "";
      if (!window.PREVY_SUB_LOCK_CANCELED) return;
      if (SUB_LOCK_ALLOWED_PAGES[base]) return;
      window.location.replace("dashboard.html");
    }

    var guardResolve;
    var guardSettled = false;
    window.__subscriptionGuardPromise = new Promise(function (resolve) {
      guardResolve = resolve;
    });
    window.__prevyWhenSubscriptionReady = function () {
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
        ensureAyudaMenuLink(false);
        clearSubscriptionShellLock();
        clearPrevyShellBannerState();
        finishSubscriptionGuard();
        return;
      }

      var skipAccountGuard = file === "login.html" || file === "cuenta-suspendida.html";
      var shellIsOwner = false;

      supabase
        .from("platform_owners")
        .select("user_id")
        .eq("user_id", uid)
        .maybeSingle()
        .then(function (res) {
          var isOwner = !!(res && !res.error && res.data && res.data.user_id);
          shellIsOwner = isOwner;
          ensureAdvisorTicketsMenuLink(!isOwner);
          ensureOwnerMenuLink(isOwner);
          ensureAyudaMenuLink(true);

          if (skipAccountGuard || isOwner) {
            clearSubscriptionShellLock();
            clearPrevyShellBannerState();
            finishSubscriptionGuard();
            prevyLoadSupportChatOnce(supabase, uid, isOwner, token, file);
            return Promise.resolve(null);
          }

          if (!token) {
            clearSubscriptionShellLock();
            clearPrevyShellBannerState();
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
            clearPrevyShellBannerState();
            finishSubscriptionGuard();
            prevyLoadSupportChatOnce(supabase, uid, shellIsOwner, token, file);
            return;
          }

          if (j.account_enabled === false) {
            clearPrevyShellBannerState();
            window.location.replace("cuenta-suspendida.html");
            return;
          }

          if (j.subscription_bypass || !j.lock_navigation) {
            clearSubscriptionShellLock();
          } else {
            applySubscriptionShellLock();
            redirectIfSubscriptionLocked(file);
          }
          renderPrevyShellBanners(file, j);
          finishSubscriptionGuard();
          prevyLoadSupportChatOnce(supabase, uid, shellIsOwner, token, file);
        })
        .catch(function () {
          ensureOwnerMenuLink(false);
          ensureAyudaMenuLink(true);
          clearSubscriptionShellLock();
          clearPrevyShellBannerState();
          finishSubscriptionGuard();
          prevyLoadSupportChatOnce(supabase, uid, shellIsOwner, token, file);
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
      if (
        q.indexOf("tutorial") !== -1 ||
        q.indexOf("guía") !== -1 ||
        q.indexOf("guia") !== -1 ||
        q.indexOf("faq") !== -1 ||
        q.indexOf("pregunt") !== -1 ||
        q.indexOf("manual") !== -1
      ) {
        window.location.href = "ayuda.html";
        return;
      }
      if (q.indexOf("ayuda") !== -1) {
        window.location.href = "ayuda.html";
        return;
      }
      if (q.indexOf("ticket") !== -1 || q.indexOf("soporte") !== -1) {
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
