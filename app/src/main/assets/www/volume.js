/* ==========================================================
   VOLUME — lógica del botón de volumen fijo
   Comparte el estado con el panel de accesos rápidos
   (window.RadioQuick) para que ambos siempre coincidan.
   ========================================================== */
(function () {
  "use strict";

  var Q = window.RadioQuick;
  var el = document.getElementById("vol");
  if (!Q || !el) return;

  var track = document.getElementById("vol-track");
  var value = document.getElementById("vol-value");
  var up = document.getElementById("vol-up");
  var down = document.getElementById("vol-down");
  var mute = document.getElementById("vol-mute");
  var STEP = 5;

  function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

  function setVolume(v) {
    Q.set({ volume: clamp(v), mute: false });
  }

  function render(s) {
    el.style.setProperty("--vol", s.volume + "%");
    el.classList.toggle("is-muted", !!s.mute);
    value.textContent = String(s.volume);
    track.setAttribute("aria-valuenow", String(s.volume));
    mute.setAttribute("aria-pressed", String(!!s.mute));
    mute.setAttribute("aria-label", s.mute ? "Quitar silencio" : "Silenciar");
  }

  /* ---------- Botones + / − (mantener presionado repite) ---------- */
  function hold(btn, delta) {
    var delay = null, timer = null;

    function step() { setVolume(Q.get().volume + delta); }
    function stop() {
      clearTimeout(delay);
      clearInterval(timer);
      delay = timer = null;
    }

    btn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      stop();
      step();
      delay = setTimeout(function () { timer = setInterval(step, 90); }, 400);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
      btn.addEventListener(ev, stop);
    });
    // Teclado (los toques ya se manejan en pointerdown)
    btn.addEventListener("click", function (e) { if (e.detail === 0) step(); });
  }
  hold(up, STEP);
  hold(down, -STEP);

  /* ---------- Barra: tocar o arrastrar ---------- */
  var dragging = false;

  function fromPointer(e) {
    var r = track.getBoundingClientRect();
    setVolume((1 - (e.clientY - r.top) / r.height) * 100);
  }
  track.addEventListener("pointerdown", function (e) {
    dragging = true;
    track.classList.add("is-dragging");
    track.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  track.addEventListener("pointermove", function (e) { if (dragging) fromPointer(e); });
  function endDrag() {
    dragging = false;
    track.classList.remove("is-dragging");
  }
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);

  track.addEventListener("keydown", function (e) {
    var v = Q.get().volume;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") setVolume(v + STEP);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") setVolume(v - STEP);
    else if (e.key === "Home") setVolume(0);
    else if (e.key === "End") setVolume(100);
    else return;
    e.preventDefault();
  });

  /* ---------- Silencio ---------- */
  mute.addEventListener("click", function () {
    Q.set({ mute: !Q.get().mute });
  });

  /* ---------- Sincronía con el panel de accesos rápidos ---------- */
  window.addEventListener("radio:quickchange", function (e) { render(e.detail); });
  render(Q.get());
})();
