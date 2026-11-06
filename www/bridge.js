/* ==========================================================
   BRIDGE — música del celular (Linux).
   Se conecta al servicio local «aura-bridge» (127.0.0.1:8765), que lee el reproductor del celular por Bluetooth
   (BlueZ → MPRIS). Si el servicio no existe (Windows, Android, navegador común) no hace nada: sin errores ni ruido.

   API:    RadioPhone.get() → {connected, player, state, title, artist, album}
           RadioPhone.cmd("play-pause" | "play" | "pause" | "next" | "previous")
   Evento: radio:phonechange (detail = estado)
   Sección: MEDIA
   ========================================================== */
(function () {
  "use strict";
  var BASE = "http://127.0.0.1:8765";
  var EMPTY = { connected: false, player: "", state: "stopped", title: "", artist: "", album: "" };
  var cur = Object.assign({}, EMPTY), es = null, retry = null, delay = 4000;

  function same(a, b) { for (var k in EMPTY) if (a[k] !== b[k]) return false; return true; }
  function set(n) {
    n = Object.assign({}, EMPTY, n || {});
    if (same(n, cur)) return;
    cur = n;
    window.dispatchEvent(new CustomEvent("radio:phonechange", { detail: Object.assign({}, cur) }));
  }

  function connect() {
    if (typeof EventSource === "undefined") return;
    try { es = new EventSource(BASE + "/events"); } catch (e) { return later(); }
    es.onopen = function () { delay = 4000; };
    es.onmessage = function (ev) { try { set(JSON.parse(ev.data)); } catch (e) { /* mensaje dañado: se ignora */ } };
    es.onerror = function () {          // el servicio no está o se cayó: se apaga la fuente y se reintenta con calma
      if (es) { es.close(); es = null; }
      set(EMPTY);
      later();
    };
  }
  function later() {
    clearTimeout(retry);
    retry = setTimeout(connect, delay);
    delay = Math.min(delay * 2, 60000);   // 4 s, 8 s … hasta 1 min: no molesta si no hay servicio
  }

  function cmd(c) {
    if (!cur.connected) return;
    try {
      fetch(BASE + "/cmd", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ c: c }) })
        .catch(function () { /* sin respuesta: el próximo estado corrige la pantalla */ });
    } catch (e) { /* fetch no disponible */ }
  }

  window.RadioPhone = { get: function () { return Object.assign({}, cur); }, cmd: cmd };
  connect();
})();
