/* ==========================================================
   NAV — cambio de vistas desde el dock
   ========================================================== */
(function () {
  "use strict";

  var buttons = document.querySelectorAll(".dock__btn");
  var views = document.querySelectorAll(".view");
  var title = document.getElementById("view-title");

  function show(name) {
    views.forEach(function (v) {
      var active = v.dataset.view === name;
      v.classList.toggle("is-active", active);
      if (active && title) title.textContent = v.dataset.title || "";
    });
    buttons.forEach(function (b) {
      if (b.dataset.target === name) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.target); });
  });

  // La app Android avisa cuando se pulsa Inicio estando ya en el radio
  window.addEventListener("radio:homepress", function () { show("home"); });

  window.RadioNav = { show: show };
})();
