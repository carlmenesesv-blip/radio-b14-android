/* ==========================================================
   CASA — vista de la casa inteligente (Home Assistant)
   Resumen (alarma, escenas, lo encendido, puertas), luces y apagadores por habitación, cámaras.
   Abrir una puerta, un portón o desarmar la alarma pide confirmación.
   API: RadioCasa {open(tab), tab(), openCamera(id), run(id)}
   Sección: CASA
   ========================================================== */
(function () {
  "use strict";
  var HA = window.RadioHA, root = document.getElementById("casa");
  if (!HA || !root) return;
  var $ = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  function icon(id) { var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "icon"); var u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#" + id); s.appendChild(u); return s; }
  function toast(o) { return window.RadioToast ? window.RadioToast.show(o) : null; }

  var tab = "resumen", room = "Todas", edit = false, camTimer = null, camImgs = {}, big = null, bigTimer = null, sig = "";
  var DOM_ICON = { light: "i-bulb", switch: "i-plug", fan: "i-fan", input_boolean: "i-plug", cover: "i-garage", lock: "i-lock", camera: "i-cctv", scene: "i-spark", script: "i-spark", alarm_control_panel: "i-shield", climate: "i-climate" };
  var ALARM = { disarmed: "Desarmada", armed_home: "Armada en casa", armed_away: "Armada fuera", armed_night: "Armada de noche", arming: "Armando…", pending: "Pendiente", triggered: "¡Disparada!" };
  var STATE_TXT = { on: "Encendido", off: "Apagado", open: "Abierto", closed: "Cerrado", opening: "Abriendo…", closing: "Cerrando…", locked: "Con llave", unlocked: "Sin llave", unavailable: "No disponible" };
  function stateText(s) { return STATE_TXT[s.state] || s.state; }

  /* ---------- Confirmaciones ---------- */
  function confirm(title, text, fn) {
    toast({ title: title, text: text, kind: "info", ms: 6000, actions: [{ label: "Confirmar", fn: fn }] });
  }
  function act(s) {   // toca una entidad: lo delicado pide confirmación
    var d = s.entity_id.split(".")[0], n = HA.name(s);
    if (d === "lock" && s.state === "locked") return confirm("¿Abrir " + n + "?", "Se quitará la llave.", function () { HA.toggle(s.entity_id); });
    if (d === "cover" && !HA.isOn(s)) return confirm("¿Abrir " + n + "?", "", function () { HA.toggle(s.entity_id); });
    if (d === "scene" || d === "script") { HA.toggle(s.entity_id); toast({ title: n, text: "Escena activada", kind: "ok", ms: 1800 }); return; }
    HA.toggle(s.entity_id);
  }

  /* ---------- Construcción ---------- */
  function build() {
    root.textContent = "";
    var head = $("div", "casa__head");
    var tabs = $("div", "seg casa__tabs"); tabs.setAttribute("role", "tablist");
    [["resumen", "Resumen"], ["luces", "Luces y más"], ["camaras", "Cámaras"]].forEach(function (t) {
      var b = $("button", "seg__btn", t[1]); b.type = "button"; b.dataset.tab = t[0]; b.setAttribute("role", "tab");
      b.addEventListener("click", function () { setTab(t[0]); }); tabs.appendChild(b);
    });
    var st = $("div", "casa__status"); st.id = "casa-status";
    head.appendChild(tabs); head.appendChild(st);
    var body = $("div", "casa__body"); body.id = "casa-body";
    root.appendChild(head); root.appendChild(body);
  }
  function setTab(t) { tab = t; sig = ""; render(); }

  function paintStatus() {
    var el = document.getElementById("casa-status"); if (!el) return;
    var s = HA.status();
    el.textContent = "";
    var dot = $("i", "casa__dot" + (s.ok ? " is-ok" : " is-bad")); el.appendChild(dot);
    el.appendChild($("span", "", HA.demo() ? "Modo demostración" : s.ok ? "Casa conectada" : (s.error || "Sin conexión")));
    if (HA.demo()) {
      var b = $("button", "btn-pill casa__cfg", "Conectar"); b.type = "button";
      b.addEventListener("click", function () { if (window.RadioNav) window.RadioNav.show("settings"); setTimeout(function () { var x = [].slice.call(document.querySelectorAll(".set-side__btn")).filter(function (y) { return /Conexiones/.test(y.textContent); })[0]; if (x) x.click(); }, 250); });
      el.appendChild(b);
    }
  }

  /* ---------- Tarjetas y fichas ---------- */
  function card(title, extra) { var c = $("article", "card casa__card" + (extra ? " " + extra : "")); if (title) c.appendChild($("div", "card__label", title)); return c; }

  function tile(s) {
    var d = s.entity_id.split(".")[0];
    var b = $("button", "casa__tile"); b.type = "button"; b.dataset.id = s.entity_id;
    b.appendChild(icon(DOM_ICON[d] || "i-plug"));
    var t = $("span", "casa__tile-t"); t.appendChild($("b", "", HA.name(s))); t.appendChild($("small", "casa__tile-s", stateText(s))); b.appendChild(t);
    b.setAttribute("aria-pressed", String(HA.isOn(s)));
    b.addEventListener("click", function () { if (edit) { HA.toggleHidden(s.entity_id); return; } act(s); });
    var wrap = $("div", "casa__cell"); wrap.dataset.id = s.entity_id; wrap.appendChild(b);
    if (d === "light" && s.attributes && s.attributes.brightness != null) {
      var r = $("input", "casa__bri"); r.type = "range"; r.min = 5; r.max = 100; r.step = 5; r.value = Math.round((s.attributes.brightness || 255) / 2.55);
      r.setAttribute("aria-label", "Brillo de " + HA.name(s));
      r.addEventListener("change", function () { HA.setBrightness(s.entity_id, +r.value); });
      wrap.appendChild(r);
    }
    if (HA.hidden(s.entity_id)) wrap.classList.add("is-hidden");
    return wrap;
  }
  function patchTiles() {
    root.querySelectorAll(".casa__cell").forEach(function (c) {
      var s = HA.get(c.dataset.id); if (!s) return;
      var b = c.querySelector(".casa__tile"); b.setAttribute("aria-pressed", String(HA.isOn(s)));
      b.querySelector(".casa__tile-s").textContent = stateText(s);
      var r = c.querySelector(".casa__bri");
      if (r && document.activeElement !== r && s.attributes.brightness != null) r.value = Math.round(s.attributes.brightness / 2.55);
      c.classList.toggle("is-off", !HA.isOn(s));
    });
    var al = document.getElementById("casa-alarm"); if (al) paintAlarm(al);
  }

  function paintAlarm(el) {
    var a = HA.domain("alarm_control_panel")[0]; if (!a) return;
    el.dataset.state = a.state;
    el.querySelector(".casa__alarm-s").textContent = ALARM[a.state] || a.state;
  }

  /* ---------- Resumen ---------- */
  function renderResumen(body) {
    var grid = $("div", "casa__grid");
    var left = $("div", "casa__col"), right = $("div", "casa__col");

    var al = HA.domain("alarm_control_panel")[0];
    if (al) {
      var c = card("Alarma"); c.id = "casa-alarm"; c.classList.add("casa__alarm");
      c.appendChild(icon("i-shield")); c.appendChild($("div", "casa__alarm-s", ""));
      var row = $("div", "casa__btns");
      [["home", "En casa"], ["away", "Fuera"], ["disarm", "Desarmar"]].forEach(function (x) {
        var b = $("button", "btn-pill", x[1]); b.type = "button";
        b.addEventListener("click", function () {
          if (x[0] === "disarm") pin(function (code) { HA.alarm(al.entity_id, "disarm", code); });
          else HA.alarm(al.entity_id, x[0]);
        });
        row.appendChild(b);
      });
      c.appendChild(row); left.appendChild(c); paintAlarm(c);
    }
    var sc = HA.scenes();
    if (sc.length) {
      var c2 = card("Escenas"); var g = $("div", "casa__scenes");
      sc.slice(0, 8).forEach(function (s) {
        var b = $("button", "casa__scene"); b.type = "button"; b.appendChild(icon("i-spark")); b.appendChild($("span", "", HA.name(s)));
        b.addEventListener("click", function () { act(s); }); g.appendChild(b);
      });
      c2.appendChild(g); left.appendChild(c2);
    }
    var on = HA.all().filter(function (s) { var d = s.entity_id.split(".")[0]; return (d === "light" || d === "switch" || d === "fan" || d === "input_boolean") && HA.isOn(s); });
    var c3 = card("Encendido ahora");
    if (on.length) { var l = $("div", "casa__tiles"); on.slice(0, 8).forEach(function (s) { l.appendChild(tile(s)); }); c3.appendChild(l); }
    else c3.appendChild($("p", "casa__empty", "Todo apagado."));
    var off = $("button", "btn-pill casa__alloff", "Apagar todas las luces"); off.type = "button"; off.addEventListener("click", function () { HA.allLights(false); });
    if (HA.lightsOn()) c3.appendChild(off);
    right.appendChild(c3);
    var doors = HA.domain("lock").concat(HA.domain("cover"));
    if (doors.length) { var c4 = card("Puertas y portón"); var l2 = $("div", "casa__tiles"); doors.forEach(function (s) { l2.appendChild(tile(s)); }); c4.appendChild(l2); right.appendChild(c4); }
    grid.appendChild(left); grid.appendChild(right); body.appendChild(grid);
  }

  /* ---------- Luces y más ---------- */
  function renderLuces(body) {
    var items = HA.all().filter(function (s) { var d = s.entity_id.split(".")[0]; return d === "light" || d === "switch" || d === "fan" || d === "input_boolean" || d === "climate"; });
    if (edit) items = HA.domain("light", true).concat(HA.domain("switch", true), HA.domain("fan", true), HA.domain("input_boolean", true));
    var rooms = ["Todas"]; items.forEach(function (s) { var a = HA.area(s) || "Sin área"; if (rooms.indexOf(a) < 0) rooms.push(a); });
    if (rooms.indexOf(room) < 0) room = "Todas";
    var bar = $("div", "casa__rooms");
    rooms.forEach(function (r) { var b = $("button", "casa__chip", r); b.type = "button"; b.setAttribute("aria-pressed", String(r === room)); b.addEventListener("click", function () { room = r; sig = ""; render(); }); bar.appendChild(b); });
    var ed = $("button", "btn-pill casa__edit", edit ? "Listo" : "Editar"); ed.type = "button"; ed.addEventListener("click", function () { edit = !edit; sig = ""; render(); });
    bar.appendChild(ed); body.appendChild(bar);
    var g = $("div", "casa__tiles casa__tiles--big");
    items.filter(function (s) { return room === "Todas" || (HA.area(s) || "Sin área") === room; }).forEach(function (s) { g.appendChild(tile(s)); });
    if (!g.children.length) g.appendChild($("p", "casa__empty", "No hay luces ni apagadores aquí."));
    body.appendChild(g);
    if (edit) body.appendChild($("p", "casa__hint", "Toca una ficha para ocultarla o mostrarla."));
  }

  /* ---------- Cámaras ---------- */
  function renderCamaras(body) {
    var cams = HA.domain("camera");
    if (!cams.length) { body.appendChild($("p", "casa__empty", "No hay cámaras en Home Assistant.")); return; }
    var g = $("div", "casa__cams"); camImgs = {};
    cams.forEach(function (s) {
      var b = $("button", "casa__cam"); b.type = "button"; b.dataset.id = s.entity_id; b.setAttribute("aria-label", "Ver " + HA.name(s));
      var im = $("img"); im.alt = ""; im.draggable = false; b.appendChild(im);
      var cap = $("span", "casa__cam-t", HA.name(s)); b.appendChild(cap);
      b.addEventListener("click", function () { openCamera(s.entity_id); });
      camImgs[s.entity_id] = im; g.appendChild(b);
    });
    body.appendChild(g);
    pullCams(); clearInterval(camTimer); camTimer = setInterval(pullCams, 2500);
  }
  function pullCams() {
    if (document.hidden || tab !== "camaras" || document.documentElement.getAttribute("data-view") !== "casa") return;
    Object.keys(camImgs).forEach(function (id) { HA.snapshot(id).then(function (u) { if (u && camImgs[id]) camImgs[id].src = u; }); });
  }
  function openCamera(id) {
    var s = HA.get(id); if (!s) return;
    closeCamera();
    big = $("div", "casa__big"); big.setAttribute("role", "dialog"); big.setAttribute("aria-label", HA.name(s));
    var im = $("img"); im.alt = ""; big.appendChild(im);
    var cap = $("div", "casa__big-t", HA.name(s)); big.appendChild(cap);
    var x = $("button", "btn-round casa__big-x"); x.type = "button"; x.setAttribute("aria-label", "Cerrar"); x.appendChild(icon("i-close")); x.addEventListener("click", closeCamera); big.appendChild(x);
    big.addEventListener("click", function (e) { if (e.target === big) closeCamera(); });
    document.body.appendChild(big);
    function pull() { HA.snapshot(id).then(function (u) { if (u && big) im.src = u; }); }
    pull(); bigTimer = setInterval(pull, 1200);
    document.documentElement.setAttribute("data-casacam", "on");
  }
  function closeCamera() { clearInterval(bigTimer); if (big && big.parentNode) big.parentNode.removeChild(big); big = null; document.documentElement.removeAttribute("data-casacam"); }

  /* ---------- Código de alarma ---------- */
  function pin(cb) {
    var ov = $("div", "casa__pin"); var box = $("div", "casa__pin-box"); var disp = $("div", "casa__pin-d", ""); var code = "";
    box.appendChild($("div", "card__label", "Código de la alarma")); box.appendChild(disp);
    var pad = $("div", "casa__pin-pad");
    function paint() { disp.textContent = code.replace(/./g, "●") || " "; }
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "←", "0", "OK"].forEach(function (k) {
      var b = $("button", "casa__pin-k", k); b.type = "button";
      b.addEventListener("click", function () {
        if (k === "←") code = code.slice(0, -1); else if (k === "OK") { document.body.removeChild(ov); if (code) cb(code); return; } else if (code.length < 8) code += k;
        paint();
      });
      pad.appendChild(b);
    });
    var cancel = $("button", "btn-pill", "Cancelar"); cancel.type = "button"; cancel.addEventListener("click", function () { document.body.removeChild(ov); });
    box.appendChild(pad); box.appendChild(cancel); ov.appendChild(box); document.body.appendChild(ov); paint();
  }

  /* ---------- Render ---------- */
  function render() {
    var body = document.getElementById("casa-body"); if (!body) return;
    root.querySelectorAll(".casa__tabs .seg__btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tab === tab)); b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
    paintStatus();
    var s = [tab, room, edit, HA.all().map(function (x) { return x.entity_id; }).join(","), HA.config().hidden.join(",")].join("|");
    if (s === sig) { patchTiles(); return; }
    sig = s;
    clearInterval(camTimer); camTimer = null;
    body.textContent = "";
    if (tab === "resumen") renderResumen(body); else if (tab === "luces") renderLuces(body); else renderCamaras(body);
    patchTiles();
  }

  window.addEventListener("radio:ha", render);
  new MutationObserver(function () { var on = document.documentElement.getAttribute("data-view") === "casa"; if (on) { sig = ""; render(); } else { clearInterval(camTimer); camTimer = null; closeCamera(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-view"] });

  build(); render();
  window.RadioCasa = {
    open: function (t) { if (t) { tab = t; sig = ""; } if (window.RadioNav) window.RadioNav.show("casa"); render(); },
    tab: function () { return tab; }, openCamera: openCamera, closeCamera: closeCamera,
    run: function (id) { var s = HA.get(id); if (s) act(s); },
    act: act
  };
})();
