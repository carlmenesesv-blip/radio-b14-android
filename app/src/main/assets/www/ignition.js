/* ==========================================================
   ENCENDIDO — relé que da continuidad al circuito de arranque
   · ON: pide una clave (se crea la primera vez) y conecta el relé.
   · Apagar: pregunta si también se desconecta el circuito.
   · No permite desconectar con el auto en movimiento.
   Salida: evento radio:relaychange {name:"ignition", on}  y  AndroidBridge.relay("ignition", on).
   La clave es una barrera de la pantalla; la seguridad real la da el cableado (ver ayuda en la tarjeta).
   Sección: VEHÍCULO
   ========================================================== */
(function () {
  "use strict";
  var card = document.getElementById("ign");
  if (!card) return;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "radio-ignition";
  var MAXTRY = 5, LOCK_MS = 30000, MOVING_KMH = 3;
  var AB = window.AndroidBridge || null;
  var hasHw = !!AB && typeof AB.relay !== "undefined";

  var el = {
    chip: $("ign-chip"), txt: $("ign-txt"), main: $("ign-main"), mainT: $("ign-main-t"), chg: $("ign-chg"), hw: $("ign-hw"),
    dlg: $("ign-dlg"), t: $("ign-dlg-t"), s: $("ign-dlg-s"), dots: $("ign-dots"), err: $("ign-err"), pad: $("ign-pad"),
    ask: $("ign-ask"), yes: $("ign-yes"), no: $("ign-no"), cancel: $("ign-cancel")
  };
  var armed = false;   // siempre arranca desconectado: tras reiniciar la pantalla se pide la clave otra vez

  /* ---------- Clave guardada (hash con sal) ---------- */
  function loadSec() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function saveSec(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function rnd() { var a = new Uint8Array(8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function hash(pin, salt) {
    var str = salt + ":" + pin;
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then(function (b) {
        return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
      });
    }
    var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return Promise.resolve("d" + (h >>> 0).toString(16));
  }

  /* ---------- Relé ---------- */
  function setRelay(on) {
    armed = on;
    render();
    window.dispatchEvent(new CustomEvent("radio:relaychange", { detail: { name: "ignition", on: on } }));
    if (hasHw) { try { AB.relay("ignition", on); } catch (e) {} }
  }
  function render() {
    card.dataset.on = String(armed);
    el.chip.textContent = armed ? "Circuito conectado" : "Circuito desconectado";
    el.txt.textContent = armed ? "Listo para arrancar: pisa el clutch y enciende como siempre." : "El auto no arranca hasta conectar el circuito con tu clave.";
    el.mainT.textContent = armed ? "Apagar" : "ON";
    el.chg.hidden = !hasSecret();
    el.hw.textContent = hasHw ? "" : "Vista previa: aún no hay un módulo de relé conectado. Cuando lo haya, esta tarjeta lo controlará.";
  }
  function hasSecret() { return !!loadSec().hash; }
  function toast(o) { if (window.RadioToast) window.RadioToast.show(o); }
  function moving() { var s = window.RadioSystem; try { return s && s.speed && s.speed() > MOVING_KMH; } catch (e) { return false; } }

  /* ---------- Ventana ---------- */
  var flow = null, entry = "", opener = null;
  function openDlg() {
    opener = document.activeElement;
    el.dlg.hidden = false; el.dlg.setAttribute("aria-hidden", "false");
    requestAnimationFrame(function () { el.dlg.classList.add("is-open"); });
  }
  function closeDlg() {
    el.dlg.classList.remove("is-open"); el.dlg.setAttribute("aria-hidden", "true");
    setTimeout(function () { if (!el.dlg.classList.contains("is-open")) el.dlg.hidden = true; }, 170);
    flow = null; entry = "";
    if (opener && opener.focus) try { opener.focus(); } catch (e) {}
  }
  function drawDots() {
    var n = Math.max(4, entry.length);
    el.dots.textContent = "";
    for (var i = 0; i < n; i++) { var d = document.createElement("i"); if (i < entry.length) d.className = "on"; el.dots.appendChild(d); }
  }
  function step(title, sub) {
    el.t.textContent = title; el.s.textContent = sub || ""; el.err.textContent = ""; entry = "";
    el.pad.hidden = false; el.ask.hidden = true; el.dots.hidden = false; drawDots();
  }
  function fail(msg) {
    el.err.textContent = msg; entry = ""; drawDots();
    el.dlg.classList.remove("shake"); void el.dlg.offsetWidth; el.dlg.classList.add("shake");
  }
  function lockedLeft() { var l = loadSec().lockUntil || 0; return Math.max(0, l - Date.now()); }

  // Flujos: cada paso recibe el PIN escrito
  function startEnter() {      // ON
    var sec = loadSec();
    if (!sec.hash) { startCreate(function () { setRelay(true); toast({ title: "Circuito conectado", text: "Ya puedes arrancar el auto.", ms: 3500 }); }); return; }
    var left = lockedLeft();
    openDlg();
    if (left > 0) { step("Bloqueado", ""); fail("Demasiados intentos. Espera " + Math.ceil(left / 1000) + " s."); return; }
    flow = function (pin) { return verify(pin).then(function (ok) { if (ok) { closeDlg(); setRelay(true); toast({ title: "Circuito conectado", text: "Ya puedes arrancar el auto.", ms: 3500 }); } }); };
    step("Clave de encendido", "Escribe tu clave para conectar el circuito.");
  }
  function verify(pin) {
    var sec = loadSec();
    return hash(pin, sec.salt).then(function (h) {
      if (h === sec.hash) { sec.fails = 0; delete sec.lockUntil; saveSec(sec); return true; }
      sec.fails = (sec.fails || 0) + 1;
      if (sec.fails >= MAXTRY) { sec.fails = 0; sec.lockUntil = Date.now() + LOCK_MS; saveSec(sec); fail("Demasiados intentos. Espera 30 s."); }
      else { saveSec(sec); fail("Clave incorrecta. Intentos restantes: " + (MAXTRY - sec.fails)); }
      return false;
    });
  }
  function startCreate(done) {
    openDlg();
    var first = "";
    step("Crea tu clave", "De 4 a 6 números. Se te pedirá cada vez que conectes el circuito.");
    flow = function (pin) {
      if (pin.length < 4) { fail("Mínimo 4 números."); return Promise.resolve(); }
      if (!first) { first = pin; step("Repite la clave", "Para confirmar."); return Promise.resolve(); }
      if (pin !== first) { first = ""; step("Crea tu clave", "No coincidían. Inténtalo de nuevo."); return Promise.resolve(); }
      var salt = rnd();
      return hash(pin, salt).then(function (h) { saveSec({ salt: salt, hash: h, fails: 0 }); closeDlg(); toast({ title: "Clave guardada", ms: 2500 }); done && done(); });
    };
  }
  function startChange() {
    var left = lockedLeft();
    openDlg();
    if (left > 0) { step("Bloqueado", ""); fail("Espera " + Math.ceil(left / 1000) + " s."); return; }
    step("Clave actual", "Escríbela para poder cambiarla.");
    flow = function (pin) {
      return verify(pin).then(function (ok) { if (ok) { closeDlg(); setTimeout(function () { startCreate(); }, 220); } });
    };
  }
  function startOff() {
    if (moving()) { toast({ title: "El auto está en movimiento", text: "No se desconecta el circuito mientras avanzas.", kind: "bad", ms: 4000 }); return; }
    openDlg(); flow = null; entry = "";
    el.t.textContent = "Apagar el auto"; el.s.textContent = "¿Quieres desconectar también el circuito de encendido? Sin él, el auto no volverá a arrancar hasta poner la clave.";
    el.err.textContent = ""; el.dots.textContent = ""; el.dots.hidden = true; el.pad.hidden = true; el.ask.hidden = false; el.yes.focus();
  }

  /* ---------- Teclado numérico ---------- */
  el.pad.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var k = b.dataset.k;
    if (k === "back") entry = entry.slice(0, -1);
    else if (k === "ok") { if (flow) { var f = flow, p = entry; f(p); } return; }
    else if (entry.length < 6) entry += k;
    el.err.textContent = ""; drawDots();
  });
  document.addEventListener("keydown", function (e) {
    if (el.dlg.hidden) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); closeDlg(); }
    else if (!el.pad.hidden) {
      if (/^[0-9]$/.test(e.key) && entry.length < 6) { entry += e.key; el.err.textContent = ""; drawDots(); }
      else if (e.key === "Backspace") { entry = entry.slice(0, -1); drawDots(); }
      else if (e.key === "Enter" && flow) { flow(entry); }
    }
  }, true);
  el.yes.addEventListener("click", function () { closeDlg(); setRelay(false); toast({ title: "Circuito desconectado", text: "El auto no arrancará sin la clave.", ms: 3500 }); });
  el.no.addEventListener("click", function () { closeDlg(); toast({ title: "Circuito conectado", text: "Sigue listo para arrancar.", ms: 2500 }); });
  el.cancel.addEventListener("click", closeDlg);
  el.dlg.addEventListener("click", function (e) { if (e.target === el.dlg) closeDlg(); });

  el.main.addEventListener("click", function () { armed ? startOff() : startEnter(); });
  el.chg.addEventListener("click", startChange);

  render();
  window.RadioIgnition = {
    get: function () { return { on: armed, hasPin: hasSecret() }; },
    setHardware: function (on) { hasHw = !!on; render(); }
  };
})();
