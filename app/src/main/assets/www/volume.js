/* ==========================================================
   VOLUME — botón de volumen fijo (abajo) + ventana por lado
   · Un botón con el nivel y otro de silencio, siempre a la vista.
   · Al tocar el botón se abre una ventana con el volumen del conductor
     y del copiloto (por separado o «Juntos»).
   · El volumen general (RadioQuick.volume) es el más alto de los dos lados.
   · El reparto por lado lo aplica el amplificador/ESP32:
     RadioESP.send({c:"vol", l, r, mute}).
   Almacenamiento: "radio-volzones".
   ========================================================== */
(function () {
  "use strict";

  var Q = window.RadioQuick;
  var bars = { drv: document.getElementById("sbar-l"), pax: document.getElementById("sbar-r") };
  if (!Q || !bars.drv || !bars.pax) return;

  var KEY = "radio-volzones";
  var STEP = 5, IDLE_MS = 7000;
  var $ = function (id) { return document.getElementById(id); };
  var btns = { drv: $("vol-drv"), pax: $("vol-pax") }, vals = { drv: $("vol-drv-v"), pax: $("vol-pax-v") };
  var mute = $("vol-mute"), curSide = "drv";
  var pop = $("vpop"), link = $("vp-link"), note = $("vp-note");
  var tr = { drv: $("vp-drv"), pax: $("vp-pax") };
  var tv = { drv: $("vp-drv-v"), pax: $("vp-pax-v") };

  function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

  /* ---------- Estado ---------- */
  var st = (function () {
    var d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    var v = Q.get().volume;
    return {
      linked: !d || d.linked !== false,
      drv: d && isFinite(d.drv) ? clamp(d.drv) : v,
      pax: d && isFinite(d.pax) ? clamp(d.pax) : v
    };
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function master() { return Math.max(st.drv, st.pax); }

  /* ---------- Salida hacia el ESP32 ---------- */
  var sendT = null;
  function toHardware() {
    clearTimeout(sendT);
    sendT = setTimeout(function () {
      var m = Q.get();
      if (window.RadioESP) window.RadioESP.send({ c: "vol", l: st.drv, r: st.pax, mute: m.mute ? 1 : 0 });
      window.dispatchEvent(new CustomEvent("radio:volzones", { detail: { drv: st.drv, pax: st.pax, linked: st.linked } }));
    }, 90);
  }

  /* ---------- Cambios ---------- */
  var own = false;     // evita reescalar cuando el cambio lo hicimos nosotros
  function push() {
    own = true;
    Q.set({ volume: master(), mute: false });
    own = false;
    save(); render(Q.get()); toHardware();
  }
  function setZone(side, v) {
    v = clamp(v);
    if (st.linked) { st.drv = v; st.pax = v; } else st[side] = v;
    push();
  }
  function setMaster(v) {      // desde +/− del teclado o botones físicos: mueve los dos lados juntos
    v = clamp(v);
    var m = master();
    if (st.linked || m === 0) { st.drv = v; st.pax = v; }
    else { var f = v / m; st.drv = clamp(st.drv * f); st.pax = clamp(st.pax * f); }
    push();
  }

  /* ---------- Pintado ---------- */
  function render(s) {
    var muted = !!s.mute;
    ["drv", "pax"].forEach(function (k) {
      bars[k].classList.toggle("is-muted", muted);
      btns[k].style.setProperty("--lv", st[k] + "%");
      vals[k].textContent = String(muted ? 0 : st[k]);
      btns[k].setAttribute("aria-label", "Volumen del " + (k === "drv" ? "conductor" : "copiloto") + ", nivel " + st[k] + (muted ? ", en silencio" : ""));
      pop.querySelector('.vpop__row[data-side="' + k + '"]').classList.toggle("is-side", k === curSide);
    });
    mute.setAttribute("aria-pressed", String(muted));
    mute.setAttribute("aria-label", muted ? "Quitar silencio" : "Silenciar");
    ["drv", "pax"].forEach(function (k) {
      tr[k].style.setProperty("--v", st[k] + "%");
      tr[k].setAttribute("aria-valuenow", String(st[k]));
      tv[k].textContent = String(st[k]);
    });
    link.setAttribute("aria-pressed", String(st.linked));
    var hw = window.RadioESP && window.RadioESP.available();
    note.textContent = hw ? "" : "Vista previa: el reparto por lado se aplicará cuando el amplificador esté conectado al ESP32. Mientras tanto suena el nivel más alto.";
    note.hidden = !!hw;
  }

  /* ---------- Ventana ---------- */
  var idle = null;
  function bump() { clearTimeout(idle); idle = setTimeout(close, IDLE_MS); }
  function isOpen() { return pop.classList.contains("is-open"); }
  function open(side) {
    curSide = side === "pax" ? "pax" : "drv";
    if (window.RadioClimatePop && window.RadioClimatePop.close) window.RadioClimatePop.close();
    pop.dataset.side = curSide;
    pop.classList.add("is-open"); pop.setAttribute("aria-hidden", "false");
    btns.drv.setAttribute("aria-expanded", String(curSide === "drv")); btns.pax.setAttribute("aria-expanded", String(curSide === "pax"));
    render(Q.get()); bump();
  }
  function close() {
    clearTimeout(idle);
    pop.classList.remove("is-open"); pop.setAttribute("aria-hidden", "true");
    btns.drv.setAttribute("aria-expanded", "false"); btns.pax.setAttribute("aria-expanded", "false");
  }
  Object.keys(btns).forEach(function (k) {
    btns[k].addEventListener("click", function () { if (isOpen() && curSide === k) close(); else open(k); });
  });
  pop.querySelectorAll("[data-vp-close]").forEach(function (n) { n.addEventListener("click", close); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen()) { e.stopImmediatePropagation(); close(); } }, true);
  pop.addEventListener("pointerdown", bump);
  link.addEventListener("click", function () {
    st.linked = !st.linked;
    if (st.linked) { var m = master(); st.drv = m; st.pax = m; push(); } else { save(); render(Q.get()); }
    bump();
  });

  /* ---------- Barras: tocar o arrastrar ---------- */
  Object.keys(tr).forEach(function (side) {
    var t = tr[side], dragging = false;
    function from(e) { var r = t.getBoundingClientRect(); setZone(side, ((e.clientX - r.left) / r.width) * 100); }
    t.addEventListener("pointerdown", function (e) { dragging = true; t.classList.add("is-dragging"); t.setPointerCapture(e.pointerId); from(e); });
    t.addEventListener("pointermove", function (e) { if (dragging) from(e); });
    function end() { dragging = false; t.classList.remove("is-dragging"); }
    t.addEventListener("pointerup", end); t.addEventListener("pointercancel", end);
    t.addEventListener("keydown", function (e) {
      var v = st[side];
      if (e.key === "ArrowUp" || e.key === "ArrowRight") setZone(side, v + STEP);
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") setZone(side, v - STEP);
      else if (e.key === "Home") setZone(side, 0);
      else if (e.key === "End") setZone(side, 100);
      else return;
      e.preventDefault();
    });
  });

  /* ---------- Silencio ---------- */
  mute.addEventListener("click", function () { Q.set({ mute: !Q.get().mute }); });

  /* ---------- Sincronía con el panel de accesos rápidos y con Android ---------- */
  window.addEventListener("radio:quickchange", function (e) {
    var s = e.detail;
    if (!own && s.volume !== master()) {
      var m = master();
      if (st.linked || m === 0) { st.drv = s.volume; st.pax = s.volume; }
      else { var f = s.volume / m; st.drv = clamp(st.drv * f); st.pax = clamp(st.pax * f); }
      save(); toHardware();
    }
    render(s);
  });

  // Para que otros módulos (teclas físicas, voz) muevan los dos lados juntos
  window.RadioVolume = {
    get: function () { return { drv: st.drv, pax: st.pax, linked: st.linked, master: master() }; },
    set: setMaster,
    zone: setZone,
    open: function (side) { open(side); }, close: close
  };

  if (Q.get().volume !== master()) { own = true; Q.set({ volume: master() }); own = false; }
  render(Q.get());
})();
