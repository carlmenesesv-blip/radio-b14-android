/* ==========================================================
   CLIMATE — lógica de la climatización
   - Temperatura por zona (conductor / pasajero) con sincronización
   - Ventilador (1–7), modo Auto, dirección del aire
   - A/C, recirculación, desempañadores, asientos y volante calefactados
   - Conecta la barra de abajo (temperatura y encendido) y la temperatura exterior
   Datos: por ahora la temperatura de cabina y exterior se simulan.
   Para conectar sensores reales: RadioClimate.setCabin(°C),
   RadioClimate.setOutside(°C) y RadioClimate.simulate(false).
   Almacenamiento: "radio-climate". Temperaturas internas en °C.
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-climate";
  var MIN = 16, MAX = 30, FAN_MAX = 7;
  var S = window.RadioSystem;
  var root = document.getElementById("clim");
  if (!root) return;

  var DEFAULTS = {
    power: true, auto: true, sync: true,
    driver: 22, pass: 22,
    fan: 3, mode: "both", ac: true, recirc: false,
    dfront: false, drear: false, wheel: false, seatD: 0, seatP: 0
  };

  function $(id) { return document.getElementById(id); }
  function cfg(k, d) { var v = S ? S.get(k) : null; return v == null || v === "" ? d : v; }
  function unitF() { return cfg("tempUnit", "c") === "f"; }
  function toF(c) { return c * 9 / 5 + 32; }
  function toC(f) { return (f - 32) * 5 / 9; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function stepC() { return Number(cfg("climStep", 0.5)) === 1 ? 1 : 0.5; }
  function snap(c) { var st = stepC(); return Math.round(c / st) * st; }

  /* ---------- Estado ---------- */
  var state = load();
  var prev = null;                 // valores previos al desempañar el parabrisas
  var cabin = 27, outside = 25;
  var simulating = true;
  var rearUntil = 0;

  function load() {
    var saved = null, fresh = false;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!saved || typeof saved !== "object") fresh = true;
    var s = Object.assign({}, DEFAULTS, saved || {});
    var start = cfg("climStart", "last");
    var def = clamp(Number(cfg("climDefault", 22)) || 22, MIN, MAX);
    if (fresh || start === "auto") { s.driver = def; s.pass = def; s.auto = true; s.power = true; s.ac = true; s.recirc = false; s.mode = "both"; s.fan = 3; }
    if (start === "off") s.power = false;
    /* Lo que consume energía o calienta no se restaura al encender */
    s.dfront = false; s.drear = false; s.wheel = false; s.seatD = 0; s.seatP = 0;
    ["power", "auto", "sync", "ac", "recirc"].forEach(function (k) { s[k] = s[k] === true; });
    s.driver = clamp(Number(s.driver) || def, MIN, MAX);
    s.pass = clamp(Number(s.pass) || def, MIN, MAX);
    s.fan = clamp(Math.round(Number(s.fan) || 3), 1, FAN_MAX);
    if (["face", "both", "feet", "wind"].indexOf(s.mode) < 0) s.mode = "both";
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- Formato ---------- */
  function num(c) {
    if (unitF()) return String(Math.round(toF(c)));
    var v = Math.round(c * 2) / 2;
    return (v % 1 ? v.toFixed(1) : String(v)).replace(".", ",");
  }
  function zoneText(c) { return c <= MIN ? "LO" : c >= MAX ? "HI" : num(c); }
  function unitText() { return unitF() ? "°F" : "°C"; }

  /* ---------- Cambios ---------- */
  function wake() { if (!state.power) state.power = true; }

  function setZone(zone, c) {
    c = clamp(c, MIN, MAX);
    wake();
    if (state.sync) { state.driver = c; state.pass = c; }
    else if (zone === "driver") state.driver = c; else state.pass = c;
    changed();
  }
  function stepZone(zone, dir) {
    var cur = zone === "driver" ? state.driver : state.pass, c;
    if (unitF()) {
      var f = Math.round(toF(cur)) + dir;
      c = f <= Math.ceil(toF(MIN)) ? MIN : f >= Math.floor(toF(MAX)) ? MAX : toC(f);
    } else c = snap(cur) + dir * stepC();
    setZone(zone, c);
  }
  function setFan(n) {
    wake();
    state.fan = clamp(Math.round(n), 1, FAN_MAX);
    state.auto = false;
    changed();
  }
  function setMode(m) { wake(); state.mode = m; state.auto = false; changed(); }

  function setAuto(on) {
    wake();
    state.auto = !!on;
    if (state.auto) { state.ac = true; applyAuto(); }
    changed();
  }

  /* Modo Auto: ventilador y dirección según la diferencia con la temperatura pedida */
  function target() { return (state.driver + state.pass) / 2; }
  function applyAuto() {
    if (!state.auto || !state.power) return;
    var diff = target() - cabin, ad = Math.abs(diff);
    state.fan = clamp(Math.round(1 + ad * 0.9), 1, FAN_MAX);
    if (!state.dfront) {
      state.mode = ad < 1.2 ? "both" : diff < 0 ? "face" : "feet";
      state.recirc = diff < -4;
      if (diff < -0.5) state.ac = true;
    }
  }

  function setPower(on) {
    state.power = !!on;
    if (!on) { state.dfront = false; prev = null; }
    changed();
  }

  function setDefrostFront(on) {
    var boost = cfg("climDefrost", true) !== false;
    if (on) {
      if (boost) {
        prev = { power: state.power, fan: state.fan, mode: state.mode, ac: state.ac, recirc: state.recirc, auto: state.auto };
        state.fan = Math.max(state.fan, 5); state.mode = "wind"; state.ac = true; state.recirc = false; state.auto = false;
      }
      state.power = true; state.dfront = true;
    } else {
      state.dfront = false;
      if (boost && prev) { Object.assign(state, prev); }
      prev = null;
    }
    changed();
  }

  function setDefrostRear(on) {
    state.drear = !!on;
    var min = Number(cfg("rearMin", 10)) || 0;
    rearUntil = on && min > 0 ? Date.now() + min * 60000 : 0;
    changed();
  }

  function cycleSeat(key) {
    var cur = state[key];
    state[key] = cur === 0 ? 3 : cur - 1;      // apagado → 3 → 2 → 1 → apagado
    changed();
  }

  function changed() {
    applyAuto();
    save();
    render();
    window.dispatchEvent(new CustomEvent("radio:climatechange", { detail: get() }));
  }

  /* ---------- Simulación de cabina ---------- */
  function tick() {
    if (rearUntil && Date.now() >= rearUntil) {
      rearUntil = 0; state.drear = false;
      if (window.RadioToast) window.RadioToast.show({ title: "Luneta desempañada", text: "Se apagó el desempañador trasero." });
      changed();
    }
    if (!simulating) { render(); return; }
    var t = state.power ? target() : outside;
    var rate = state.power ? 0.035 + state.fan * 0.012 : 0.006;
    if (state.power && !state.ac && t < outside) { t = outside; rate *= 0.5; }   // sin A/C no se enfría por debajo del exterior
    cabin += (t - cabin) * rate;
    if (Math.abs(t - cabin) < 0.05) cabin = t;
    applyAuto();
    render();
  }
  var timer = setInterval(tick, 3000);

  /* ---------- Interfaz ---------- */
  var el = {
    dVal: $("clim-d-val"), pVal: $("clim-p-val"), dRange: $("clim-d-range"), pRange: $("clim-p-range"),
    power: $("clim-power"), auto: $("clim-auto"), sync: $("clim-sync"),
    stateTxt: $("clim-state"), cabin: $("clim-cabin"), out: $("clim-out"),
    levels: $("clim-levels"), fanVal: $("clim-fan-val"), fanSub: $("clim-fan-sub"), fanIco: $("clim-fanico"),
    fdn: $("clim-fan-dn"), fup: $("clim-fan-up"), modes: $("clim-modes"),
    ac: $("clim-ac"), recirc: $("clim-recirc"), dfront: $("clim-dfront"), drear: $("clim-drear"), wheel: $("clim-wheel"),
    seatD: $("clim-d-seat"), seatP: $("clim-p-seat"),
    bars: { drv: $("sbar-l"), pax: $("sbar-r") }, cbBtn: { drv: $("cb-drv"), pax: $("cb-pax") }, cbVal: { drv: $("cb-drv-v"), pax: $("cb-pax-v") }, cbUnit: { drv: $("cb-drv-u"), pax: $("cb-pax-u") },
    topOut: $("temp-out"), topUnit: $("temp-unit")
  };

  function tone(c) { return c <= 18 ? "cold" : c >= 26 ? "hot" : ""; }
  function tile(btn, on, sub) {
    btn.setAttribute("aria-pressed", String(!!on));
    var s = btn.querySelector(".tile__s"); if (s) s.textContent = sub;
  }
  function setRange(r, c) {
    var f = unitF();
    r.min = f ? Math.ceil(toF(MIN)) : MIN;
    r.max = f ? Math.floor(toF(MAX)) : MAX;
    r.step = f ? 1 : stepC();
    r.value = f ? Math.round(toF(c)) : snap(c);
  }
  function stateLabel() {
    if (!state.power) return "Apagado";
    if (state.dfront) return "Desempañando parabrisas";
    if (!state.auto) return "Manual";
    var d = target() - cabin;
    return Math.abs(d) < 0.6 ? "Auto · Cabina a gusto" : d < 0 ? "Auto · Enfriando" : "Auto · Calentando";
  }
  function seatLabel(who, lv) { return "Asiento del " + who + " calefactado, " + (lv ? "nivel " + lv : "apagado"); }

  function render() {
    var u = unitText();
    var dz = zoneText(state.driver), pz = zoneText(state.pass);
    el.dVal.textContent = dz; el.pVal.textContent = pz;
    el.dVal.parentNode.dataset.tone = tone(state.driver); el.pVal.parentNode.dataset.tone = tone(state.pass);
    el.dVal.parentNode.querySelector(".clim__deg").textContent = /^\d/.test(dz) ? u : "";
    el.pVal.parentNode.querySelector(".clim__deg").textContent = /^\d/.test(pz) ? u : "";
    if (document.activeElement !== el.dRange) setRange(el.dRange, state.driver);
    if (document.activeElement !== el.pRange) setRange(el.pRange, state.pass);

    root.dataset.power = state.power ? "on" : "off";
    root.dataset.auto = state.auto ? "on" : "off";
    root.dataset.sync = state.sync ? "on" : "off";
    root.dataset.ac = state.ac ? "on" : "off";
    el.power.setAttribute("aria-pressed", String(state.power));
    el.power.setAttribute("aria-label", state.power ? "Apagar climatización" : "Encender climatización");
    el.auto.setAttribute("aria-pressed", String(state.auto && state.power));
    el.sync.setAttribute("aria-pressed", String(state.sync));
    el.stateTxt.textContent = stateLabel();
    el.cabin.textContent = num(cabin); el.out.textContent = num(outside);
    root.querySelectorAll("[data-unit]").forEach(function (n) { n.textContent = u; });

    var lv = state.power ? state.fan : 0;
    el.levels.querySelectorAll("button").forEach(function (b) { b.classList.toggle("is-on", Number(b.dataset.lv) <= lv); });
    el.fanVal.textContent = state.power ? String(state.fan) : "0";
    el.fanSub.textContent = !state.power ? "Apagado" : state.auto ? "Auto" : "Manual";
    el.fanIco.style.setProperty("--lv", String(Math.max(1, lv)));
    el.fanIco.classList.toggle("is-spin", lv > 0);
    el.fdn.disabled = state.fan <= 1; el.fup.disabled = state.fan >= FAN_MAX;
    el.modes.querySelectorAll(".mode").forEach(function (b) { b.setAttribute("aria-pressed", String(state.power && b.dataset.mode === state.mode)); });

    tile(el.ac, state.ac, state.ac ? "Encendido" : "Apagado");
    tile(el.recirc, state.recirc, state.recirc ? "Recirculando" : "Aire exterior");
    tile(el.dfront, state.dfront, state.dfront ? "Activo" : "Desempañar");
    var left = rearUntil ? Math.max(1, Math.ceil((rearUntil - Date.now()) / 60000)) : 0;
    tile(el.drear, state.drear, state.drear ? (left ? "Se apaga en " + left + " min" : "Activo") : "Desempañar");
    tile(el.wheel, state.wheel, state.wheel ? "Activo" : "Calefactado");
    el.seatD.dataset.lv = String(state.seatD); el.seatP.dataset.lv = String(state.seatP);
    el.seatD.setAttribute("aria-label", seatLabel("conductor", state.seatD));
    el.seatP.setAttribute("aria-label", seatLabel("pasajero", state.seatP));

    /* Barra de abajo (siempre visible) y barra superior */
    if (el.cbVal.drv) {
      var zt = { drv: dz, pax: pz }, zs = { drv: state.driver, pax: state.pass };
      ["drv", "pax"].forEach(function (k) {
        el.cbVal[k].textContent = zt[k];
        el.cbUnit[k].textContent = /^\d/.test(zt[k]) ? u : "";
        el.bars[k].dataset.power = state.power ? "on" : "off";
        el.cbBtn[k].dataset.tone = tone(zs[k]);
      });
    }
    if (el.topOut) el.topOut.textContent = num(outside).replace(",", ".");
    if (el.topUnit) el.topUnit.textContent = u;
  }

  /* ---------- Entradas ---------- */
  /* Botón con repetición al mantener pulsado */
  function hold(btn, fn) {
    var t1 = null, t2 = null;
    function stop() { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; }
    btn.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      stop(); fn();
      t1 = setTimeout(function () { t2 = setInterval(fn, 140); }, 420);
    });
    ["pointerup", "pointerleave", "pointercancel", "blur"].forEach(function (ev) { btn.addEventListener(ev, stop); });
    btn.addEventListener("click", function (e) { if (e.detail === 0) fn(); });      // teclado
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  root.querySelectorAll(".clim__step").forEach(function (b) {
    hold(b, function () { stepZone(b.dataset.zone, Number(b.dataset.dir)); });
  });
  [[el.dRange, "driver"], [el.pRange, "pass"]].forEach(function (p) {
    p[0].addEventListener("input", function () {
      var v = Number(p[0].value);
      var c = unitF() ? (v <= Math.ceil(toF(MIN)) ? MIN : v >= Math.floor(toF(MAX)) ? MAX : toC(v)) : v;
      setZone(p[1], c);
    });
  });
  hold(el.fdn, function () { setFan(state.fan - 1); });
  hold(el.fup, function () { setFan(state.fan + 1); });
  el.levels.querySelectorAll("button").forEach(function (b) { b.addEventListener("click", function () { setFan(Number(b.dataset.lv)); }); });
  el.modes.querySelectorAll(".mode").forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.mode); }); });
  el.power.addEventListener("click", function () { setPower(!state.power); });
  el.auto.addEventListener("click", function () { setAuto(!(state.auto && state.power)); });
  el.sync.addEventListener("click", function () {
    state.sync = !state.sync;
    if (state.sync) state.pass = state.driver;
    changed();
  });
  el.ac.addEventListener("click", function () { wake(); state.ac = !state.ac; changed(); });
  el.recirc.addEventListener("click", function () { wake(); state.recirc = !state.recirc; changed(); });
  el.dfront.addEventListener("click", function () { setDefrostFront(!state.dfront); });
  el.drear.addEventListener("click", function () { setDefrostRear(!state.drear); });
  el.wheel.addEventListener("click", function () { state.wheel = !state.wheel; changed(); });
  el.seatD.addEventListener("click", function () { cycleSeat("seatD"); });
  el.seatP.addEventListener("click", function () { cycleSeat("seatP"); });

  /* Botón de encendido de la barra de abajo: hace lo mismo que el botón de la ventana */

  window.addEventListener("radio:systemchange", function (e) {
    var ch = (e.detail && e.detail.changed) || [];
    if (ch.indexOf("tempUnit") >= 0 || ch.indexOf("climStep") >= 0) render();
  });

  /* ---------- API ---------- */
  function get() {
    return Object.assign({}, state, { cabin: cabin, outside: outside, target: target() });
  }
  window.RadioClimate = {
    get: get,
    set: function (patch) {
      if (!patch) return;
      ["driver", "pass"].forEach(function (k) { if (patch[k] != null) state[k] = clamp(Number(patch[k]) || state[k], MIN, MAX); });
      ["power", "auto", "sync", "ac", "recirc", "wheel"].forEach(function (k) { if (patch[k] != null) state[k] = !!patch[k]; });
      if (patch.fan != null) state.fan = clamp(Math.round(Number(patch.fan) || state.fan), 1, FAN_MAX);
      if (patch.mode && ["face", "both", "feet", "wind"].indexOf(patch.mode) >= 0) state.mode = patch.mode;
      changed();
    },
    setCabin: function (c) { if (isFinite(c)) { cabin = Number(c); render(); } },
    setOutside: function (c) { if (isFinite(c)) { outside = Number(c); render(); } },
    simulate: function (on) { simulating = !!on; },
    step: stepZone
  };

  applyAuto();
  render();
})();
