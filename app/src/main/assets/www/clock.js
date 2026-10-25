/* ==========================================================
   CLOCK — hora y fecha en la barra superior
   ========================================================== */
(function () {
  "use strict";

  var clock = document.getElementById("clock");
  var date = document.getElementById("date-label");

  function tick() {
    var now = new Date();
    if (clock) clock.textContent = (window.RadioSystem ? window.RadioSystem.fmt.time(now) : now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }));
    if (date) date.textContent = now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  }

  tick();
  setInterval(tick, 1000);
  window.addEventListener("radio:systemchange", tick);
})();
