/* ==========================================================
   LINK — canal entre las pantallas de la misma computadora
   La pantalla principal (radio) y la pantalla del cluster son dos páginas
   del mismo origen. Este canal les permite hablarse:
     · BroadcastChannel (ventanas/pestañas del mismo navegador)
     · evento «storage» de localStorage (respaldo)
     · puente nativo: AndroidBridge.linkSend(json) envía a la otra pantalla
       y la app llama a window.__b14Native(json) con lo que llega.
   API: RadioLink.send(msg) · RadioLink.on(fn(msg)) · RadioLink.id
   ========================================================== */
(function () {
  "use strict";
  if (window.RadioLink) return;
  var NAME = "b14-link";
  var ID = Math.random().toString(36).slice(2, 8);
  var n = 0, seen = [], subs = [], bc = null;
  try { bc = new BroadcastChannel(NAME); } catch (e) { bc = null; }

  function deliver(env) {
    if (!env || env.f === ID) return;
    if (seen.indexOf(env.s) >= 0) return;            // el mismo mensaje puede llegar por dos caminos
    seen.push(env.s); if (seen.length > 80) seen.shift();
    subs.slice().forEach(function (fn) { try { fn(env.m); } catch (e) {} });
  }
  if (bc) bc.onmessage = function (e) { deliver(e.data); };
  window.addEventListener("storage", function (e) {
    if (e.key !== NAME || !e.newValue) return;
    try { deliver(JSON.parse(e.newValue)); } catch (x) {}
  });
  window.__b14Native = function (json) { try { deliver({ f: "native", s: "n" + Math.random(), m: JSON.parse(json) }); } catch (e) {} };

  function send(m) {
    var env = { f: ID, s: ID + (++n), m: m };
    if (bc) { try { bc.postMessage(env); } catch (e) {} }
    try { localStorage.setItem(NAME, JSON.stringify(env)); } catch (e) {}
    var AB = window.AndroidBridge;
    if (AB && typeof AB.linkSend !== "undefined") { try { AB.linkSend(JSON.stringify(m)); } catch (e) {} }
  }
  window.RadioLink = { send: send, on: function (fn) { subs.push(fn); }, id: ID };
})();
