/* ==========================================================
   MAIN — punto de entrada
   Aquí se irán conectando las secciones nuevas (media, clima, mapa…)
   ========================================================== */
(function () {
  "use strict";

  // Bloquea el menú contextual y el zoom por gestos (pantalla táctil de radio)
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
})();
