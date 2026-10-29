/* ==========================================================
   ESP — enlace con el ESP32 del auto (una sola puerta de entrada y salida)
   ENTRADA  (ESP32 → app): líneas JSON, p. ej.
     {"kmh":62,"rpm":2400,"temp":88,"fuel":0.4,"volt":13.8,"izq":0,"der":0,
      "altas":0,"freno":0,"puerta":0,"reversa":0,"neutro":0,"emerg":0}
     eventos: {"e":"ack","c":"relay","n":"ignition","v":1}
     llave y mandos (se actúan al instante, sin esperar):
       {"acc":1|0}            accesorio del auto: 1 = encendido, 0 = apagado
       {"key":"vol+"}         botón del volante: vol+ vol- mute next prev play src home answer hangup
       {"knob":1|-1}          perilla de volumen (+1 sube, -1 baja)
       {"luz":1|0}            luces del auto encendidas (brillo automático)
   La app Android las entrega en window.__b14Line(texto) y el estado de la
   conexión en window.__b14Status(texto, ok). Desde aquí se reparten:
     · a la pantalla del cluster (RadioLink, otra pantalla)
     · a la interfaz del cluster abierta en el radio (RadioESP.onLine)
     · a velocidad, voltaje, temperatura, combustible, puerta y reversa del radio
   SALIDA   (app → ESP32): RadioESP.send({c:"relay", n:"ignition", v:1})
     La app la escribe como línea JSON por el USB: AndroidBridge.espSend(linea).
     Órdenes usadas: relay (ignition) · mirror (side,dir,v) · amb (luces RGB) ·
     sw (fog|fan|head|cabin) · lock · vol (l,r,mute) · power (state: on|off|ready) · hello
   Eventos: radio:esplink {ok,text} · radio:espevent {…evento del ESP32}
            radio:espsend {cmd,sent}
   ========================================================== */
(function () {
  "use strict";
  var L = window.RadioLink;
  var last = {}, lastAt = 0, linked = false, text = "Sin ESP32";
  var lineSubs = [], statusSubs = [], transport = null, lastFeed = 0;

  function AB() { return window.AndroidBridge || null; }
  function num(v) { return typeof v === "number" && isFinite(v); }
  function emit(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail: detail })); }

  /* ---------- Entrada ---------- */
  function feedRadio(d) {
    var now = Date.now(); if (now - lastFeed < 400) return; lastFeed = now;
    try {
      if (num(d.kmh) && window.RadioSystem && window.RadioSystem.setSpeed) window.RadioSystem.setSpeed(d.kmh);
      if (window.RadioVehicle) {
        var p = {};
        if (num(d.volt)) p.voltage = d.volt;
        if (num(d.temp)) p.temp = d.temp;
        if (num(d.fuel)) p.fuel = Math.max(0, Math.min(100, d.fuel <= 1 ? d.fuel * 100 : d.fuel));
        if (Object.keys(p).length) { window.RadioVehicle.simulate(false); window.RadioVehicle.setTelemetry(p); }
      }
      if (window.RadioCar && ("puerta" in d || "reversa" in d)) {
        var u = {};
        if ("puerta" in d) u.doors = { fl: !!d.puerta };
        if ("reversa" in d) u.lights = { reverse: !!d.reversa };
        window.RadioCar.update(u);
      }
    } catch (e) {}
  }

  function ingest(t, publish) {
    t = String(t == null ? "" : t).trim();
    if (!t) return;
    lineSubs.forEach(function (fn) { try { fn(t); } catch (e) {} });
    if (publish && L) L.send({ k: "line", t: t });
    if (t.charAt(0) !== "{") return;
    var d; try { d = JSON.parse(t); } catch (e) { return; }
    if (!d || typeof d !== "object") return;
    if (d.e) { emit("radio:espevent", d); return; }
    if ("acc" in d) emit("radio:acc", { on: !!d.acc });
    if (typeof d.key === "string") emit("radio:key", { key: d.key });
    if (num(d.knob) && d.knob) emit("radio:key", { key: d.knob > 0 ? "vol+" : "vol-", steps: Math.min(5, Math.abs(Math.round(d.knob))) });
    if ("luz" in d) emit("radio:lights", { on: !!d.luz });
    if ("ack" in d) emit("radio:ack", { n: String(d.ack) });
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) last[k] = d[k];
    lastAt = Date.now();
    feedRadio(d);
  }
  function setStatus(t, ok, publish) {
    text = String(t || ""); linked = !!ok;
    statusSubs.forEach(function (fn) { try { fn(text, linked); } catch (e) {} });
    if (publish && L) L.send({ k: "status", t: text, ok: linked });
    emit("radio:esplink", { ok: linked, text: text });
  }
  window.__b14Line = function (t) { ingest(t, true); };
  window.__b14Status = function (t, ok) { setStatus(t, ok, true); };

  /* ---------- Salida ---------- */
  function available() { var a = AB(); return (!!a && typeof a.espSend !== "undefined") || !!transport; }
  function send(cmd) {
    var line = JSON.stringify(cmd) + "\n", sent = false;
    var a = AB();
    try {
      if (a && typeof a.espSend !== "undefined") { a.espSend(line); sent = true; }
      else if (transport) { transport(line); sent = true; }
    } catch (e) { sent = false; }
    emit("radio:espsend", { cmd: cmd, sent: sent });
    return sent;
  }

  window.RadioESP = {
    send: send,
    available: available,
    linked: function () { return linked; },
    status: function () { return text; },
    get: function () { return Object.assign({}, last); },
    age: function () { return lastAt ? Date.now() - lastAt : Infinity; },
    onLine: function (fn) { lineSubs.push(fn); },
    onStatus: function (fn) { statusSubs.push(fn); },
    setTransport: function (fn) { transport = typeof fn === "function" ? fn : null; },
    ingest: function (t) { ingest(t, true); },
    setStatus: function (t, ok) { setStatus(t, ok, true); }
  };

  // Si la otra pantalla es quien recibe el USB, sus líneas llegan por el canal
  if (L) L.on(function (m) {
    if (!m) return;
    if (m.k === "line") ingest(m.t, false);
    else if (m.k === "status") setStatus(m.t, m.ok, false);
  });
})();
