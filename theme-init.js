/**
 * Tema claro/oscuro: aplica antes del primer paint si va en <head>.
 * Persistencia: localStorage hablemosapp_theme = "dark" | "light"
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
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    var label = dark ? "Modo claro" : "Modo oscuro";
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }

  function initThemeToggle() {
    var btn = document.getElementById("btnThemeToggle");
    if (!btn || btn.getAttribute("data-theme-wired") === "1") return;
    btn.setAttribute("data-theme-wired", "1");
    syncButton(btn);
    btn.addEventListener("click", function () {
      toggle();
      syncButton(btn);
    });
    window.addEventListener("hablemosapp-themechange", function () {
      syncButton(btn);
    });
  }

  window.hablemosappTheme = { get: get, set: set, toggle: toggle, init: initThemeToggle };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
