/* ==========================================================
   BOOT — control de la animación de inicio
   - Se muestra al abrir la app (encender el auto).
   - Toque o tecla para omitirla.
   - Ajustes: bootAnim (activar), bootMs (duración), bootSound (sonido).
   - Prueba: añade ?boot=1 a la dirección para forzarla; ?noboot la omite.
     (Los navegadores automatizados la omiten salvo con ?boot=1.)
   ========================================================== */
(function () {
  "use strict";

  var el = document.getElementById("boot");
  if (!el) return;
  var S = window.RadioSystem;
  var q = location.search;
  var force = /[?&]boot=1\b/.test(q);
  var skip = /[?&]noboot\b/.test(q) || (!force && navigator.webdriver);
  var enabled = !S || S.get("bootAnim") !== false;

  function remove() {
    if (el.parentNode) el.parentNode.removeChild(el);
    window.dispatchEvent(new CustomEvent("radio:booted"));
  }
  if (skip || (!enabled && !force)) { remove(); return; }

  var reduce = document.documentElement.getAttribute("data-motion") === "reduce" ||
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var len = reduce ? 1200 : Math.max(1500, Math.min(6000, Number(S && S.get("bootMs")) || 3600));
  el.style.setProperty("--b-len", len + "ms");

  var msg = document.getElementById("boot-msg");
  var STEPS = [[0, "Iniciando sistema"], [0.3, "Audio"], [0.5, "Conexiones"], [0.7, "Vehículo"], [0.88, "Listo"]];
  var timers = [];
  STEPS.forEach(function (s) {
    timers.push(setTimeout(function () { if (msg) msg.textContent = s[1]; }, Math.round(s[0] * len)));
  });

  var done = false;
  function out() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    el.classList.add("is-out");
    var finish = function () { el.removeEventListener("animationend", finish); remove(); };
    el.addEventListener("animationend", finish);
    setTimeout(finish, 900);                   // por si no hay evento de animación
  }
  timers.push(setTimeout(out, len));
  el.addEventListener("pointerdown", out);
  document.addEventListener("keydown", out, { once: true });

  /* Sonido opcional: dos notas suaves. Muchos navegadores solo lo permiten tras tocar la pantalla. */
  if (S && S.get("bootSound")) {
    try {
      var A = window.AudioContext || window.webkitAudioContext;
      var ctx = new A();
      var t0 = ctx.currentTime + 0.35;
      [[392, 0], [587.33, 0.22], [783.99, 0.46]].forEach(function (n) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t0 + n[1]);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + n[1] + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + 0.9);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0 + n[1]); o.stop(t0 + n[1] + 1);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 2500);
    } catch (e) {}
  }
})();
