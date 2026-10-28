/* ==========================================================
   CAR — sección Vehículo
   - Puertas, capó y maletero, luces y presión de llantas
   - Viaje (km, tiempo en marcha, promedio, máxima) con la velocidad del GPS
   - Odómetro y mantenimiento por kilometraje
   - Alertas, tarjeta de puertas de Inicio y cámara de reversa automática
   Datos: sin hardware conectado funcionan en modo «Demostración»
   (tocas puertas, luces y llantas para simular). Para datos reales:
     RadioCar.update({ doors:{fl:true}, lights:{reverse:true},
                       tires:{fl:220}, odometer:12345 })   // llantas en kPa
     RadioCar.setDemo(false)
   Almacenamiento: "radio-car".
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-car";
  var S = window.RadioSystem;
  var root = document.getElementById("cv");
  if (!root) return;

  var KPA_PSI = 6.894757;
  var DOOR_NAMES = { fl: "Conductor", fr: "Pasajero", rl: "Trasera izquierda", rr: "Trasera derecha", hood: "Capó", trunk: "Maletero" };
  var DOOR_LONG = { fl: "Puerta del conductor abierta", fr: "Puerta del pasajero abierta", rl: "Puerta trasera izquierda abierta", rr: "Puerta trasera derecha abierta", hood: "Capó abierto", trunk: "Maletero abierto" };
  var TIRE_NAMES = { fl: "delantera izquierda", fr: "delantera derecha", rl: "trasera izquierda", rr: "trasera derecha" };
  var SERVICES = [
    { id: "oil", name: "Cambio de aceite", every: 5000 },
    { id: "service", name: "Revisión general", every: 10000 },
    { id: "tires", name: "Rotación de llantas", every: 10000 },
    { id: "brakes", name: "Revisión de frenos", every: 20000 }
  ];

  function $(id) { return document.getElementById(id); }
  function cfg(k, d) { var v = S ? S.get(k) : null; return v == null || v === "" ? d : v; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- Estado ---------- */
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  var st = {
    locked: saved.locked !== false,
    demo: saved.demo !== false,
    odo: Math.max(0, Number(saved.odo) || 0),
    trip: Object.assign({ km: 0, secs: 0, max: 0 }, saved.trip || {}),
    prevTrip: saved.prevTrip || null,
    svc: Object.assign({ oil: null, service: null, tires: null, brakes: null }, saved.svc || {}),
    lastMove: Number(saved.lastMove) || 0
  };
  var doors = { fl: false, fr: false, rl: false, rr: false, hood: false, trunk: false };
  var lights = { head: false, brake: false, reverse: false, turnL: false, turnR: false, hazard: false };
  var tires = { fl: null, fr: null, rl: null, rr: null };       // null = presión recomendada
  var speed = 0, speedSeen = 0, lastT = 0, dirty = false;

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ locked: st.locked, demo: st.demo, odo: st.odo, trip: st.trip, prevTrip: st.prevTrip, svc: st.svc, lastMove: st.lastMove })); } catch (e) {}
    dirty = false;
  }
  setInterval(function () { if (dirty) persist(); }, 10000);
  window.addEventListener("pagehide", function () { if (dirty) persist(); });

  /* ---------- Unidades ---------- */
  var KM_MI = 1.609344;
  function mi() { return cfg("distance", "km") === "mi"; }
  function dKm(km) { return mi() ? km / KM_MI : km; }
  function unitDist() { return mi() ? "mi" : "km"; }
  function unitSpd() { return S ? S.fmt.unitSpeed() : "km/h"; }
  function spd(kmh) { return S ? S.fmt.speedValue(kmh) : Math.round(kmh); }
  /* Número con punto de miles y coma decimal: 12.345 · 3,4 */
  function nf(v, dec) {
    var f = Math.abs(v).toFixed(dec || 0).split(".");
    f[0] = f[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (v < 0 ? "-" : "") + f.join(",");
  }
  function pressText(kpa) { return S ? S.fmt.press(kpa) : Math.round(kpa / KPA_PSI) + " psi"; }
  function recKpa() { return Number(cfg("tirePsi", 32)) * KPA_PSI; }
  function tireKpa(k) { return tires[k] == null ? recKpa() : tires[k]; }
  function fmtTime(s) {
    s = Math.round(s);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + " h " + pad(m) + " min" : m + ":" + pad(s % 60);
  }

  /* ---------- Evaluaciones ---------- */
  function tireState(kpa) {
    var r = kpa / recKpa();
    if (r < 0.75) return ["bad", "Muy baja"];
    if (r < 0.88) return ["warn", "Baja"];
    if (r > 1.35) return ["bad", "Muy alta"];
    if (r > 1.2) return ["warn", "Alta"];
    return ["ok", "Normal"];
  }
  function remaining(sv) {
    var last = st.svc[sv.id];
    return last == null ? null : last + sv.every - st.odo;
  }
  function openDoors() { return Object.keys(doors).filter(function (k) { return doors[k]; }); }

  function alerts() {
    var out = [], moving = speed > 8 && Date.now() - speedSeen < 6000;
    var od = openDoors();
    od.forEach(function (k) { out.push({ level: moving ? "bad" : "warn", text: DOOR_LONG[k] }); });
    Object.keys(tires).forEach(function (k) {
      var s = tireState(tireKpa(k));
      if (s[0] !== "ok") out.push({ level: s[0], text: "Llanta " + TIRE_NAMES[k] + ": " + s[1].toLowerCase() + " (" + pressText(tireKpa(k)) + ")" });
    });
    var warn = Number(cfg("serviceWarnKm", 500));
    SERVICES.forEach(function (sv) {
      var r = remaining(sv);
      if (r == null) return;
      if (r < 0) out.push({ level: "bad", text: sv.name + " vencido hace " + nf(Math.round(dKm(-r))) + " " + unitDist() });
      else if (r <= warn) out.push({ level: "warn", text: sv.name + " en " + nf(Math.round(dKm(r))) + " " + unitDist() });
    });
    return out;
  }

  /* ---------- Interfaz ---------- */
  var el = {
    alerts: $("cv-alerts"), aTitle: $("cv-alert-title"), aSub: $("cv-alert-sub"), aList: $("cv-alert-list"),
    sum: $("cv-doors-sum"), demo: $("cv-demo"),
    tKm: $("cv-trip-km"), tUnit: $("cv-trip-unit"), tTime: $("cv-trip-time"), tAvg: $("cv-trip-avg"), tAvgU: $("cv-trip-avgu"),
    tMax: $("cv-trip-max"), tMaxU: $("cv-trip-maxu"), tNote: $("cv-trip-note"), tReset: $("cv-trip-reset"),
    odo: $("cv-odo"), odoU: $("cv-odo-u"), odoEdit: $("cv-odo-edit"), odoForm: $("cv-odo-form"), odoIn: $("cv-odo-in"), odoCancel: $("cv-odo-cancel"),
    svc: $("cv-svc"),
    hCard: document.querySelector(".card--doors"), hChip: $("speed-chip")
  };
  var home = {
    state: el.hCard && el.hCard.querySelector(".doors__state"),
    sub: el.hCard && el.hCard.querySelector(".doors__sub"),
    btn: el.hCard && el.hCard.querySelector(".btn-round")
  };

  function renderAlerts() {
    var list = alerts();
    var worst = list.some(function (a) { return a.level === "bad"; }) ? "bad" : list.length ? "warn" : "ok";
    el.alerts.dataset.state = worst;
    var ic = el.alerts.querySelector(".cv__alerts-ico use");
    if (ic) ic.setAttribute("href", worst === "ok" ? "#i-check" : "#i-alert");
    el.aTitle.textContent = !list.length ? "Todo en orden" : list.length === 1 ? list[0].text : list.length + " alertas";
    el.aSub.textContent = !list.length ? "Sin alertas del vehículo." : list.length === 1 ? (worst === "bad" ? "Requiere atención." : "Conviene revisarlo.") : "Revisa los detalles.";
    el.aList.textContent = "";
    if (list.length > 1) list.forEach(function (a) {
      var c = document.createElement("span"); c.className = "cv__achip"; c.dataset.level = a.level; c.textContent = a.text; el.aList.appendChild(c);
    });
  }

  function renderDiagram() {
    root.querySelectorAll("[data-part]").forEach(function (n) {
      var open = !!doors[n.dataset.part];
      n.classList.toggle("is-open", open);
      n.setAttribute("aria-pressed", String(open));
    });
    var od = openDoors();
    el.sum.textContent = od.length ? "Abierto: " + od.map(function (k) { return DOOR_NAMES[k]; }).join(", ") : "Todas las puertas cerradas";
    el.sum.dataset.state = od.length ? "warn" : "ok";

    root.querySelectorAll(".tire").forEach(function (b) {
      var k = b.dataset.tire, s = tireState(tireKpa(k));
      b.dataset.state = s[0];
      b.querySelector(".tire__val").textContent = pressText(tireKpa(k));
      b.setAttribute("aria-label", "Llanta " + TIRE_NAMES[k] + ", " + pressText(tireKpa(k)) + ", " + s[1].toLowerCase());
    });

    var tl = lights.turnL || lights.hazard, tr = lights.turnR || lights.hazard;
    root.querySelectorAll(".lamp--head").forEach(function (n) { n.classList.toggle("is-on", lights.head); });
    root.querySelectorAll(".lamp--brake").forEach(function (n) { n.classList.toggle("is-on", lights.brake || lights.head); n.classList.toggle("is-hard", lights.brake); });
    root.querySelectorAll(".lamp--rev").forEach(function (n) { n.classList.toggle("is-on", lights.reverse); });
    root.querySelectorAll(".lamp--tl").forEach(function (n) { n.classList.toggle("is-blink", tl); });
    root.querySelectorAll(".lamp--tr").forEach(function (n) { n.classList.toggle("is-blink", tr); });
    root.querySelectorAll(".lchip").forEach(function (b) {
      var on = !!lights[b.dataset.light];
      b.setAttribute("aria-pressed", String(on));
      b.disabled = !st.demo;
    });
    root.dataset.demo = st.demo ? "on" : "off";
    el.demo.setAttribute("aria-pressed", String(st.demo));
  }

  function renderTrip() {
    var t = st.trip, avg = t.secs > 0 ? t.km / (t.secs / 3600) : 0;
    el.tKm.textContent = nf(dKm(t.km), 1);
    el.tUnit.textContent = unitDist();
    el.tTime.textContent = fmtTime(t.secs);
    el.tAvg.textContent = String(spd(avg)); el.tAvgU.textContent = unitSpd();
    el.tMax.textContent = String(spd(t.max)); el.tMaxU.textContent = unitSpd();
    var live = Date.now() - speedSeen < 15000;
    el.tNote.hidden = live;
    if (!live) el.tNote.textContent = st.prevTrip
      ? "Sin señal de velocidad. Viaje anterior: " + nf(dKm(st.prevTrip.km), 1) + " " + unitDist() + "."
      : "Se calcula con el GPS. Activa la ubicación en los accesos rápidos.";
    if (el.hChip) el.hChip.textContent = "Viaje " + nf(dKm(t.km), 1) + " " + unitDist();
  }

  function renderMaint() {
    el.odo.textContent = nf(Math.round(dKm(st.odo)));
    el.odoU.textContent = unitDist();
    var warn = Number(cfg("serviceWarnKm", 500));
    el.svc.textContent = "";
    SERVICES.forEach(function (sv) {
      var r = remaining(sv), li = document.createElement("li");
      li.className = "svc"; li.dataset.id = sv.id;
      var level = r == null ? "none" : r < 0 ? "bad" : r <= warn ? "warn" : "ok";
      li.dataset.state = level;
      var pct = r == null ? 0 : Math.max(0, Math.min(100, ((sv.every - Math.max(r, 0)) / sv.every) * 100));
      var txt = r == null ? "Sin registrar" : r < 0 ? "Vencido hace " + nf(Math.round(dKm(-r))) + " " + unitDist() : "Faltan " + nf(Math.round(dKm(r))) + " " + unitDist();
      li.innerHTML = '<div class="svc__top"><span class="svc__name"></span><button type="button" class="btn-pill svc__btn"></button></div>' +
        '<div class="svc__bar"><i></i></div><div class="svc__sub"></div>';
      li.querySelector(".svc__name").textContent = sv.name;
      li.querySelector(".svc__btn").textContent = r == null ? "Registrar" : "Hecho";
      li.querySelector(".svc__btn").setAttribute("aria-label", (r == null ? "Registrar " : "Marcar como hecho: ") + sv.name);
      li.querySelector(".svc__bar > i").style.width = pct + "%";
      li.querySelector(".svc__sub").textContent = txt + " · cada " + nf(Math.round(dKm(sv.every))) + " " + unitDist();
      el.svc.appendChild(li);
    });
  }

  function renderHome() {
    if (!el.hCard) return;
    var od = openDoors();
    el.hCard.dataset.locked = String(st.locked);
    el.hCard.dataset.open = od.length ? "true" : "false";
    if (home.state) home.state.textContent = od.length ? (od.length === 1 && od[0] !== "hood" && od[0] !== "trunk" ? "Puerta abierta" : od.length === 1 ? DOOR_NAMES[od[0]] + " abierto" : od.length + " abiertos") : st.locked ? "Bloqueadas" : "Desbloqueadas";
    if (home.sub) home.sub.textContent = od.length ? od.map(function (k) { return DOOR_NAMES[k]; }).join(", ") : "Todas las puertas";
    if (home.btn) {
      home.btn.setAttribute("aria-pressed", String(st.locked));
      home.btn.setAttribute("aria-label", st.locked ? "Desbloquear puertas" : "Bloquear puertas");
    }
  }

  /* Icono de alerta de la barra superior: junta el voltaje/temperatura/combustible (vehicle.js) con puertas, llantas y servicios */
  var sbAlert = $("sb-alert"), vStatus = null;
  var RANK = { ok: 0, warn: 1, bad: 2 };
  function syncStatusAlert() {
    if (!sbAlert) return;
    var msgs = [], worst = "ok";
    if (vStatus) {
      [["voltage", "voltaje"], ["temp", "temperatura del motor"], ["fuel", "combustible"]].forEach(function (p) {
        var l = vStatus[p[0]];
        if (l && l !== "ok") { msgs.push(p[1] + (l === "bad" ? " crítico" : " con atención")); if (RANK[l] > RANK[worst]) worst = l; }
      });
    }
    alerts().forEach(function (a) { msgs.push(a.text.charAt(0).toLowerCase() + a.text.slice(1)); if (RANK[a.level] > RANK[worst]) worst = a.level; });
    sbAlert.classList.toggle("is-off", worst === "ok");
    sbAlert.dataset.state = worst;
    sbAlert.setAttribute("aria-label", worst === "ok" ? "Sin alertas" : "Alerta del vehículo: " + msgs.join(", ") + ". Toca para ver detalles");
  }
  window.addEventListener("radio:vehiclechange", function (e) { vStatus = e.detail && e.detail.status; syncStatusAlert(); });
  if (sbAlert) {
    sbAlert.setAttribute("role", "button"); sbAlert.setAttribute("tabindex", "0");
    activate(sbAlert, function () { if (!sbAlert.classList.contains("is-off") && window.RadioNav) window.RadioNav.show("vehicle"); });
  }

  function render() {
    renderAlerts(); renderDiagram(); renderTrip(); renderMaint(); renderHome(); syncStatusAlert();
    window.dispatchEvent(new CustomEvent("radio:carchange", { detail: get() }));
  }

  /* ---------- Toasts ---------- */
  function toast(o) { if (window.RadioToast) window.RadioToast.show(o); }

  /* ---------- Cambios ---------- */
  var prevOpen = "";
  function checkDoorWarning() {
    var key = openDoors().join(",");
    if (key && key !== prevOpen && speed > 8 && Date.now() - speedSeen < 6000 && cfg("doorWarn", true)) {
      toast({ kind: "bad", title: "Puerta abierta en marcha", text: openDoors().map(function (k) { return DOOR_NAMES[k]; }).join(", "), ms: 7000 });
    }
    prevOpen = key;
  }

  /* Cámara de reversa */
  var openedByRev = false, revTimer = null, revDucked = false;
  function onReverse(on) {
    if (!S) return;
    if (on) {
      clearTimeout(revTimer);
      if (!cfg("autoReverseCam", true)) return;
      var C = window.RadioCamera;
      if (C && !C.isOpen()) { C.open(); openedByRev = true; }
      if (cfg("reverseDuck", true) && !revDucked) { S.duck(true, true); revDucked = true; }
    } else {
      if (revDucked) { S.duck(false, true); revDucked = false; }
      if (openedByRev) {
        var h = Number(cfg("reverseHold", 3)) * 1000;
        clearTimeout(revTimer);
        revTimer = setTimeout(function () {
          if (openedByRev && window.RadioCamera && window.RadioCamera.isOpen()) window.RadioCamera.close();
          openedByRev = false;
        }, h);
      }
    }
  }

  function setDoor(k, v) { if (!(k in doors) || doors[k] === !!v) return; doors[k] = !!v; checkDoorWarning(); render(); }
  function setLight(k, v) {
    if (!(k in lights) || lights[k] === !!v) return;
    lights[k] = !!v;
    if (k === "reverse") onReverse(lights.reverse);
    render();
  }
  function setLocked(v) {
    var was = st.locked; st.locked = !!v; dirty = true; render();
    if (was !== st.locked && window.RadioESP) window.RadioESP.send({ c: "lock", v: st.locked ? 1 : 0 });
  }
  function setTire(k, kpa) { if (k in tires) { tires[k] = kpa == null ? null : Math.max(0, Number(kpa) || 0); render(); } }
  function setOdo(km) { st.odo = Math.max(0, km); dirty = true; render(); }

  function newTrip(silent) {
    if (st.trip.km > 0.05) st.prevTrip = { km: st.trip.km, secs: st.trip.secs, max: st.trip.max };
    st.trip = { km: 0, secs: 0, max: 0 };
    dirty = true;
    if (!silent) toast({ title: "Viaje reiniciado", text: st.prevTrip ? "Anterior: " + nf(dKm(st.prevTrip.km), 1) + " " + unitDist() : "" });
    renderTrip(); renderAlerts();
  }

  /* Velocidad del sistema (GPS o simulación del mapa) */
  var lastPaint = 0;
  window.addEventListener("radio:speed", function (e) {
    var v = e.detail.kmh, t = e.detail.t || Date.now();
    var dt = lastT ? Math.min((t - lastT) / 1000, 5) : 0;
    lastT = t; speed = v; speedSeen = t;
    if (v > 1) {
      var idle = Number(cfg("tripIdle", 120)) * 60000;
      if (idle && st.lastMove && t - st.lastMove > idle && st.trip.km > 0.05) newTrip(true);
      st.lastMove = t;
      var dk = v * dt / 3600;
      st.trip.km += dk; st.trip.secs += dt; if (v > st.trip.max) st.trip.max = v;
      st.odo += dk; dirty = true;
      if (cfg("autoLock", false) && !st.locked && v > 10) { setLocked(true); toast({ title: "Puertas bloqueadas", text: "Se bloquearon al avanzar." }); }
    }
    checkDoorWarning();
    if (t - lastPaint > 1000) { lastPaint = t; renderTrip(); renderMaint(); renderAlerts(); }
  });
  setInterval(function () { renderTrip(); }, 5000);

  /* ---------- Entradas ---------- */
  function activate(n, fn) {
    n.addEventListener("click", fn);
    n.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  }
  root.querySelectorAll("[data-part]").forEach(function (n) {
    activate(n, function () { if (st.demo) setDoor(n.dataset.part, !doors[n.dataset.part]); });
  });
  root.querySelectorAll(".lchip").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!st.demo) return;
      var k = b.dataset.light;
      if (k === "hazard") { setLight("hazard", !lights.hazard); return; }
      if (k === "turnL" && !lights.turnL) setLight("turnR", false);
      if (k === "turnR" && !lights.turnR) setLight("turnL", false);
      setLight(k, !lights[k]);
    });
  });
  root.querySelectorAll(".tire").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!st.demo) return;
      var k = b.dataset.tire, rec = recKpa(), seq = [null, rec * 0.84, rec * 0.66, rec * 1.28], cur = tires[k], i = seq.indexOf(cur);
      setTire(k, seq[(i + 1) % seq.length]);
    });
  });
  el.demo.addEventListener("click", function () { st.demo = !st.demo; dirty = true; render(); });
  el.tReset.addEventListener("click", function () { newTrip(false); });

  el.odoEdit.addEventListener("click", function () {
    el.odoForm.hidden = false; el.odoIn.value = String(Math.round(dKm(st.odo))); el.odoIn.focus(); el.odoIn.select();
  });
  el.odoCancel.addEventListener("click", function () { el.odoForm.hidden = true; });
  el.odoForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = parseInt(String(el.odoIn.value).replace(/[^\d]/g, ""), 10);
    if (!isFinite(v)) { el.odoIn.focus(); return; }
    setOdo(mi() ? v * KM_MI : v);
    el.odoForm.hidden = true;
    toast({ title: "Odómetro actualizado", text: nf(v) + " " + unitDist() });
  });
  el.svc.addEventListener("click", function (e) {
    var b = e.target.closest(".svc__btn");
    if (!b) return;
    var id = b.closest(".svc").dataset.id, before = st.svc[id], name = SERVICES.filter(function (s) { return s.id === id; })[0].name;
    st.svc[id] = st.odo; dirty = true; render();
    toast({ title: "Servicio registrado", text: name, actions: [{ label: "Deshacer", fn: function () { st.svc[id] = before; dirty = true; render(); } }] });
  });

  if (home.btn) home.btn.addEventListener("click", function () { setLocked(!st.locked); });

  window.addEventListener("radio:systemchange", function (e) {
    var ch = (e.detail && e.detail.changed) || [];
    if (ch.some(function (k) { return /^(distance|pressUnit|tirePsi|serviceWarnKm|tripIdle)$/.test(k); })) render();
  });

  /* ---------- API ---------- */
  function get() {
    return {
      locked: st.locked, demo: st.demo, odometer: st.odo, trip: Object.assign({}, st.trip),
      doors: Object.assign({}, doors), lights: Object.assign({}, lights),
      tires: { fl: tireKpa("fl"), fr: tireKpa("fr"), rl: tireKpa("rl"), rr: tireKpa("rr") },
      service: SERVICES.map(function (s) { return { id: s.id, name: s.name, remaining: remaining(s) }; }),
      alerts: alerts()
    };
  }
  window.RadioCar = {
    get: get,
    update: function (p) {
      if (!p) return;
      if (p.doors) Object.keys(p.doors).forEach(function (k) { setDoor(k, p.doors[k]); });
      if (p.lights) Object.keys(p.lights).forEach(function (k) { setLight(k, p.lights[k]); });
      if (p.tires) Object.keys(p.tires).forEach(function (k) { setTire(k, p.tires[k]); });
      if (typeof p.odometer === "number" && isFinite(p.odometer)) setOdo(p.odometer);
      if (typeof p.locked === "boolean") setLocked(p.locked);
    },
    setDemo: function (on) { st.demo = !!on; dirty = true; render(); },
    resetTrip: function () { newTrip(true); },
    setLocked: setLocked
  };

  render();
})();
