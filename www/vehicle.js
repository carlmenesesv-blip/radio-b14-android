/* ==========================================================
   VEHICLE — lógica de los controles del auto en Home
   - Interruptores: neblineras, ventilador forzado, luz ambiental
   - Accesos directos: pantalla, atenuar, faros, cabina
   - Salud (voltaje + temperatura) y combustible con zonas de alerta
   Datos: por ahora simulados. Para conectar datos reales (OBD-II,
   CAN, etc.) llama a  RadioVehicle.setTelemetry({voltage, temp, fuel})
   y desactiva la simulación con  RadioVehicle.simulate(false).
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-vehicle";
  var DIM_LEVEL = 25;
  var Q = window.RadioQuick;

  var DEFAULTS = { fog: false, fan: false, amb: false, head: false, cabin: false, dim: false, prevBrightness: 100 };
  var state = load();
  var tele = { voltage: null, temp: null, fuel: null };   // sin datos hasta que el ESP32 los envíe
  var simulating = false;

  /* Zonas: [desde, hasta, estado] */
  var ZONES = {
    voltage: { min: 10, max: 16, zones: [[10, 11.8, "bad"], [11.8, 12.4, "warn"], [12.4, 14.8, "ok"], [14.8, 15.2, "warn"], [15.2, 16, "bad"]] },
    temp:    { min: 40, max: 130, zones: [[40, 100, "ok"], [100, 108, "warn"], [108, 130, "bad"]] }
  };
  var LABEL = { ok: "Normal", warn: "Atención", bad: "Crítico" };
  var FUEL_LABEL = { ok: "Nivel normal", warn: "Nivel bajo", bad: "Reserva" };
  var RANK = { ok: 0, warn: 1, bad: 2 };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    car: $("car"), health: $("health"), fuel: $("fuel"), alert: $("sb-alert"),
    overall: $("health-overall"),
    mVolt: $("m-volt"), voltVal: $("volt-val"), voltZone: $("volt-zone"), voltStatus: $("volt-status"),
    mTemp: $("m-temp"), tempVal: $("temp-val"), tempZone: $("temp-zone"), tempStatus: $("temp-status"),
    fuelVal: $("fuel-val"), fuelGauge: $("fuel-gauge"), fuelStatus: $("fuel-status"),
    screen: $("screenoff"),
    qScreen: $("qb-screen"), qDim: $("qb-dim"), qHead: $("qb-head"), qCabin: $("qb-cabin")
  };
  if (!el.car) return;

  var rockers = {
    fog: { btn: $("sw-fog"), on: "Encendidas", off: "Apagadas" },
    fan: { btn: $("sw-fan"), on: "Encendido", off: "Apagado" },
    amb: { btn: $("sw-amb"), on: "Encendida", off: "Apagada" }
  };

  /* ---------- Estado guardado ---------- */
  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    var s = Object.assign({}, DEFAULTS, saved || {});
    Object.keys(DEFAULTS).forEach(function (k) {
      if (typeof DEFAULTS[k] === "boolean") s[k] = s[k] === true;
    });
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- Zonas y estados ---------- */
  function classify(kind, v) {
    var z = ZONES[kind].zones;
    for (var i = 0; i < z.length; i++) if (v >= z[i][0] && v < z[i][1]) return z[i][2];
    return v < z[0][0] ? z[0][2] : z[z.length - 1][2];
  }
  function fuelState(v) { return v <= 10 ? "bad" : v <= 25 ? "warn" : "ok"; }
  function worst(list) { return list.reduce(function (a, b) { return RANK[b] > RANK[a] ? b : a; }, "ok"); }
  function pct(kind, v) {
    var c = ZONES[kind];
    return Math.max(0, Math.min(100, ((v - c.min) / (c.max - c.min)) * 100));
  }

  function buildZone(node, kind) {
    var c = ZONES[kind];
    c.zones.forEach(function (z) {
      var seg = document.createElement("i");
      seg.className = "zone__seg";
      seg.dataset.state = z[2];
      seg.style.left = pct(kind, z[0]) + "%";
      seg.style.width = pct(kind, z[1]) - pct(kind, z[0]) + "%";
      node.insertBefore(seg, node.firstChild);
    });
    // Orden natural (el marcador queda al final, encima)
    var mark = node.querySelector(".zone__mark");
    node.appendChild(mark);
    Array.prototype.slice.call(node.querySelectorAll(".zone__seg")).reverse().forEach(function (s) { node.insertBefore(s, mark); });
  }

  function setStatus(node, st, text) {
    node.dataset.state = st;
    node.querySelector("b").textContent = text;
  }

  /* ---------- Render: salud y combustible ---------- */
  function has(v) { return typeof v === "number" && isFinite(v); }
  function renderTelemetry() {
    var hv = has(tele.voltage), ht = has(tele.temp), hf = has(tele.fuel);
    var sv = hv ? classify("voltage", tele.voltage) : "ok";
    var st = ht ? classify("temp", tele.temp) : "ok";
    var sf = hf ? fuelState(tele.fuel) : "ok";
    var sh = worst([sv, st]);

    el.mVolt.dataset.nodata = hv ? "" : "1"; el.mTemp.dataset.nodata = ht ? "" : "1"; el.fuel.dataset.nodata = hf ? "" : "1";
    el.health.dataset.nodata = hv || ht ? "" : "1";

    el.voltVal.textContent = hv ? tele.voltage.toFixed(1) : "—";
    el.mVolt.dataset.state = sv;
    el.voltZone.querySelector(".zone__mark").style.setProperty("--pos", (hv ? pct("voltage", tele.voltage) : 0) + "%");
    setStatus(el.voltStatus, sv, hv ? LABEL[sv] : "Sin datos");
    el.mVolt.setAttribute("aria-label", hv ? "Voltaje " + tele.voltage.toFixed(1) + " voltios, " + LABEL[sv].toLowerCase() : "Voltaje: sin datos");

    el.tempVal.textContent = ht ? String(Math.round(tele.temp)) : "—";
    el.mTemp.dataset.state = st;
    el.tempZone.querySelector(".zone__mark").style.setProperty("--pos", (ht ? pct("temp", tele.temp) : 0) + "%");
    setStatus(el.tempStatus, st, ht ? LABEL[st] : "Sin datos");
    el.mTemp.setAttribute("aria-label", ht ? "Temperatura del motor " + Math.round(tele.temp) + " grados, " + LABEL[st].toLowerCase() : "Temperatura del motor: sin datos");

    el.health.dataset.state = sh;
    setStatus(el.overall, sh, hv || ht ? LABEL[sh] : "Sin datos");

    var f = hf ? Math.max(0, Math.min(100, Math.round(tele.fuel))) : 0;
    el.fuelVal.textContent = hf ? String(f) : "—";
    el.fuel.dataset.state = sf;
    el.fuel.style.setProperty("--lvl", f + "%");
    el.fuelGauge.setAttribute("aria-label", hf ? "Nivel de combustible " + f + " por ciento" : "Combustible: sin datos");
    setStatus(el.fuelStatus, sf, hf ? FUEL_LABEL[sf] : "Sin datos");

    // Alerta global en la barra de estado
    var all = worst([hv ? sv : "ok", ht ? st : "ok", hf ? sf : "ok"]);
    var msgs = [];
    if (hv && sv !== "ok") msgs.push("voltaje " + LABEL[sv].toLowerCase());
    if (ht && st !== "ok") msgs.push("temperatura " + LABEL[st].toLowerCase());
    if (hf && sf !== "ok") msgs.push("combustible " + FUEL_LABEL[sf].toLowerCase());
    if (el.alert) {
      el.alert.classList.toggle("is-off", all === "ok");
      el.alert.dataset.state = all;
      el.alert.setAttribute("aria-label", all === "ok" ? "Sin alertas" : "Alerta del vehículo: " + msgs.join(", "));
    }
    return { voltage: sv, temp: st, fuel: sf, health: sh, overall: all };
  }

  /* ---------- Render: interruptores y accesos ---------- */
  function renderControls() {
    Object.keys(rockers).forEach(function (k) {
      var r = rockers[k], on = !!state[k];
      r.btn.setAttribute("aria-checked", String(on));
      r.btn.querySelector(".rocker__state").textContent = on ? r.on : r.off;
      el.car.dataset[k] = on ? "on" : "off";
    });
    el.car.dataset.head = state.head ? "on" : "off";
    el.car.dataset.cabin = state.cabin ? "on" : "off";
    el.qHead.setAttribute("aria-pressed", String(state.head));
    el.qCabin.setAttribute("aria-pressed", String(state.cabin));
    el.qDim.setAttribute("aria-pressed", String(state.dim));
  }

  function emit() {
    var status = renderTelemetry();
    window.dispatchEvent(new CustomEvent("radio:vehiclechange", {
      detail: { state: Object.assign({}, state), telemetry: Object.assign({}, tele), status: status }
    }));
  }

  /* ---------- Acciones ---------- */
  function set(patch) {
    var before = Object.assign({}, state);
    Object.assign(state, patch);
    // Interruptores físicos: neblineras, ventilador forzado, faros y luz de cabina van al ESP32
    ["fog", "fan", "head", "cabin"].forEach(function (k) {
      if (patch && k in patch && before[k] !== state[k] && window.RadioESP) window.RadioESP.send({ c: "sw", n: k, v: state[k] ? 1 : 0 });
    });
    save();
    renderControls();
    emit();
  }

  Object.keys(rockers).forEach(function (k) {
    rockers[k].btn.addEventListener("click", function () {
      var patch = {}; patch[k] = !state[k]; set(patch);
    });
  });
  el.qHead.addEventListener("click", function () { set({ head: !state.head }); });
  el.qCabin.addEventListener("click", function () { set({ cabin: !state.cabin }); });

  /* Atenuar: baja el brillo a un nivel fijo y lo restaura al volver a tocar */
  el.qDim.addEventListener("click", function () {
    if (!Q) return;
    if (!state.dim) {
      var cur = Q.get().brightness;
      set({ dim: true, prevBrightness: cur > DIM_LEVEL ? cur : 100 });
      Q.set({ brightness: DIM_LEVEL });
    } else {
      set({ dim: false });
      Q.set({ brightness: state.prevBrightness });
    }
  });
  // Si el brillo se cambia desde otro lugar, el atenuador deja de estar activo
  window.addEventListener("radio:quickchange", function (e) {
    if (state.dim && e.detail.brightness !== DIM_LEVEL) set({ dim: false });
  });

  /* Pantalla: se apaga (negro) y se enciende con un toque. El audio sigue sonando */
  function screenOff() {
    el.screen.classList.add("is-on");
    el.screen.setAttribute("aria-hidden", "false");
    el.screen.tabIndex = 0;
    el.screen.focus({ preventScroll: true });
  }
  function screenOn() {
    el.screen.classList.remove("is-on");
    el.screen.setAttribute("aria-hidden", "true");
    el.screen.tabIndex = -1;
    el.qScreen.focus({ preventScroll: true });
  }
  el.qScreen.addEventListener("click", screenOff);
  el.screen.addEventListener("click", screenOn);

  /* ---------- Telemetría ---------- */
  function setTelemetry(patch) {
    ["voltage", "temp", "fuel"].forEach(function (k) {
      if (patch && typeof patch[k] === "number" && isFinite(patch[k])) tele[k] = patch[k];
    });
    emit();
  }

  /* Simulación suave mientras no haya datos reales */
  function jitter(v, amp, lo, hi) {
    return Math.max(lo, Math.min(hi, v + (Math.random() * 2 - 1) * amp));
  }
  setInterval(function () {
    if (!simulating || document.hidden) return;
    tele.voltage = jitter(has(tele.voltage) ? tele.voltage : 13.8, 0.06, 13.6, 14.1);
    tele.temp = jitter(has(tele.temp) ? tele.temp : 88, 0.6, 86, 91);
    emit();
  }, 2500);

  /* ---------- Inicio ---------- */
  buildZone(el.voltZone, "voltage");
  buildZone(el.tempZone, "temp");
  renderControls();
  emit();

  window.RadioVehicle = {
    get: function () { return { state: Object.assign({}, state), telemetry: Object.assign({}, tele) }; },
    set: set,
    setTelemetry: setTelemetry,
    simulate: function (on) { simulating = !!on; },
    screenOff: screenOff,
    screenOn: screenOn
  };
})();
