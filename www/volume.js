/* ==========================================================
   VOLUME — volumen general (un solo control)
   · Dos accesos en la barra de abajo (izquierda y derecha) abren la misma ventana:
     un deslizador general y el botón de silencio.
   · Se envía al amplificador/ESP32: RadioESP.send({c:"vol", l, r, mute}) con l = r.
   · API compatible con versiones anteriores: RadioVolume.get/set/zone/open/close.
   Almacenamiento: lo guarda RadioQuick (radio-quick).
   ========================================================== */
(function () {
  "use strict";

  var Q = window.RadioQuick;
  var bars = [document.getElementById("sbar-l"), document.getElementById("sbar-r")];
  var pop = document.getElementById("vpop");
  if (!Q || !bars[0] || !bars[1] || !pop) return;

  var STEP = 5, IDLE_MS = 7000;
  var $ = function (id) { return document.getElementById(id); };
  var btns = [$("vol-drv"), $("vol-pax")], vals = [$("vol-drv-v"), $("vol-pax-v")];
  var mute = $("vol-mute"), track = $("vp-main"), tval = $("vp-main-v");

  function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

  /* ---------- Salida hacia el ESP32 ---------- */
  var sendT = null;
  function toHardware() {
    clearTimeout(sendT);
    sendT = setTimeout(function () {
      var m = Q.get();
      if (window.RadioESP) window.RadioESP.send({ c: "vol", l: m.volume, r: m.volume, mute: m.mute ? 1 : 0 });
    }, 90);
  }

  function setMaster(v) { Q.set({ volume: clamp(v), mute: false }); }

  /* ---------- Pintado ---------- */
  function render(s) {
    var muted = !!s.mute, v = s.volume;
    bars.forEach(function (b) { b.classList.toggle("is-muted", muted); });
    btns.forEach(function (b, i) {
      b.style.setProperty("--lv", v + "%");
      vals[i].textContent = String(muted ? 0 : v);
      b.setAttribute("aria-label", "Volumen, nivel " + v + (muted ? ", en silencio" : ""));
    });
    mute.setAttribute("aria-pressed", String(muted));
    mute.setAttribute("aria-label", muted ? "Quitar silencio" : "Silenciar");
    track.style.setProperty("--v", v + "%");
    track.setAttribute("aria-valuenow", String(v));
    tval.textContent = String(v);
  }

  /* ---------- Ventana ---------- */
  var idle = null;
  function bump() { clearTimeout(idle); idle = setTimeout(close, IDLE_MS); }
  function isOpen() { return pop.classList.contains("is-open"); }
  function open(side) {
    if (window.RadioClimatePop && window.RadioClimatePop.close) window.RadioClimatePop.close();
    var s = side === "pax" ? "pax" : "drv";
    pop.dataset.side = s;
    pop.classList.add("is-open"); pop.setAttribute("aria-hidden", "false");
    btns[0].setAttribute("aria-expanded", String(s === "drv")); btns[1].setAttribute("aria-expanded", String(s === "pax"));
    render(Q.get()); bump();
  }
  function close() {
    clearTimeout(idle);
    pop.classList.remove("is-open"); pop.setAttribute("aria-hidden", "true");
    btns.forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
  }
  btns.forEach(function (b, i) {
    var side = i === 0 ? "drv" : "pax";
    b.addEventListener("click", function () { if (isOpen() && pop.dataset.side === side) close(); else open(side); });
  });
  pop.querySelectorAll("[data-vp-close]").forEach(function (n) { n.addEventListener("click", close); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen()) { e.stopImmediatePropagation(); close(); } }, true);
  pop.addEventListener("pointerdown", bump);

  /* ---------- Deslizador: tocar o arrastrar ---------- */
  var dragging = false;
  function from(e) { var r = track.getBoundingClientRect(); setMaster(((e.clientX - r.left) / r.width) * 100); }
  track.addEventListener("pointerdown", function (e) { dragging = true; track.classList.add("is-dragging"); track.setPointerCapture(e.pointerId); from(e); });
  track.addEventListener("pointermove", function (e) { if (dragging) from(e); });
  function end() { dragging = false; track.classList.remove("is-dragging"); }
  track.addEventListener("pointerup", end); track.addEventListener("pointercancel", end);
  track.addEventListener("keydown", function (e) {
    var v = Q.get().volume;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") setMaster(v + STEP);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") setMaster(v - STEP);
    else if (e.key === "Home") setMaster(0);
    else if (e.key === "End") setMaster(100);
    else return;
    e.preventDefault();
  });

  /* ---------- Silencio ---------- */
  mute.addEventListener("click", function () { Q.set({ mute: !Q.get().mute }); });

  /* ---------- Sincronía con el panel de accesos rápidos y con Android ---------- */
  window.addEventListener("radio:quickchange", function (e) { render(e.detail); toHardware(); });

  // Para que otros módulos (teclas físicas, voz) muevan el volumen
  window.RadioVolume = {
    get: function () { var v = Q.get().volume; return { drv: v, pax: v, linked: true, master: v }; },
    set: setMaster,
    zone: function (side, v) { setMaster(v); },
    open: function (side) { open(side); }, close: close
  };

  render(Q.get());
})();
