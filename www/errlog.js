/* ==========================================================
   ERRLOG — registro de errores para diagnosticar fallas en el auto
   Guarda los últimos errores de la interfaz (y, en la app de Windows, también en un archivo).
   API: RadioErr {add(msg), list(), clear(), text()}
   Sección: SISTEMA
   ========================================================== */
(function () {
  "use strict";
  var KEY = "radio-errlog", MAX = 60, items = [];
  try { items = JSON.parse(localStorage.getItem(KEY) || "[]"); if (!Array.isArray(items)) items = []; } catch (e) { items = []; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX))); } catch (e) {} }
  function add(msg, where) {
    var it = { t: Date.now(), m: String(msg || "").slice(0, 300), w: String(where || "").slice(0, 120) };
    var last = items[items.length - 1];
    if (last && last.m === it.m && last.w === it.w && it.t - last.t < 2000) { last.n = (last.n || 1) + 1; save(); return; }
    items.push(it); if (items.length > MAX) items.shift(); save();
    try { if (window.RadioHost && window.RadioHost.log) window.RadioHost.log(new Date(it.t).toISOString() + " " + it.m + (it.w ? " (" + it.w + ")" : "")); } catch (e) {}
    window.dispatchEvent(new CustomEvent("radio:errlog", { detail: { count: items.length } }));
  }
  window.addEventListener("error", function (e) {
    var f = (e.filename || "").split("/").pop();
    add(e.message || "Error", f ? f + ":" + (e.lineno || 0) : "");
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason; add("Promesa rechazada: " + (r && r.message ? r.message : r), "");
  });
  function fmt(it) { var d = new Date(it.t); return d.toLocaleString("es-CR", { hour12: false }) + "  " + it.m + (it.w ? "  [" + it.w + "]" : "") + (it.n > 1 ? "  ×" + it.n : ""); }
  window.RadioErr = {
    add: add,
    list: function () { return items.slice(); },
    clear: function () { items = []; save(); window.dispatchEvent(new CustomEvent("radio:errlog", { detail: { count: 0 } })); },
    text: function (n) { return items.slice(-(n || 20)).map(fmt).reverse().join("\n"); }
  };
})();
