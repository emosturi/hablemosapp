/**
 * Copia de /theme-init.js — mantener alineado con la raíz del repo.
 * En www se sirve localmente; el CSS viene de la plataforma (app-shell.css).
 */
(function () {
  var KEY = "hablemosapp_theme";

  function apply(mode) {
    if (mode === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }

  try {
    if (localStorage.getItem(KEY) === "dark") apply("dark");
  } catch (e) {}

  function get() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function set(mode) {
    var dark = mode === "dark";
    apply(dark ? "dark" : "light");
    try {
      localStorage.setItem(KEY, dark ? "dark" : "light");
    } catch (err) {}
    try {
      window.dispatchEvent(new CustomEvent("hablemosapp-themechange", { detail: { theme: dark ? "dark" : "light" } }));
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
    if (!window.__hablemosThemeGlobalSync) {
      window.__hablemosThemeGlobalSync = true;
      window.addEventListener("hablemosapp-themechange", syncAllThemeButtons);
    }
  }

  window.hablemosappTheme = { get: get, set: set, toggle: toggle, init: initThemeToggle };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
