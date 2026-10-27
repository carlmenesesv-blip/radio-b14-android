/* ==========================================================
   ESPEJOS laterales — mover desde la pantalla
   Mantén pulsada una flecha: el motor se mueve mientras sostienes.
   Salida: evento radio:mirror {side, dir, on}  y  AndroidBridge.mirror(side, dir, on)
   Seguridad: se detiene al soltar, al perder el foco, y a los 4 s.
   Sección: VEHÍCULO
   ========================================================== */
(function () {
  "use strict";
  var root = document.getElementById("mir");
  if (!root) return;
  var AB = window.AndroidBridge || null;
  var hasHw = !!AB && typeof AB.mirror !== "undefined";
  var side = "L", cur = null, wd = null;
  var segs = root.querySelectorAll("#mir-side .seg__btn");
  var center = document.getElementById("mir-c");
  var note = document.getElementById("mir-hw");

  function send(dir, on) {
    window.dispatchEvent(new CustomEvent("radio:mirror", { detail: { side: side, dir: dir, on: on } }));
    if (hasHw) { try { AB.mirror(side, dir, on); } catch (e) {} }
  }
  function stop() {
    if (!cur) return;
    send(cur.dir, false); cur.btn.classList.remove("is-on"); cur = null;
    clearTimeout(wd); wd = null;
  }
  function start(btn) {
    stop();
    cur = { dir: btn.dataset.d, btn: btn }; btn.classList.add("is-on");
    send(cur.dir, true);
    wd = setTimeout(stop, 4000);
  }
  root.querySelectorAll(".mir__k").forEach(function (b) {
    b.addEventListener("pointerdown", function (e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {} start(b); });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { b.addEventListener(ev, stop); });
    b.addEventListener("keydown", function (e) { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); start(b); } });
    b.addEventListener("keyup", function (e) { if (e.key === " " || e.key === "Enter") stop(); });
    b.addEventListener("blur", stop);
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  });
  segs.forEach(function (b) {
    b.addEventListener("click", function () {
      stop(); side = b.dataset.v;
      segs.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      center.textContent = side === "L" ? "I" : "D";
    });
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
  window.addEventListener("blur", stop);
  if (!hasHw) note.textContent = "Vista previa: aún no hay un módulo de espejos conectado. Mantén pulsada la flecha para mover.";

  window.RadioMirrors = { setHardware: function (on) { hasHw = !!on; } };
})();
