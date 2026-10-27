/* ==========================================================
   AMBIENTE — luces RGB del interior
   Estado guardado en "radio-ambient". Sincronizado con el interruptor
   «Luz ambiental» de Vehículo. Salida para el hardware:
     · evento  radio:ambientchange  {power, brightness, effect, speed, zones:{dash:[r,g,b]…}, on:{…}}
     · AndroidBridge.ambient(json)  (si existe; lo recibirá el controlador de las tiras)
   Sin controlador conectado, esta pantalla es una vista previa.
   Sección: AMBIENTE
   ========================================================== */
(function () {
  "use strict";
  var root = document.getElementById("amb");
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "radio-ambient";
  var ZONES = ["dash", "feet", "doors", "rear"];
  var FX = ["static", "breathe", "rainbow", "wave", "pulse"];
  var SWATCHES = [
    { n: "Blanco cálido", h: 38, s: 0.3 }, { n: "Rojo", h: 0, s: 1 }, { n: "Naranja", h: 24, s: 1 }, { n: "Ámbar", h: 42, s: 1 },
    { n: "Verde", h: 140, s: 1 }, { n: "Turquesa", h: 176, s: 1 }, { n: "Azul", h: 215, s: 1 }, { n: "Violeta", h: 265, s: 1 }, { n: "Rosa", h: 320, s: 1 }
  ];
  var BUILTIN = [
    { n: "Relax", h: 215, s: 0.9, b: 45, fx: "breathe", sp: 2 },
    { n: "Cálido", h: 32, s: 0.6, b: 55, fx: "static", sp: 5 },
    { n: "Deportivo", h: 0, s: 1, b: 90, fx: "static", sp: 5 },
    { n: "Fiesta", h: 0, s: 1, b: 100, fx: "rainbow", sp: 7 },
    { n: "Hielo", h: 185, s: 0.8, b: 70, fx: "wave", sp: 3 }
  ];
  var DEF = { power: false, h: 215, s: 1, b: 80, fx: "static", sp: 5, on: { dash: true, feet: true, doors: true, rear: true }, mine: [] };
  var st = load();

  var el = {
    state: $("amb-state"), power: $("amb-power"), hint: $("amb-hint"), car: $("amb-car"),
    sw: $("amb-swatches"), hue: $("amb-hue"), bri: $("amb-bri"), briVal: $("amb-bri-val"),
    fx: $("amb-fx"), speed: $("amb-speed"), zones: $("amb-zones"), presets: $("amb-presets")
  };
  var AB = window.AndroidBridge || null;
  var hasHw = !!AB && typeof AB.ambient !== "undefined";

  function load() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    var s = Object.assign({}, DEF, d || {});
    s.on = Object.assign({}, DEF.on, (d && d.on) || {});
    s.mine = Array.isArray(s.mine) ? s.mine.slice(0, 4) : [];
    s.power = s.power === true;
    s.h = clamp(+s.h || 0, 0, 359); s.s = clamp(+s.s, 0, 1); if (isNaN(s.s)) s.s = 1;
    s.b = clamp(+s.b || DEF.b, 5, 100); s.sp = clamp(+s.sp || 5, 1, 10);
    if (FX.indexOf(s.fx) < 0) s.fx = "static";
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- Color ---------- */
  function hsv(h, s, v) {          // h 0-359, s/v 0-1 → [r,g,b] 0-255
    h = ((h % 360) + 360) % 360;
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function css(rgb) { return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")"; }

  /* ---------- Efectos: color de cada zona en el instante t (segundos) ---------- */
  var ORDER = { dash: 0, doors: 1, feet: 2, rear: 3 };
  function frame(t) {
    var sp = st.sp, base = st.b / 100, out = {};
    var reduce = document.documentElement.getAttribute("data-motion") === "reduce";
    ZONES.forEach(function (z) {
      var h = st.h, v = base;
      if (!reduce) {
        var ph = t * (0.25 + sp * 0.18), off = ORDER[z] * 0.18;
        if (st.fx === "breathe") v = base * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin((ph - off * 0.2) * Math.PI * 2)));
        else if (st.fx === "rainbow") h = st.h + (ph * 360) % 360 + ORDER[z] * 30;
        else if (st.fx === "wave") v = base * (0.2 + 0.8 * (0.5 + 0.5 * Math.sin((ph - off) * Math.PI * 2)));
        else if (st.fx === "pulse") { var p = (ph * 1.2) % 1; v = base * (p < 0.12 ? 1 - p / 0.12 * 0.1 : p < 0.3 ? 0.9 - (p - 0.12) / 0.18 * 0.65 : p < 0.42 ? 0.25 + (p - 0.3) / 0.12 * 0.6 : 0.85 - (p - 0.42) / 0.58 * 0.6); }
      }
      out[z] = hsv(h, st.fx === "rainbow" ? 1 : st.s, clamp(v, 0, 1));
    });
    return out;
  }

  /* ---------- Dibujo de la vista previa ---------- */
  var paths = {};
  ZONES.forEach(function (z) { paths[z] = Array.prototype.slice.call(el.car.querySelectorAll('.amb__z[data-z="' + z + '"]')); });
  var raf = 0, t0 = performance.now();
  function paint(t) {
    var f = frame(t);
    ZONES.forEach(function (z) {
      var c = css(f[z]);
      paths[z].forEach(function (p) { p.style.setProperty("--c", c); p.dataset.off = st.on[z] ? "false" : "true"; });
    });
  }
  function loop(now) {
    raf = 0;
    paint((now - t0) / 1000);
    if (shouldAnimate()) raf = requestAnimationFrame(loop);
  }
  function active() { var v = root.closest(".view"); return !!v && v.classList.contains("is-active"); }
  function shouldAnimate() {
    return st.power && st.fx !== "static" && active() && !document.hidden &&
      document.documentElement.getAttribute("data-motion") !== "reduce";
  }
  function kick() { paint((performance.now() - t0) / 1000); if (!raf && shouldAnimate()) raf = requestAnimationFrame(loop); }

  /* ---------- Salida (hardware / eventos) ---------- */
  function payload() {
    var f = frame(0), zones = {};
    ZONES.forEach(function (z) { zones[z] = f[z]; });
    return { power: st.power, brightness: st.b, effect: st.fx, speed: st.sp, hue: st.h, sat: st.s, zones: zones, on: Object.assign({}, st.on) };
  }
  function emit() {
    var p = payload();
    window.dispatchEvent(new CustomEvent("radio:ambientchange", { detail: p }));
    if (hasHw) { try { AB.ambient(JSON.stringify(p)); } catch (e) {} }
  }

  /* ---------- Render de controles ---------- */
  function renderControls() {
    root.dataset.power = st.power ? "on" : "off";
    root.dataset.fx = st.fx;
    el.power.setAttribute("aria-checked", String(st.power));
    el.state.textContent = st.power ? "Encendida" : "Apagada";
    el.hue.value = st.h; el.bri.value = st.b; el.briVal.textContent = st.b + "%"; el.speed.value = st.sp;
    Array.prototype.forEach.call(el.fx.querySelectorAll(".seg__btn"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === st.fx)); });
    Array.prototype.forEach.call(el.zones.querySelectorAll(".amb__zone"), function (b) { b.setAttribute("aria-pressed", String(!!st.on[b.dataset.z])); });
    Array.prototype.forEach.call(el.sw.querySelectorAll(".amb__sw"), function (b) {
      var i = +b.dataset.i, w = SWATCHES[i];
      b.setAttribute("aria-pressed", String(st.fx !== "rainbow" && Math.round(st.h) === w.h && Math.abs(st.s - w.s) < 0.01));
    });
    el.hint.textContent = hasHw ? "" : "Vista previa: aún no hay un controlador de luces conectado.";
  }

  function buildSwatches() {
    SWATCHES.forEach(function (w, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "amb__sw"; b.dataset.i = i; b.setAttribute("aria-label", w.n); b.setAttribute("aria-pressed", "false");
      b.style.setProperty("--c", css(hsv(w.h, w.s, 1)));
      b.addEventListener("click", function () { apply({ h: w.h, s: w.s, fx: st.fx === "rainbow" ? "static" : st.fx }, true); });
      el.sw.appendChild(b);
    });
  }
  function presetBtn(p, mine, idx) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "amb__preset";
    var i = document.createElement("i"); i.style.setProperty("--c", css(hsv(p.h, p.s, 1)));
    var n = document.createElement("span"); n.textContent = p.n;
    b.appendChild(i); b.appendChild(n);
    b.addEventListener("click", function () { apply({ h: p.h, s: p.s, b: p.b, fx: p.fx, sp: p.sp }, true); });
    if (mine) {   // pulsación larga: borrar
      var tm = null;
      b.addEventListener("pointerdown", function () { tm = setTimeout(function () { tm = null; st.mine.splice(idx, 1); save(); buildPresets(); toast("Ambiente eliminado"); }, 700); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { b.addEventListener(ev, function () { if (tm) { clearTimeout(tm); tm = null; } }); });
    }
    return b;
  }
  function buildPresets() {
    el.presets.textContent = "";
    BUILTIN.forEach(function (p) { el.presets.appendChild(presetBtn(p, false)); });
    st.mine.forEach(function (p, i) { el.presets.appendChild(presetBtn(p, true, i)); });
    var sv = document.createElement("button");
    sv.type = "button"; sv.className = "amb__preset amb__preset--save"; sv.textContent = "+ Guardar actual";
    sv.addEventListener("click", function () {
      if (st.mine.length >= 4) { toast("Ya tienes 4 ambientes propios", "Mantén pulsado uno para borrarlo.", true); return; }
      st.mine.push({ n: "Mi ambiente " + (st.mine.length + 1), h: st.h, s: st.s, b: st.b, fx: st.fx, sp: st.sp });
      save(); buildPresets(); toast("Ambiente guardado", "Mantén pulsado para borrarlo.");
    });
    el.presets.appendChild(sv);
  }
  function toast(title, text, bad) {
    if (window.RadioToast) window.RadioToast.show({ title: title, text: text || "", kind: bad ? "bad" : undefined, ms: 2500 });
  }

  /* ---------- Estado ---------- */
  var syncing = false;
  function apply(patch, turnOn) {
    Object.assign(st, patch);
    if (turnOn && !st.power) st.power = true;
    save(); renderControls(); kick(); emit(); syncVehicle();
  }
  function setPower(on) { on = !!on; if (st.power === on) { return; } apply({ power: on }); }

  // Interruptor «Luz ambiental» de Vehículo ↔ encendido de esta pestaña
  function syncVehicle() {
    var b = $("sw-amb");
    if (!b || syncing) return;
    if ((b.getAttribute("aria-checked") === "true") !== st.power) { syncing = true; b.click(); syncing = false; }
  }
  window.addEventListener("radio:vehiclechange", function (e) {
    if (syncing) return;
    var on = !!(e.detail && e.detail.state && e.detail.state.amb);
    if (on !== st.power) { syncing = true; setPower(on); syncing = false; }
  });
  (function initFromVehicle() {   // el estado inicial manda el de aquí
    var b = $("sw-amb");
    if (b && (b.getAttribute("aria-checked") === "true") !== st.power) { syncing = true; b.click(); syncing = false; }
  })();

  /* ---------- Eventos ---------- */
  el.power.addEventListener("click", function () { setPower(!st.power); });
  el.hue.addEventListener("input", function () { apply({ h: +el.hue.value, s: 1, fx: st.fx === "rainbow" ? "static" : st.fx }, true); });
  el.bri.addEventListener("input", function () { apply({ b: +el.bri.value }, true); });
  el.speed.addEventListener("input", function () { apply({ sp: +el.speed.value }); });
  el.fx.addEventListener("click", function (e) { var b = e.target.closest(".seg__btn"); if (b) apply({ fx: b.dataset.v }, true); });
  el.zones.addEventListener("click", function (e) {
    var b = e.target.closest(".amb__zone"); if (!b) return;
    var on = Object.assign({}, st.on); on[b.dataset.z] = !on[b.dataset.z];
    if (!ZONES.some(function (z) { return on[z]; })) { toast("Deja al menos una zona", "", true); return; }
    apply({ on: on });
  });
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("radio:systemchange", kick);
  // La vista cambia por clase: se vigila para arrancar/parar la animación
  var view = root.closest(".view");
  if (view) new MutationObserver(kick).observe(view, { attributes: true, attributeFilter: ["class"] });

  buildSwatches(); buildPresets(); renderControls(); kick();

  window.RadioAmbient = {
    get: function () { return payload(); },
    setPower: setPower,
    set: function (p) { if (p && typeof p === "object") apply(p); },
    /** Un controlador externo (ESP32, etc.) puede avisar que está conectado. */
    setHardware: function (on) { hasHw = !!on; renderControls(); }
  };
})();
