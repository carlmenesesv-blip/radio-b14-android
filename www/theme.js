/* ==========================================================
   THEME — selector claro / oscuro con persistencia
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-theme";
  var root = document.documentElement;
  var buttons = document.querySelectorAll("[data-theme-set]");

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    buttons.forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeSet === theme));
    });
    try { localStorage.setItem(KEY, theme); } catch (e) {}
  }

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () { apply(btn.dataset.themeSet); });
  });

  apply(root.getAttribute("data-theme") || "dark");
})();
