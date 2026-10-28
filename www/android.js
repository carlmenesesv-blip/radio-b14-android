/* ==========================================================
   ANDROID — enlace con el sistema cuando corre como app/launcher
   Volumen, brillo, silencio, Wi‑Fi y Bluetooth reales (AndroidBridge.sys…).
   Sin puente (navegador/PC) este módulo no hace nada.
   Evento: radio:androidsys {vol, mute, bright, wifi, bt, overlay, writeSettings, floating, home}
   Sección: SISTEMA
   ========================================================== */
(function () {
  "use strict";
  var AB = window.AndroidBridge;
  var Q = window.RadioQuick;
  if (!AB || typeof AB.sys !== "function" || !Q) return;

  function markNative(s) { if (s && typeof s.bright === "number") document.documentElement.setAttribute("data-native", "1"); }   // el brillo es real: se quita el velo simulado
  if (AB.platform !== "windows") document.documentElement.setAttribute("data-native", "1");

  var pulling = false, last = {}, info = {}, timer = null;

  function read() { try { return JSON.parse(AB.sys()); } catch (e) { return null; } }

  // Sistema → interfaz
  function pull() {
    var s = read(); if (!s) return;
    info = s; markNative(s);
    var patch = {};
    if (typeof s.vol === "number") patch.volume = s.vol;
    if (typeof s.mute === "boolean") patch.mute = s.mute;
    if (typeof s.bright === "number") patch.brightness = Math.max(5, s.bright);
    if (typeof s.wifi === "boolean") patch.wifi = s.wifi;
    if (typeof s.bt === "boolean") patch.bluetooth = s.bt;
    var cur = Q.get(), changed = Object.keys(patch).some(function (k) { return cur[k] !== patch[k]; });
    if (changed) { pulling = true; try { Q.set(patch); } finally { pulling = false; } }
    last = { volume: Q.get().volume, mute: Q.get().mute, brightness: Q.get().brightness };
    window.dispatchEvent(new CustomEvent("radio:androidsys", { detail: s }));
  }

  // Interfaz → sistema
  var vt = null, bt = null;
  window.addEventListener("radio:quickchange", function (e) {
    if (pulling) return;
    var s = e.detail;
    if (s.volume !== last.volume) { last.volume = s.volume; clearTimeout(vt); vt = setTimeout(function () { try { AB.setVolume(s.volume); } catch (x) {} }, 60); }
    if (s.mute !== last.mute) { last.mute = s.mute; try { AB.setMute(!!s.mute); } catch (x) {} }
    if (s.brightness !== last.brightness) { last.brightness = s.brightness; clearTimeout(bt); bt = setTimeout(function () { try { AB.setBrightness(s.brightness); } catch (x) {} }, 80); }
  });

  // Wi‑Fi y Bluetooth: Android no deja cambiarlos desde una app; se abre su pantalla
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest('.qs__tile[data-key="wifi"], .qs__tile[data-key="bluetooth"]');
    if (!t) return;
    e.stopImmediatePropagation(); e.preventDefault();
    try { AB.openSettings(t.dataset.key); } catch (x) {}
  }, true);

  function loop() { clearTimeout(timer); if (!document.hidden) pull(); timer = setTimeout(loop, 3000); }
  document.addEventListener("visibilitychange", loop);
  window.addEventListener("focus", pull);
  window.addEventListener("radio:booted", pull);

  window.RadioAndroid = {
    info: function () { return Object.assign({}, info); },
    refresh: pull,
    open: function (k) { try { AB.openSettings(k); } catch (e) {} },
    setFloating: function (on) {
      try { AB.setFloating(!!on); } catch (e) {}
      if (on && info.overlay === false) { try { AB.openSettings("overlay"); } catch (e) {} }
      setTimeout(pull, 300);
    }
  };
  loop();
})();
