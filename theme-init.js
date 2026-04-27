/**
 * Tema claro/oscuro: aplica antes del primer paint si va en <head>.
 * Persistencia: localStorage prevy_theme = "dark" | "light" (migra desde hablemosapp_theme).
 */
(function () {
  try {
    if (!document.getElementById("prevy-favicon")) {
      var fi = document.createElement("link");
      fi.id = "prevy-favicon";
      fi.rel = "icon";
      fi.type = "image/svg+xml";
      fi.href = "/icons/icon-512.svg";
      document.head.appendChild(fi);
    }
  } catch (_e) {}

  var KEY = "prevy_theme";
  var LEGACY_KEY = "hablemosapp_theme";

  function apply(mode) {
    if (mode === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }

  try {
    var stored = localStorage.getItem(KEY);
    if (stored !== "dark" && stored !== "light") {
      var leg = localStorage.getItem(LEGACY_KEY);
      if (leg === "dark" || leg === "light") {
        localStorage.setItem(KEY, leg);
        stored = leg;
      }
    }
    if (stored === "dark") apply("dark");
  } catch (e) {}

  function get() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function set(mode) {
    var dark = mode === "dark";
    apply(dark ? "dark" : "light");
    try {
      localStorage.setItem(KEY, dark ? "dark" : "light");
      localStorage.removeItem(LEGACY_KEY);
    } catch (err) {}
    try {
      var detail = { theme: dark ? "dark" : "light" };
      window.dispatchEvent(new CustomEvent("prevy-themechange", { detail: detail }));
      window.dispatchEvent(new CustomEvent("hablemosapp-themechange", { detail: detail }));
    } catch (err2) {}
  }

  function toggle() {
    set(get() === "dark" ? "light" : "dark");
  }

  function syncButton(btn) {
    if (!btn) return;
    var dark = get() === "dark";
    var label = dark ? "Modo claro" : "Modo oscuro";
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    btn.setAttribute("aria-label", label);
    var lab = btn.querySelector(".user-menu-theme-label");
    if (lab) {
      lab.textContent = label;
      btn.title = label;
      return;
    }
    btn.title = label;
  }

  function themeToggleButtons() {
    var list = [];
    var a = document.getElementById("btnThemeToggle");
    var b = document.getElementById("btnThemeTogglePublic");
    var c = document.getElementById("userMenuThemeToggle");
    if (a) list.push(a);
    if (b) list.push(b);
    if (c) list.push(c);
    return list;
  }

  function syncAllThemeButtons() {
    themeToggleButtons().forEach(syncButton);
  }

  function initThemeToggle() {
    themeToggleButtons().forEach(function (btn) {
      if (btn.getAttribute("data-theme-wired") === "1") return;
      btn.setAttribute("data-theme-wired", "1");
      syncButton(btn);
      btn.addEventListener("click", function () {
        toggle();
        syncAllThemeButtons();
      });
    });
    if (!window.__prevyThemeGlobalSync) {
      window.__prevyThemeGlobalSync = true;
      window.addEventListener("prevy-themechange", syncAllThemeButtons);
      window.addEventListener("hablemosapp-themechange", syncAllThemeButtons);
    }
  }

  var api = { get: get, set: set, toggle: toggle, init: initThemeToggle };
  window.prevyTheme = api;
  window.hablemosappTheme = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
