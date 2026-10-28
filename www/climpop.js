/* ==========================================================
   CLIMPOP — ventana de climatización (abierta desde la barra de abajo)
   La climatización dejó de ser una pestaña: el botón fijo de abajo
   muestra la temperatura y abre esta ventana desde cualquier sección.
   API: RadioClimatePop.open() / close() / toggle()
   ========================================================== */
(function () {
  "use strict";
  var pop = document.getElementById("cpop"), btns = [document.getElementById("cb-drv"), document.getElementById("cb-pax")];
  if (!pop || !btns[0] || !btns[1]) return;

  function isOpen() { return pop.classList.contains("is-open"); }
  function open() {
    if (window.RadioVolume && window.RadioVolume.close) window.RadioVolume.close();
    pop.classList.add("is-open"); pop.setAttribute("aria-hidden", "false");
    btns.forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
  }
  function close() {
    pop.classList.remove("is-open"); pop.setAttribute("aria-hidden", "true");
    btns.forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
  }
  btns.forEach(function (b) { b.addEventListener("click", function () { if (isOpen()) close(); else open(); }); });
  pop.querySelectorAll("[data-cp-close]").forEach(function (n) { n.addEventListener("click", close); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen()) { e.stopImmediatePropagation(); close(); } }, true);

  window.RadioClimatePop = { open: open, close: close, toggle: function () { if (isOpen()) close(); else open(); }, isOpen: isOpen };
})();
