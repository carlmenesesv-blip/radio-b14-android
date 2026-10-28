/* ==========================================================
   SKINS DEL CLUSTER — lista de interfaces disponibles
   Cada interfaz es una página HTML de esta carpeta que expone
   window.ClusterAPI (ajustes, tema, modo, snapshot/restore).
   Para agregar otra: copia su HTML aquí y añádela a la lista.
   La usan el radio (selector) y la pantalla del cluster (display.html).
   `file` es relativo a la carpeta /cluster.
   ========================================================== */
(function () {
  "use strict";
  window.ClusterSkins = [
    { id: "riel", name: "Riel", file: "riel.html", hint: "Velocidad y marcha a la izquierda, el auto sobre la carretera a la derecha." }
  ];
})();
