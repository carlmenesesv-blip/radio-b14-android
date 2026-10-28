/* ==========================================================
   CLUSTER — muestra el tablero digital (interfaces en /cluster) y sus ajustes
   · Cada interfaz es una página HTML en /cluster que expone window.ClusterAPI.
   · Para añadir otra interfaz: copia su HTML a /cluster y agrégala a INTERFACES.
   · Los datos del ESP32 llegan por la app Android (USB) a window.__b14Line / __b14Status
     y se reenvían a la interfaz abierta.
   Sección: CLUSTER
   ========================================================== */
(function () {
  "use strict";
  var root = document.getElementById("cl");
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "radio-cluster";
  // Lista compartida con la pantalla del cluster (cluster/skins.js); `file` es relativo a /cluster
  var INTERFACES = (window.ClusterSkins || [{ id: "riel", name: "Riel", file: "riel.html", hint: "" }]).map(function (i) {
    return { id: i.id, name: i.name, hint: i.hint || "", file: "cluster/" + i.file };
  });
  var frame = $("cl-frame"), ui = $("cl-ui"), groups = $("cl-groups"), note = $("cl-note");
  var st = load(), api = null, refreshers = [];

  function load() { var d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} return Object.assign({ ui: "riel", follow: true }, d || {}); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function iface() { return INTERFACES.filter(function (i) { return i.id === st.ui; })[0] || INTERFACES[0]; }

  /* ---------- Interfaz abierta ---------- */
  var loaded = false;
  function openUi(force) {
    var i = iface();
    if (!force && frame.dataset.ui === i.id && frame.getAttribute("src")) return;
    loaded = false; api = null;
    frame.dataset.ui = i.id;
    frame.src = i.file;
    paintUiSeg();
  }
  frame.addEventListener("load", function () {
    loaded = true;
    try { api = frame.contentWindow.ClusterAPI || null; } catch (e) { api = null; }
    note.textContent = api ? "" : "No se pudieron leer los ajustes de esta interfaz.";
    followTheme();
    wrapApi();
    buildGroups();
    publishState();
  });

  function paintUiSeg() {
    ui.textContent = "";
    INTERFACES.forEach(function (i) {
      var b = h("button", "seg__btn", i.name); b.type = "button"; b.setAttribute("aria-pressed", String(i.id === st.ui));
      b.addEventListener("click", function () { st.ui = i.id; save(); openUi(true); publishState(); });
      ui.appendChild(b);
    });
    $("cl-ui-hint").textContent = iface().hint + (INTERFACES.length < 2 ? " Es la única interfaz por ahora; las nuevas aparecerán aquí." : "");
  }

  /* ---------- Ajustes (se leen y escriben en la interfaz abierta) ---------- */
  function seg(options, get, set) {
    var s = h("div", "seg cl__seg"); s.setAttribute("role", "group");
    options.forEach(function (o) {
      var b = h("button", "seg__btn", o[0]); b.type = "button"; b.dataset.v = String(o[1]);
      b.addEventListener("click", function () { set(o[1]); paint(); });
      s.appendChild(b);
    });
    refreshers.push(function () { var v = String(get()); s.querySelectorAll(".seg__btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === v)); }); });
    return s;
  }
  function row(parent, label, hint, control) {
    var r = h("div", "cl__row"); var l = h("div", "cl__lbl", label);
    if (hint) l.appendChild(h("small", "", hint));
    r.appendChild(l); if (control) r.appendChild(control); parent.appendChild(r); return r;
  }
  function stepper(f) {   // f = [box, key, label, unit, min, max, step]
    var key = f[1], min = f[4], max = f[5], step = f[6];
    var w = h("div", "cl__stp");
    var dn = h("button"); dn.type = "button"; dn.setAttribute("aria-label", "Bajar"); dn.innerHTML = '<svg class="icon"><use href="#i-minus"/></svg>';
    var up = h("button"); up.type = "button"; up.setAttribute("aria-label", "Subir"); up.innerHTML = '<svg class="icon"><use href="#i-plus"/></svg>';
    var out = h("output"); out.setAttribute("aria-live", "polite");
    function show() { var v = api.CFG[key]; out.textContent = String(step < 1 ? Number(v).toFixed(1).replace(".", ",") : Math.round(v)); var u = h("small", "", f[3]); out.appendChild(u); }
    function go(d) {
      var v = api.CFG[key] + d * step;
      api.CFG[key] = Math.round(Math.max(min, Math.min(max, v)) / step) * step;
      api.apply(); paint();
    }
    // mantener pulsado repite
    [[dn, -1], [up, 1]].forEach(function (p) {
      var t = null, iv = null;
      function stop() { clearTimeout(t); clearInterval(iv); t = iv = null; }
      p[0].addEventListener("pointerdown", function (e) { e.preventDefault(); stop(); go(p[1]); t = setTimeout(function () { iv = setInterval(function () { go(p[1]); }, 90); }, 420); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { p[0].addEventListener(ev, stop); });
      p[0].addEventListener("click", function (e) { if (e.detail === 0) go(p[1]); });
    });
    w.appendChild(dn); w.appendChild(out); w.appendChild(up);
    refreshers.push(show);
    return w;
  }
  function paint() { refreshers.forEach(function (f) { try { f(); } catch (e) {} }); }
  function group(title) { var g = h("div", "cl__grp"); g.appendChild(h("div", "card__label", title)); groups.appendChild(g); return g; }

  function buildGroups() {
    groups.textContent = ""; refreshers = [];
    if (!api) return;
    var g;
    g = group("Pantalla");
    row(g, "Tema", "Radio = igual que el tema del radio", seg([["Radio", "radio"], ["Claro", "light"], ["Oscuro", "dark"]],
      function () { return st.follow ? "radio" : api.getTheme(); },
      function (v) { if (v === "radio") { st.follow = true; save(); followTheme(); } else { st.follow = false; save(); api.setTheme(v); } }));
    row(g, "Paisaje", "", seg(api.PAISAJES.map(function (p) { return [p[1], p[0]]; }), function () { return api.CFG.paisaje; }, function (v) { api.CFG.paisaje = v; api.apply(); }));
    row(g, "Animación de inicio", "", seg([["Mostrar", "true"], ["Saltar", "false"]], function () { return !!api.CFG.intro; }, function (v) { api.CFG.intro = v === "true"; api.apply(); }));
    row(g, "Límite de velocidad", "Manual o según el mapa (GPS)", seg([["Manual", "manual"], ["GPS", "gps"]], function () { return api.getLimitMode(); }, function (v) { api.setLimitMode(v); }));
    row(g, "Aviso al pasar el límite", "", stepper(api.FIELDS.filter(function (f) { return f[1] === "margen"; })[0]));

    g = group("Datos");
    row(g, "Fuente", "Demo simula un recorrido; ESP32 lee el auto por USB", seg([["Demo", "sim"], ["ESP32 por USB", "usb"]], function () { return api.getMode(); }, function (v) { api.setMode(v); }));
    var perf = row(g, "Demo: tipo de recorrido", "", seg([["Ciudad", "ciudad"], ["Carretera", "carretera"], ["A fondo", "pista"]], function () { return api.getPerfil(); }, function (v) { api.perfil(v); }));
    refreshers.push(function () { perf.classList.toggle("cl__off", api.getMode() !== "sim"); });
    var bt = h("div", "cl__btns");
    [["Direccional izq.", "bIzq"], ["Direccional der.", "bDer"], ["Emergencia", "bEmerg"], ["Luces altas", "bAltas"], ["Puerta", "bPuerta"], ["Reversa", "bRev"]].forEach(function (p) {
      var b = h("button", "btn-pill", p[0]); b.type = "button"; b.addEventListener("click", function () { api.click(p[1]); }); bt.appendChild(b);
    });
    var demoBtns = h("div", "cl__grp"); demoBtns.appendChild(h("div", "cl__lbl", "Probar avisos (solo Demo)")); demoBtns.appendChild(bt); g.appendChild(demoBtns);
    refreshers.push(function () { demoBtns.classList.toggle("cl__off", api.getMode() !== "sim"); });

    [["Calibración", ["kSpeed", "kRpm"], "Si el cluster marca 100 y el GPS 96, pon la velocidad en 96 %."],
     ["Motor", ["redline", "shift", "maxrpm"]],
     ["Temperatura", ["tempAlta", "tempFrio"]],
     ["Combustible", ["tank", "kmL", "reserva"]],
     ["Batería", ["vBaja"]],
     ["Servicio", ["servKm"]]].forEach(function (grp) {
      g = group(grp[0]);
      grp[1].forEach(function (k) { var f = api.FIELDS.filter(function (x) { return x[1] === k; })[0]; if (f) row(g, f[2], "", stepper(f)); });
      if (grp[2]) g.appendChild(h("p", "cv__note", grp[2]));
    });
    g = group("Mantenimiento");
    var odo = h("input", "cl__odo"); odo.type = "text"; odo.inputMode = "decimal"; odo.setAttribute("aria-label", "Kilometraje total");
    odo.value = String(Math.round(api.getOdo()));
    odo.addEventListener("change", function () { var v = parseFloat(String(odo.value).replace(",", ".")); if (isFinite(v) && v >= 0) api.setOdo(v); });
    row(g, "Kilometraje total", "", odo);
    var mb = h("div", "cl__btns");
    [["Aceite hecho", "bServ"], ["Trip a 0", "bTrip"]].forEach(function (p) { var b = h("button", "btn-pill", p[0]); b.type = "button"; b.addEventListener("click", function () { api.click(p[1]); }); mb.appendChild(b); });
    g.appendChild(mb);
    var rs = h("button", "btn-pill", "Volver a valores de fábrica"); rs.type = "button";
    rs.addEventListener("click", function () { api.click("cfgReset"); setTimeout(paint, 50); });
    g.appendChild(rs);
    paint();
  }

  /* ---------- Tema: por defecto sigue al del radio ---------- */
  function followTheme() {
    if (!api || !st.follow) return;
    var t = document.documentElement.getAttribute("data-theme");
    if (t === "light" || t === "dark") { try { api.setTheme(t); } catch (e) {} }
  }
  new MutationObserver(function () { followTheme(); paint(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- Pantalla completa ---------- */
  function full(on) {
    root.classList.toggle("is-full", on);
    $("cl-close").hidden = !on;
    document.documentElement.classList.toggle("cl-full", on);
    if (typeof sync === "function") sync();
  }
  $("cl-full").addEventListener("click", function () { full(true); });
  $("cl-close").addEventListener("click", function () { full(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && root.classList.contains("is-full")) { e.stopImmediatePropagation(); full(false); } }, true);
  $("cl-reload").addEventListener("click", function () { openUi(true); });

  /* ---------- Datos del ESP32 → interfaz abierta en el radio ----------
     La entrada del ESP32 la maneja esp.js; aquí solo se reenvía a la vista previa. */
  if (window.RadioESP) {
    RadioESP.onLine(function (t) { try { frame.contentWindow.__b14Line(t); } catch (e) {} });
    RadioESP.onStatus(function (t, ok) { try { frame.contentWindow.__b14Status(t, ok); } catch (e) {} });
  }

  /* ---------- Segunda pantalla (el cluster real) ----------
     La pantalla del cluster es una página aparte (cluster/display.html) en otra pantalla de la
     misma computadora. Recibe por RadioLink: la interfaz elegida, todos los ajustes y los datos
     del ESP32. No es táctil: todo se configura desde aquí. */
  var L = window.RadioLink, lastAlive = 0, dispEl = $("cl-display"), dispUpd = null;
  function pub(m) { if (L) L.send(m); }
  var pubT = null;
  function publishState() {
    clearTimeout(pubT);
    pubT = setTimeout(function () {
      pub({ k: "cluster", ui: st.ui, theme: st.follow ? (document.documentElement.getAttribute("data-theme") || "dark") : null, snap: api && api.snapshot ? api.snapshot() : null });
    }, 60);
  }
  // Toda acción hecha en los ajustes del radio también se aplica en la pantalla del cluster
  function wrapApi() {
    if (!api || api.__wrapped) return;
    api.__wrapped = true;
    ["apply", "setTheme", "setMode", "setLimitMode"].forEach(function (k) {
      var f = api[k]; if (typeof f !== "function") return;
      api[k] = function () { var r = f.apply(api, arguments); publishState(); return r; };
    });
    var pf = api.perfil;
    api.perfil = function (p) { var r = pf.call(api, p); publishState(); return r; };
    var cf = api.click;
    api.click = function (id) { var r = cf.call(api, id); pub({ k: "click", id: id }); setTimeout(publishState, 120); return r; };
    var of = api.setOdo;
    api.setOdo = function (v) { var r = of.call(api, v); pub({ k: "odo", v: v }); return r; };
  }
  if (L) L.on(function (m) {
    if (!m) return;
    if (m.k === "mediactl" && window.RadioMedia) { RadioMedia.ctl(m.c); return; }
    if (m.k === "hello" || m.k === "alive") {
      var was = lastAlive > Date.now() - 6000; lastAlive = Date.now();
      if (m.k === "hello" || !was) { publishState(); if (window.RadioMedia) { var g = RadioMedia.get(); pub({ k: "media", title: g.source === "none" ? "" : g.title, artist: g.sub, playing: g.state === "playing" }); }
      if (window.RadioESP) pub({ k: "status", t: RadioESP.status(), ok: RadioESP.linked() }); }
      if (dispUpd) dispUpd();
    }
  });

  function buildDisplay() {
    if (!dispEl) return;
    dispEl.textContent = "";
    dispEl.appendChild(h("div", "card__label", "Pantalla del cluster"));
    var status = h("p", "cl__dstat", ""); status.setAttribute("role", "status");
    var acts = h("div", "cl__btns");
    var AB = window.AndroidBridge;
    var open = h("button", "btn-pill", "Abrir en la otra pantalla"); open.type = "button";
    open.addEventListener("click", function () {
      if (AB && typeof AB.openCluster !== "undefined") { try { AB.openCluster(); } catch (e) {} }
      else { window.open("cluster/display.html", "b14-cluster-display", "popup,width=1280,height=480"); }
      setTimeout(publishState, 900);
    });
    var send = h("button", "btn-pill", "Reenviar ajustes"); send.type = "button";
    send.addEventListener("click", function () { publishState(); if (window.RadioToast) RadioToast.show({ title: "Ajustes enviados a la pantalla del cluster", kind: "ok", ms: 1800 }); });
    acts.appendChild(open); acts.appendChild(send);
    dispEl.appendChild(status); dispEl.appendChild(acts);
    dispEl.appendChild(h("p", "cv__note", "La pantalla del cluster no es táctil: aquí eliges su interfaz y cambias todos sus ajustes. Los datos del ESP32 llegan a las dos pantallas."));
    dispUpd = function () {
      var ok = lastAlive > Date.now() - 6000;
      status.dataset.on = ok ? "1" : "0";
      status.textContent = ok ? "Pantalla del cluster conectada" : "Pantalla del cluster sin conexión (ábrela con el botón)";
    };
    dispUpd(); setInterval(dispUpd, 2000);
  }
  buildDisplay();

  // La interfaz se carga al entrar en la sección (no gasta recursos mientras no se usa)
  var view = root.closest(".view");
  function sync() {
    var on = view && view.classList.contains("is-active");
    // Oculto y sin pantalla completa: se detiene el dibujado para no gastar CPU
    frame.style.display = (on || root.classList.contains("is-full")) ? "" : "none";
    if (on) { openUi(false); if (api) paint(); }
  }
  if (view) new MutationObserver(sync).observe(view, { attributes: true, attributeFilter: ["class"] });
  paintUiSeg(); sync();

  window.RadioCluster = { open: function () { window.RadioNav && window.RadioNav.show("cluster"); }, fullscreen: full, interfaces: INTERFACES };
})();
