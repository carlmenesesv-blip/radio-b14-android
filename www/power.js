/* ==========================================================
   POWER — que se comporte como la radio de un carro
   · Llave (ACC): cuando el ESP32 avisa {"acc":0} se espera unos segundos (se puede cancelar),
     se guarda el estado, se pausa la música, la pantalla queda negra y el cluster también.
     Al volver {"acc":1} todo se reanuda. Cuando termina, manda al ESP32
     {"c":"power","state":"ready"}: es la señal de que ya puede cortar la energía de la computadora.
   · Volante y perilla: {"key":"vol+"|"vol-"|"mute"|"next"|"prev"|"play"|"src"|"home"|"answer"|"hangup"} y {"knob":±1}.
   · Brillo automático al encender las luces ({"luz":1}).
   Ajustes: «Llave y volante» (RadioSystem: accOff, accDelay, keyStep, autoBright, nightBright).
   API: RadioPower.get() · acc(on) · key(nombre) · cancel()
   Eventos: radio:power {on, acc}
   Sección: ENCENDIDO
   ========================================================== */
(function () {
  "use strict";
  var S = window.RadioSystem, Q = window.RadioQuick, L = window.RadioLink;
  var on = true, acc = true, timer = null, tick = null, resumeRadio = false, toastId = null, dayBright = null, lightsOn = false;

  function opt(k, d) { return S && S.get(k) != null ? S.get(k) : d; }
  function toast(o) { return window.RadioToast ? window.RadioToast.show(o) : null; }
  function emit() { window.dispatchEvent(new CustomEvent("radio:power", { detail: { on: on, acc: acc } })); }
  function esp(state) { if (window.RadioESP) window.RadioESP.send({ c: "power", state: state }); }
  function closeToast() { if (typeof toastId === "function") { try { toastId(); } catch (e) {} } toastId = null; }
  function pub() { if (L) L.send({ k: "power", on: on }); }

  /* ---------- Apagar / encender ---------- */
  function powerOff() {
    clearTimeout(timer); clearInterval(tick); timer = tick = null; closeToast();
    if (!on) return;
    on = false;
    var T = window.RadioTuner;
    resumeRadio = !!(T && T.get().power);
    try { if (resumeRadio) T.setPower(false); } catch (e) {}
    try { if (window.RadioBluetooth && window.RadioBluetooth.get()) window.RadioBluetooth.set(false); } catch (e) {}
    try { if (window.RadioCamera && window.RadioCamera.close) window.RadioCamera.close(); } catch (e) {}
    ["RadioClimatePop", "RadioVolume"].forEach(function (n) { try { window[n] && window[n].close(); } catch (e) {} });
    try { window.RadioQuick && window.RadioQuick.close(); } catch (e) {}
    try { window.RadioVehicle && window.RadioVehicle.screenOff(); } catch (e) {}
    pub(); emit();
    // Aquí ya se guardó todo (cada módulo guarda al cambiar): se avisa que puede cortarse la energía
    setTimeout(function () {
      esp("ready");
      var a = window.AndroidBridge, h = window.RadioHost;
      try { if (h && h.suspend) h.suspend(); else if (a && typeof a.sleep === "function") a.sleep(); } catch (e) {}
    }, 600);
  }
  function powerOn() {
    clearTimeout(timer); clearInterval(tick); timer = tick = null;
    closeToast();
    if (on) return;
    on = true;
    try { window.RadioVehicle && window.RadioVehicle.screenOn(); } catch (e) {}
    if (resumeRadio && opt("radioResume", true)) { try { window.RadioTuner.setPower(true); } catch (e) {} }
    resumeRadio = false;
    pub(); emit(); esp("on");
  }

  function setAcc(v) {
    v = !!v;
    if (v === acc) { if (v && !on) powerOn(); return; }
    acc = v;
    if (v) { powerOn(); return; }
    if (opt("accOff", "screen") !== "screen") { emit(); return; }
    var d = Number(opt("accDelay", 10)) || 0;
    if (!d) { powerOff(); return; }
    toastId = toast({ title: "Se apaga en " + d + " s", kind: "info", ms: d * 1000, actions: [{ label: "Cancelar", fn: cancel }] });
    timer = setTimeout(powerOff, d * 1000);
    emit();
  }
  function cancel() {
    if (!timer) return;
    clearTimeout(timer); clearInterval(tick); timer = tick = null; closeToast();
    acc = true; emit();
  }

  /* ---------- Volante y perilla ---------- */
  function vol(dir, steps) {
    var step = Number(opt("keyStep", 5)) || 5, m = Q ? Q.get() : null; if (!m) return;
    if (!on) powerOn();
    var v = Math.max(0, Math.min(Number(opt("maxVolume", 100)), m.volume + dir * step * (steps || 1)));
    if (window.RadioVolume) { window.RadioVolume.set(v); window.RadioVolume.open("drv"); } else Q.set({ volume: v, mute: false });
  }
  var SRC = ["home", "radio", "media"];
  function key(k) {
    if (!on) { powerOn(); if (k === "play" || k === "src" || k === "home") return; }
    var M = window.RadioMedia, N = window.RadioNav;
    switch (k) {
      case "vol+": vol(1); break;
      case "vol-": vol(-1); break;
      case "mute": if (Q) Q.set({ mute: !Q.get().mute }); break;
      case "next": if (M) M.next(); break;
      case "prev": if (M) M.prev(); break;
      case "play": if (M) M.toggle(); break;
      case "home": if (N) N.show("home"); break;
      case "src": {
        var cur = document.documentElement.getAttribute("data-view"), i = SRC.indexOf(cur);
        if (N) N.show(SRC[(i + 1) % SRC.length]);
        break;
      }
      case "answer": if (N) N.show("calls"); break;
      case "hangup": if (N) N.show("home"); break;
    }
  }
  window.addEventListener("radio:key", function (e) { if (e.detail) { if (e.detail.steps && /^vol/.test(e.detail.key)) vol(e.detail.key === "vol+" ? 1 : -1, e.detail.steps); else key(e.detail.key); } });
  window.addEventListener("radio:acc", function (e) { setAcc(e.detail && e.detail.on); });

  /* ---------- Brillo automático ---------- */
  function applyLights(v) {
    lightsOn = !!v;
    if (!Q || !opt("autoBright", false)) return;
    if (lightsOn) { dayBright = Q.get().brightness; Q.set({ brightness: Number(opt("nightBright", 45)) }); }
    else if (dayBright != null) { Q.set({ brightness: dayBright }); dayBright = null; }
  }
  window.addEventListener("radio:lights", function (e) { applyLights(e.detail && e.detail.on); });
  window.addEventListener("radio:systemchange", function (e) {
    var ch = (e.detail && e.detail.changed) || [];
    if (ch.indexOf("autoBright") >= 0) { if (opt("autoBright", false)) applyLights(lightsOn); else if (dayBright != null) { Q.set({ brightness: dayBright }); dayBright = null; } }
    if (ch.indexOf("nightBright") >= 0 && lightsOn && opt("autoBright", false)) Q.set({ brightness: Number(opt("nightBright", 45)) });
  });

  // Tocar la pantalla negra la enciende (lo hace vehicle.js); se mantiene el estado coherente
  var so = document.getElementById("screenoff");
  if (so) so.addEventListener("click", function () { if (!on) { on = true; if (resumeRadio && opt("radioResume", true)) { try { window.RadioTuner.setPower(true); } catch (e) {} } resumeRadio = false; pub(); emit(); esp("on"); } });
  // Si el cluster aparece después, se le dice cómo está
  if (L) L.on(function (m) { if (m && (m.k === "hello")) pub(); });

  window.RadioPower = { get: function () { return { on: on, acc: acc, pending: !!timer, resume: resumeRadio }; }, acc: setAcc, key: key, cancel: cancel, off: powerOff, on: powerOn };
})();
