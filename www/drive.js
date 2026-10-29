/* ==========================================================
   DRIVE — modo conducción
   Con el auto en marcha (por encima de la velocidad elegida) se agrandan los controles,
   se quita lo que distrae y se bloquean los videos y el navegador. Quien va de copiloto
   puede tocar «Soy pasajero» para seguir usando todo hasta que el auto se detenga.
   Entrada: evento radio:speed {kmh}. Salida: html[data-driving], evento radio:drivechange {driving}
   API: RadioDrive {get(), blocks(app), notice(app), passenger(), force(on)}
   Sección: SEGURIDAD
   ========================================================== */
(function () {
  "use strict";
  var root = document.documentElement;
  var driving = false, passenger = false, speed = 0, seen = 0, stopSince = 0, tOn = null, tOff = null, toastClose = null, forced = null;

  function sys() { return (window.RadioSystem && window.RadioSystem.get && window.RadioSystem.get()) || {}; }
  function enabled() { return sys().driveMode !== false; }
  function limit() { return Number(sys().driveSpeed) || 15; }
  function toast(o) { return window.RadioToast ? window.RadioToast.show(o) : null; }

  // Qué se bloquea mientras se conduce: videos y navegación libre (requieren mirar y escribir)
  var BLOCKED_IDS = { youtube: 1, browser: 1, tmp: 1 };
  function blocks(a) {
    if (!driving || passenger || !a) return false;
    if (sys().driveBlockVideo === false) return false;
    if (a.kind === "android") return false;                  // apps instaladas: no se pueden juzgar
    if (BLOCKED_IDS[a.id]) return true;
    if (a.kind === "custom") return true;                    // accesos web añadidos por el usuario
    if (typeof a.id === "string" && a.id.indexOf("w:") === 0) return !/music\.youtube|spotify|waze|google\.[a-z.]+\/maps/i.test(a.url || "");
    return false;
  }
  function notice(a) {
    toast({ title: "Bloqueado mientras conduces", text: (a && a.name ? a.name + " requiere mirar la pantalla. " : "") + "Usa música, mapa o llamadas.", kind: "bad", ms: 4200,
      actions: [{ label: "Soy pasajero", fn: function () { setPassenger(true); } }] });
  }

  function apply(v) {
    if (v === driving) return;
    driving = v;
    if (v) root.setAttribute("data-driving", "true"); else root.removeAttribute("data-driving");
    if (sys().driveBig === false) root.removeAttribute("data-drive-big"); else root.setAttribute("data-drive-big", "on");
    window.dispatchEvent(new CustomEvent("radio:drivechange", { detail: { driving: driving } }));
    if (toastClose) { try { toastClose(); } catch (e) {} toastClose = null; }
    if (v) {
      closeBlocked();
      toastClose = toast({ title: "Modo conducción", text: "Controles más grandes y menos distracciones.", ms: 4500,
        actions: [{ label: "Soy pasajero", fn: function () { setPassenger(true); } }] });
    }
  }
  function closeBlocked() {
    try {
      var A = window.RadioApps, c = A && A.current && A.current();
      if (c && blocks(c)) { A.close(); if (window.RadioNav && root.getAttribute("data-view") === "apps") window.RadioNav.show("home"); notice(c); }
    } catch (e) {}
  }
  function setPassenger(on) {
    passenger = !!on;
    if (passenger) { stopSince = 0; apply(false); toast({ title: "Modo pasajero", text: "Vuelve el uso normal hasta que el auto se detenga.", ms: 3000 }); }
    else evaluate();
  }

  function evaluate() {
    var now = Date.now();
    if (forced !== null) { apply(!!forced); return; }
    var fresh = now - seen < 6000;
    var moving = enabled() && fresh && speed > limit();
    // El modo pasajero termina cuando el auto lleva parado un rato
    if (passenger) {
      if (!fresh || speed < 1) { if (!stopSince) stopSince = now; else if (now - stopSince > 20000) { passenger = false; stopSince = 0; } }
      else stopSince = 0;
    }
    if (!enabled() || passenger) { clearTimeout(tOn); tOn = null; clearTimeout(tOff); tOff = null; apply(false); return; }
    if (moving) {
      clearTimeout(tOff); tOff = null;
      if (!driving && !tOn) tOn = setTimeout(function () { tOn = null; if (enabled() && !passenger) apply(true); }, 2000);
    } else {
      clearTimeout(tOn); tOn = null;
      if (driving && !tOff) tOff = setTimeout(function () { tOff = null; apply(false); }, 6000);
    }
  }

  window.addEventListener("radio:speed", function (e) { speed = (e.detail && e.detail.kmh) || 0; seen = Date.now(); evaluate(); });
  window.addEventListener("radio:systemchange", function (e) {
    var ch = (e.detail && e.detail.changed) || [];
    if (ch.indexOf("driveBig") >= 0) { if (driving && sys().driveBig !== false) root.setAttribute("data-drive-big", "on"); else root.removeAttribute("data-drive-big"); }
    if (ch.some(function (k) { return k.indexOf("drive") === 0; })) evaluate();
  });
  setInterval(evaluate, 2000);

  window.RadioDrive = {
    get: function () { return { driving: driving, passenger: passenger, limit: limit(), enabled: enabled() }; },
    blocks: blocks, notice: notice,
    passenger: setPassenger,
    force: function (on) { forced = on === null ? null : !!on; evaluate(); }   // para pruebas
  };
  // El atributo data-drive-big se pone al conducir; en reposo no se aplica ningún cambio
})();
