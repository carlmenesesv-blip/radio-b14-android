/* ==========================================================
   SYSTEM — ajustes de todo el sistema
   Pantalla, hora y unidades, sonido, seguridad, navegación,
   teléfono y datos. Dibuja sus propias tarjetas dentro de
   Ajustes (#sys-mount) y expone window.RadioSystem.
   Almacenamiento: "radio-system".
   Se carga antes de statusbar.js / clock.js.
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-system";
  var VERSION = "1.1";
  var root = document.documentElement;

  var DEFAULTS = {
    themeMode: null,            // "light" | "dark" | "auto"
    themeLights: true,          // en Automático: oscuro cuando el auto enciende las luces
    driveMode: true,            // modo conducción: controles grandes y bloqueos al ir en marcha
    driveSpeed: 15,             // km/h a partir de los cuales se activa
    driveBig: true,             // agrandar los controles al conducir
    driveBlockVideo: true,      // bloquear videos y navegación libre al conducir
    exclusiveAudio: true,       // una sola fuente de audio: la nueva pausa a la anterior
    homeLayout: "calma",       // calma | cockpit | widgets
    voiceWake: false,           // «Oye Aura» (solo navegadores con reconocimiento continuo)
    voiceSpeak: true,           // respuestas habladas
    mapEngine: "google",        // google (con clave) | osm
    aiVoice: true,              // usar Gemini cuando hay clave
    voiceCmd: true,             // botón de micrófono y órdenes de voz
    keyHints: true,             // aviso breve de lo que hace cada botón del volante
    homeWx: true, homeCar: true, homeMedia: true, homeApps: true, homeMap: true,   // tarjetas del Inicio
    keepAwake: true,
    reduceMotion: false,
    highContrast: false,
    clock24: true,
    distance: "km",             // "km" | "mi"
    tempUnit: "c",              // "c" | "f"  (clima y temperatura exterior)
    climStart: "last",          // "last" | "auto" | "off"
    climDefault: 22,            // °C al encender en Auto
    climStep: 0.5,              // 0.5 | 1  (°C por toque)
    climDefrost: true,          // al desempañar: A/C, aire exterior y ventilador alto
    rearMin: 10,                // minutos del desempañador trasero (0 = sin límite)
    bootAnim: true,             // animación de inicio
    radioResume: true,          // la radio continúa con la última emisora al encender
    accOff: "screen",           // al apagar el auto (ACC): "screen" = pantalla negra y música en pausa · "none" = no hacer nada
    accDelay: 10,               // segundos de espera antes de apagar la pantalla (0 = al instante)
    keyStep: 5,                 // volumen que suben/bajan el volante y la perilla
    autoBright: false,          // bajar el brillo cuando el auto enciende las luces
    nightBright: 45,            // brillo con las luces encendidas (%)
    oskMode: "auto",             // teclado en pantalla: auto | on | off
    appsFullscreen: true,       // las apps se abren a pantalla completa
    appsNative: true,           // intentar abrir la app instalada antes que la web
    bootMs: 3600,               // duración de la animación (ms)
    bootSound: false,           // sonido al iniciar
    autoReverseCam: true,       // abrir la cámara al meter reversa
    reverseHold: 3,             // segundos que sigue abierta tras salir de reversa
    reverseDuck: true,          // bajar la música en reversa
    autoLock: false,            // bloquear puertas al avanzar
    doorWarn: true,             // avisar de puertas abiertas en marcha
    tirePsi: 32,                // presión recomendada (psi)
    pressUnit: "psi",           // "psi" | "bar"
    tripIdle: 120,              // minutos detenido para empezar un viaje nuevo (0 = manual)
    serviceWarnKm: 500,         // avisar cuando falten estos km para un servicio
    startView: "home",          // "home" | "last" | "map" | "media" | "radio"
    startVolumeOn: false,
    startVolume: 40,
    maxVolume: 100,
    tapSound: false,
    haptics: false,
    duck: true,
    lockMoving: true,
    lockSpeed: 8,
    voice: true,
    mapTheme: "auto",           // "auto" | "light" | "dark"
    mapProvider: "esri",       // "esri" | "osm" | "carto" | "custom"
    tileUrl: "",
    castOn: true,
    castAsk: false,
    castRemote: true,
    btName: "",
    castServer: "https://ntfy.sh",
    castBase: ""
  };

  var state = load();
  if (!state.themeMode) state.themeMode = root.getAttribute("data-theme") === "light" ? "light" : "dark";

  /* ---------- Almacenamiento ---------- */
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    return Object.assign({}, DEFAULTS, s || {});
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- Formatos (hora y unidades) ---------- */
  var KM_PER_MI = 1.609344;
  var fmt = {
    unitSpeed: function () { return state.distance === "mi" ? "mph" : "km/h"; },
    unitDist: function () { return state.distance === "mi" ? "mi" : "km"; },
    unitPress: function () { return state.pressUnit === "bar" ? "bar" : "psi"; },
    /* Presión desde kPa: "32 psi" / "2,20 bar" */
    press: function (kpa) {
      if (state.pressUnit === "bar") return (kpa / 100).toFixed(2).replace(".", ",") + " bar";
      return Math.round(kpa * 0.145038) + " psi";
    },
    /* Distancia larga desde km: "12.345 km" / "7.670 mi" */
    km: function (km, dec) {
      var mi = state.distance === "mi", v = mi ? km / KM_PER_MI : km;
      var f = Math.abs(v).toFixed(dec || 0).split(".");
      f[0] = f[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      return (v < 0 ? "-" : "") + f.join(",") + " " + (mi ? "mi" : "km");
    },
    unitTemp: function () { return state.tempUnit === "f" ? "°F" : "°C"; },
    /* Temperatura desde °C: "22 °C" / "72 °F" */
    temp: function (c) {
      var f = state.tempUnit === "f";
      var v = f ? c * 9 / 5 + 32 : c;
      v = f ? Math.round(v) : Math.round(v * 2) / 2;
      return String(v).replace(".", ",") + " " + (f ? "°F" : "°C");
    },
    speedValue: function (kmh) { return Math.round(state.distance === "mi" ? kmh / KM_PER_MI : kmh); },
    time: function (d) {
      return (d || new Date()).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: !state.clock24 });
    },
    /* Distancia desde metros: "350 m" / "2,4 km" / "0,3 mi" */
    dist: function (m) {
      if (state.distance === "mi") {
        var ft = m * 3.28084;
        if (ft < 500) return Math.max(10, Math.round(ft / 10) * 10) + " ft";
        var mi = m / 1609.344;
        return (mi < 10 ? mi.toFixed(1) : String(Math.round(mi))).replace(".", ",") + " mi";
      }
      if (m < 950) return Math.max(10, Math.round(m / 10) * 10) + " m";
      var km = m / 1000;
      return (km < 10 ? km.toFixed(1) : String(Math.round(km))).replace(".", ",") + " km";
    },
    duration: function (s) {
      var min = Math.max(1, Math.round(s / 60));
      if (min < 60) return min + " min";
      var h = Math.floor(min / 60), r = min % 60;
      return h + " h" + (r ? " " + r + " min" : "");
    }
  };

  /* ---------- Aplicar al documento ---------- */
  function applyFlags() {
    if (state.reduceMotion) root.setAttribute("data-motion", "reduce"); else root.removeAttribute("data-motion");
    if (state.highContrast) root.setAttribute("data-contrast", "high"); else root.removeAttribute("data-contrast");
  }
  applyFlags();

  /* Tarjetas del Inicio: se ocultan las que no se quieran y las columnas se reparten solas */
  function applyHome() {
    var home = document.getElementById("home"); if (!home) return;
    var wx = document.getElementById("wx"), car = document.getElementById("car"), col = home.querySelector(".home__col--r");
    function vis(el, on) { if (el) el.hidden = !on; }
    vis(wx, state.homeWx); vis(car, state.homeCar);
    if (col) {
      vis(document.getElementById("hm"), state.homeMedia); vis(document.getElementById("freq"), state.homeApps); vis(col.querySelector(".home__mini"), state.homeMap);
      col.hidden = !(state.homeMedia || state.homeApps || state.homeMap);
    }
    if (home.getAttribute("data-layout")) { home.style.gridTemplateColumns = ""; return; }
    var w = [], t = [];
    if (state.homeWx) t.push("minmax(0, 4fr)");
    if (state.homeCar) t.push("minmax(0, 3.5fr)");
    if (col && !col.hidden) t.push("minmax(0, 3.5fr)");
    home.style.gridTemplateColumns = t.length ? t.join(" ") : "minmax(0, 1fr)";
  }
  applyHome();

  function themeButton(name) { return document.querySelector('[data-theme-set="' + name + '"]'); }
  var lightsOn = false;
  function autoIsDark() { if (state.themeLights && lightsOn) return true; var h = new Date().getHours(); return h >= 18 || h < 6; }
  window.addEventListener("radio:lights", function (e) { lightsOn = !!(e.detail && e.detail.on); if (state.themeMode === "auto") applyTheme(); });
  function applyTheme() {
    var want = state.themeMode === "auto" ? (autoIsDark() ? "dark" : "light") : state.themeMode;
    if (root.getAttribute("data-theme") !== want) {
      var b = themeButton(want);
      internalThemeClick = true;
      if (b) b.click(); else root.setAttribute("data-theme", want);
      internalThemeClick = false;
    }
  }
  setInterval(function () { if (state.themeMode === "auto") applyTheme(); }, 60000);

  /* El interruptor claro/oscuro de la barra superior pasa a modo manual */
  document.querySelectorAll("[data-theme-set]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.themeSet !== state.themeMode && !internalThemeClick) {
        state.themeMode = b.dataset.themeSet; save(); refreshUI(); emit(["themeMode"]);
      }
    });
  });
  var internalThemeClick = false;

  /* ---------- Eventos ---------- */
  function emit(changed) {
    window.dispatchEvent(new CustomEvent("radio:systemchange", { detail: { state: Object.assign({}, state), changed: changed || [] } }));
  }

  function set(patch) {
    var changed = [];
    Object.keys(patch).forEach(function (k) { if (state[k] !== patch[k]) { state[k] = patch[k]; changed.push(k); } });
    if (!changed.length) return;
    save();
    onChanged(changed);
    refreshUI();
    emit(changed);
  }

  function onChanged(changed) {
    if (changed.indexOf("reduceMotion") >= 0 || changed.indexOf("highContrast") >= 0) applyFlags();
    if (changed.indexOf("themeMode") >= 0 || changed.indexOf("themeLights") >= 0) applyTheme();
    if (changed.some(function (k) { return k.indexOf("home") === 0; })) applyHome();
    if (changed.indexOf("keepAwake") >= 0) wake();
    if (changed.indexOf("maxVolume") >= 0) clampVolume();
    if (changed.indexOf("lockMoving") >= 0 || changed.indexOf("lockSpeed") >= 0) updateLock();
  }

  /* ---------- Pantalla siempre encendida (Wake Lock) ---------- */
  var wakeSentinel = null;
  function wake() {
    if (!state.keepAwake) {
      if (wakeSentinel) { try { wakeSentinel.release(); } catch (e) {} wakeSentinel = null; }
      return;
    }
    if (!navigator.wakeLock || wakeSentinel || document.visibilityState !== "visible") return;
    navigator.wakeLock.request("screen").then(function (s) {
      wakeSentinel = s;
      s.addEventListener("release", function () { wakeSentinel = null; });
    }).catch(function () {});
  }
  document.addEventListener("visibilitychange", wake);
  document.addEventListener("pointerdown", wake, { once: true });

  /* ---------- Volumen: tope y volumen inicial ---------- */
  function clampVolume() {
    var Q = window.RadioQuick;
    if (Q && Q.get().volume > state.maxVolume) Q.set({ volume: state.maxVolume });
  }
  window.addEventListener("radio:quickchange", function (e) {
    if (ducked) return;
    if (e.detail && e.detail.volume > state.maxVolume) clampVolume();
  });

  var ducked = null;
  function duck(on, force) {
    var Q = window.RadioQuick;
    if (!Q || (!state.duck && !force)) return;
    if (on && !ducked) {
      var q = Q.get();
      if (q.mute || q.volume < 8) return;
      ducked = { from: q.volume, to: Math.round(q.volume * 0.35) };
      Q.set({ volume: ducked.to });
    } else if (!on && ducked) {
      var d = ducked; ducked = null;
      if (Q.get().volume === d.to) Q.set({ volume: d.from });
    }
  }

  /* ---------- Sonido y vibración al tocar ---------- */
  var actx = null;
  function beep() {
    if (!state.tapSound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = "sine"; o.frequency.value = 1100;
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, actx.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.05);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.06);
    } catch (e) {}
  }
  function buzz() { if (state.haptics && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} } }
  document.addEventListener("pointerdown", function (e) {
    if (e.target.closest && e.target.closest("button, [role=button], [role=switch], .seg__btn")) { beep(); buzz(); }
  }, true);

  /* ---------- Bloqueo de escritura en marcha ---------- */
  var speedKmh = 0, speedAt = 0, locked = false;
  function movingNow() { return Date.now() - speedAt < 6000 && speedKmh > state.lockSpeed; }
  function updateLock() {
    var now = !!state.lockMoving && movingNow();
    if (now !== locked) {
      locked = now;
      if (locked) root.setAttribute("data-moving", "true"); else root.removeAttribute("data-moving");
      window.dispatchEvent(new CustomEvent("radio:lockchange", { detail: { locked: locked } }));
    }
  }
  setInterval(updateLock, 2000);
  function setSpeed(kmh) {
    speedKmh = Math.max(0, kmh || 0); speedAt = Date.now(); updateLock();
    window.dispatchEvent(new CustomEvent("radio:speed", { detail: { kmh: speedKmh, t: speedAt } }));
  }

  /* ---------- Sección inicial ---------- */
  var LAST_KEY = "radio-lastview";
  function rememberViews() {
    document.querySelectorAll(".dock__btn[data-target]").forEach(function (b) {
      b.addEventListener("click", function () { try { localStorage.setItem(LAST_KEY, b.dataset.target); } catch (e) {} });
    });
  }
  function startUp() {
    var v = state.startView;
    if (v === "last") { try { v = localStorage.getItem(LAST_KEY) || "home"; } catch (e) { v = "home"; } }
    if (v === "climate") v = "home";       // la climatización ahora es una ventana, no una pestaña
    if (v && v !== "home" && window.RadioNav) window.RadioNav.show(v);
    if (state.startVolumeOn && window.RadioQuick) window.RadioQuick.set({ volume: Math.min(state.startVolume, state.maxVolume), mute: false });
    clampVolume();
    applyTheme();
    wake();
  }

  /* ---------- Exportar / importar / borrar ---------- */
  function exportData() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^radio-/.test(k) && k !== "radio-wallpaper" && k !== "radio-music-ytkey") out[k] = localStorage.getItem(k);
      }
    } catch (e) {}
    var blob = new Blob([JSON.stringify({ app: "AURA", version: VERSION, data: out }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nomada-ajustes.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function importData(file, done) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        if (!j || (["RADIO B14", "NÓMADA", "AURA"].indexOf(j.app) < 0) || !j.data) throw new Error("x");
        Object.keys(j.data).forEach(function (k) { if (/^radio-/.test(k) && k !== "radio-wallpaper" && typeof j.data[k] === "string") localStorage.setItem(k, j.data[k]); });
        done(true);
        setTimeout(function () { location.reload(); }, 600);
      } catch (e) { done(false); }
    };
    r.onerror = function () { done(false); };
    r.readAsText(file);
  }
  function wipe() {
    try {
      var drop = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^radio-/.test(k)) drop.push(k); }
      drop.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    location.reload();
  }

  /* ==========================================================
     Interfaz de Ajustes
     ========================================================== */
  var refreshers = [];
  function refreshUI() { refreshers.forEach(function (f) { f(); }); }

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function group(mount, title) { mount.appendChild(h("h3", "set-group", title)); }
  function card(mount, label, wide) {
    var c = h("article", "card set-card" + (wide === false ? "" : " set-card--wide"));
    if (label) c.appendChild(h("div", "card__label", label));
    mount.appendChild(c);
    return c;
  }
  function item(parent, label, hint, control, id) {
    var row = h("div", "set-item");
    var txt = h("div", "set-item__txt");
    var l = h("span", "set-item__label", label);
    if (id) l.id = id;
    txt.appendChild(l);
    if (hint) txt.appendChild(h("span", "set-item__hint", hint));
    row.appendChild(txt);
    if (control) row.appendChild(control);
    parent.appendChild(row);
    return row;
  }
  function toggle(key, labelId) {
    var b = h("button", "tgl");
    b.type = "button";
    b.setAttribute("role", "switch");
    if (labelId) b.setAttribute("aria-labelledby", labelId);
    b.appendChild(h("i"));
    b.addEventListener("click", function () { var p = {}; p[key] = !state[key]; set(p); });
    refreshers.push(function () { b.setAttribute("aria-checked", String(!!state[key])); });
    return b;
  }
  function seg(key, options, labelId, cast) {
    var s = h("div", "seg set-seg");
    s.setAttribute("role", "group");
    if (labelId) s.setAttribute("aria-labelledby", labelId);
    options.forEach(function (o) {
      var b = h("button", "seg__btn", o[0]);
      b.type = "button"; b.dataset.value = String(o[1]);
      b.addEventListener("click", function () { var p = {}; p[key] = cast ? cast(o[1]) : o[1]; set(p); });
      s.appendChild(b);
    });
    refreshers.push(function () {
      s.querySelectorAll(".seg__btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.value === String(state[key]))); });
    });
    return s;
  }
  function range(key, min, max, step, format, labelId) {
    var wrap = h("div", "set-rangebox");
    var val = h("span", "set-value");
    var r = h("input", "set-range");
    r.type = "range"; r.min = min; r.max = max; r.step = step;
    if (labelId) r.setAttribute("aria-labelledby", labelId);
    r.addEventListener("input", function () { var p = {}; p[key] = Number(r.value); set(p); });
    wrap.appendChild(val); wrap.appendChild(r);
    refreshers.push(function () {
      r.value = state[key];
      r.style.setProperty("--val", ((state[key] - min) / (max - min)) * 100 + "%");
      val.textContent = format(state[key]);
    });
    return wrap;
  }
  function textField(key, placeholder, labelId) {
    var i = h("input", "set-input");
    i.type = "text"; i.placeholder = placeholder; i.spellcheck = false; i.autocomplete = "off";
    i.setAttribute("autocapitalize", "off");
    if (labelId) i.setAttribute("aria-labelledby", labelId);
    i.addEventListener("change", function () { var p = {}; p[key] = i.value.trim(); set(p); });
    refreshers.push(function () { if (document.activeElement !== i) i.value = state[key] || ""; });
    return i;
  }
  function button(text, fn, id) {
    var b = h("button", "btn-pill", text);
    b.type = "button";
    if (id) b.id = id;
    b.addEventListener("click", function () { fn(b); });
    return b;
  }

  var uid = 0;
  function lid() { return "sys-l" + (++uid); }
  function row(parent, label, hint, makeControl) {
    var id = lid();
    return item(parent, label, hint, makeControl(id), id);
  }

  function build() {
    var mount = document.getElementById("sys-mount");
    if (!mount) return;

    /* ----- Pantalla ----- */
    group(mount, "Pantalla");
    var c = card(mount, "");
    row(c, "Tema", "Automático: oscuro de 18:00 a 6:00", function (id) {
      return seg("themeMode", [["Claro", "light"], ["Oscuro", "dark"], ["Automático", "auto"]], id);
    });
    row(c, "Oscuro con las luces del auto", "En Automático, el tema pasa a oscuro cuando enciendes las luces (túneles, lluvia)", function (id) { return toggle("themeLights", id); });
    row(c, "Mantener la pantalla encendida", "Evita que se apague mientras el sistema está abierto", function (id) { return toggle("keepAwake", id); });
    row(c, "Reducir animaciones", "Transiciones más simples", function (id) { return toggle("reduceMotion", id); });
    row(c, "Alto contraste", "Textos y bordes más marcados", function (id) { return toggle("highContrast", id); });
    row(c, "Al encender, abrir", "", function (id) {
      return seg("startView", [["Inicio", "home"], ["Mapa", "map"], ["Bluetooth", "media"], ["Radio", "radio"], ["Última", "last"]], id);
    });

    /* ----- Hora y unidades ----- */
    group(mount, "Hora y unidades");
    c = card(mount, "");
    row(c, "Formato de hora", "", function (id) {
      return seg("clock24", [["24 h", "true"], ["12 h", "false"]], id, function (v) { return v === "true"; });
    });
    row(c, "Distancia y velocidad", "Kilómetros o millas", function (id) {
      return seg("distance", [["km", "km"], ["mi", "mi"]], id);
    });
    row(c, "Temperatura", "Climatización y temperatura exterior", function (id) {
      return seg("tempUnit", [["°C", "c"], ["°F", "f"]], id);
    });

    /* ----- Sonido ----- */
    group(mount, "Sonido");
    c = card(mount, "");
    row(c, "Volumen máximo", "Limita hasta dónde puede subir el volumen", function (id) {
      return range("maxVolume", 30, 100, 5, function (v) { return v + "%"; }, id);
    });
    row(c, "Una sola fuente de audio", "Al empezar la radio, el Bluetooth o una app, se pausa lo que sonaba antes", function (id) { return toggle("exclusiveAudio", id); });
    row(c, "Volumen fijo al encender", "Si está apagado, recuerda el último volumen", function (id) { return toggle("startVolumeOn", id); });
    var startRow = row(c, "Volumen al encender", "", function (id) {
      return range("startVolume", 0, 100, 5, function (v) { return v + "%"; }, id);
    });
    refreshers.push(function () { startRow.hidden = !state.startVolumeOn; });
    row(c, "Bajar la música durante las indicaciones", "Baja el volumen mientras habla la guía de ruta", function (id) { return toggle("duck", id); });
    row(c, "Sonido al tocar", "", function (id) { return toggle("tapSound", id); });
    if (navigator.vibrate) row(c, "Vibración al tocar", "", function (id) { return toggle("haptics", id); });

    /* ----- Inicio ----- */
    group(mount, "Inicio del sistema");
    c = card(mount, "");
    row(c, "Animación de inicio", "Se muestra al encender el auto; un toque la omite", function (id) { return toggle("bootAnim", id); });
    var bootDur = row(c, "Duración", "", function (id) {
      return seg("bootMs", [["Corta", 2200], ["Normal", 3600], ["Larga", 5000]], id);
    });
    var bootSnd = row(c, "Sonido al iniciar", "Algunos navegadores lo bloquean hasta que toques la pantalla", function (id) { return toggle("bootSound", id); });
    refreshers.push(function () { bootDur.hidden = !state.bootAnim; bootSnd.hidden = !state.bootAnim; });
    row(c, "Radio al encender", "Continúa con la última emisora al iniciar el sistema", function (id) { return toggle("radioResume", id); });
    c.appendChild(button("Ver animación", function () { var u = new URL(location.href); u.search = "?boot=1"; u.hash = ""; location.href = u.href; }));

    /* ----- Entrada ----- */
    group(mount, "Tarjetas del inicio");
    c = card(mount, "");
    row(c, "Estilo del inicio", "Calma, Cockpit o Widgets. También se cambia con el botón Estilo en Inicio", function (id) { return seg("homeLayout", [["Calma", "calma"], ["Cockpit", "cockpit"], ["Widgets", "widgets"]], id); });
    row(c, "El tiempo", "", function (id) { return toggle("homeWx", id); });
    row(c, "El auto", "", function (id) { return toggle("homeCar", id); });
    row(c, "Música", "", function (id) { return toggle("homeMedia", id); });
    row(c, "Apps más usadas", "", function (id) { return toggle("homeApps", id); });
    row(c, "Mapa y puertas", "", function (id) { return toggle("homeMap", id); });

    group(mount, "Entrada");
    c = card(mount, "");
    row(c, "Órdenes de voz", "Botón de micrófono en la barra y botón «voz» del volante", function (id) { return toggle("voiceCmd", id); });
    row(c, "Decir «Oye Aura»", "Escucha siempre, sin tocar el botón. Con clave de Gemini funciona también en la app de Windows; cada frase que oye se envía a Google para saber si le hablaron", function (id) { return toggle("voiceWake", id); });
    row(c, "Respuestas habladas", "Aura confirma en voz alta lo que hizo", function (id) { return toggle("voiceSpeak", id); });
    row(c, "Avisos de los botones del volante", "Muestra un aviso corto de lo que hizo cada botón", function (id) { return toggle("keyHints", id); });
    row(c, "Teclado en pantalla", "Auto lo muestra en pantallas sin teclado físico; en celulares usa el del teléfono", function (id) {
      return seg("oskMode", [["Auto", "auto"], ["Siempre", "on"], ["Nunca", "off"]], id);
    });

    if (!/Android/i.test(navigator.userAgent || "")) row(c, "Teclado de Windows", "Para escribir dentro de YouTube y otras apps externas, activa «Mostrar el teclado táctil cuando no hay teclado conectado».", function (id) {
      return button("Abrir ajustes de Windows", function () {
        var l = document.createElement("a"); l.href = "ms-settings:typing"; l.style.display = "none"; document.body.appendChild(l); l.click(); l.remove();
      }, id);
    });

    /* ----- Apps ----- */
    group(mount, "Apps");
    c = card(mount, "");
    row(c, "Abrir a pantalla completa", "Las apps ocupan toda la pantalla; «Sistema» o Esc regresan", function (id) { return toggle("appsFullscreen", id); });
    row(c, "Usar la app instalada", "Si Spotify, Waze o Maps están instaladas, se abre esa app; si no, la web", function (id) { return toggle("appsNative", id); });

    /* ----- Sistema Android (solo cuando corre como app/launcher) ----- */
    if (window.AndroidBridge && typeof window.AndroidBridge.sys === "function" && window.AndroidBridge.platform !== "windows") {
      group(mount, "Sistema Android");
      c = card(mount, "");
      var homeHint = null, ovHint = null, wrHint = null, ovTgl = null;
      var homeRow = row(c, "Pantalla de inicio", "", function (id) {
        return button("Elegir AURA como inicio", function () { window.RadioAndroid && window.RadioAndroid.open("home"); }, id);
      });
      homeHint = homeRow.querySelector(".set-item__hint") || (function () { var s = h("span", "set-item__hint", ""); homeRow.querySelector(".set-item__txt").appendChild(s); return s; })();
      var ovRow = row(c, "Botón «Volver al radio»", "", function (id) {
        var b = h("button", "tgl"); b.type = "button"; b.setAttribute("role", "switch"); b.setAttribute("aria-labelledby", id); b.appendChild(h("i"));
        b.addEventListener("click", function () { window.RadioAndroid && window.RadioAndroid.setFloating(b.getAttribute("aria-checked") !== "true"); });
        ovTgl = b; return b;
      });
      ovHint = (function () { var s = h("span", "set-item__hint", ""); ovRow.querySelector(".set-item__txt").appendChild(s); return s; })();
      var wrRow = row(c, "Brillo del sistema", "", function (id) {
        return button("Permitir cambiar el brillo", function () { window.RadioAndroid && window.RadioAndroid.open("write"); }, id);
      });
      wrHint = (function () { var s = h("span", "set-item__hint", ""); wrRow.querySelector(".set-item__txt").appendChild(s); return s; })();
      function paintAndroid(i) {
        i = i || {};
        homeHint.textContent = i.home ? "AURA ya es la pantalla de inicio." : "Para que al pulsar Inicio vuelva aquí, elígelo como inicio y marca «Siempre».";
        ovTgl.setAttribute("aria-checked", String(i.floating !== false && i.overlay !== false));
        ovHint.textContent = i.overlay === false ? "Falta el permiso «Mostrar sobre otras apps». Al activarlo se abre su pantalla." : "Aparece sobre otras apps para volver al radio con un toque.";
        wrRow.hidden = i.writeSettings !== false;
        wrHint.textContent = "Sin este permiso el brillo solo cambia dentro del radio.";
      }
      window.addEventListener("radio:androidsys", function (e) { paintAndroid(e.detail); });
      paintAndroid(window.RadioAndroid ? window.RadioAndroid.info() : {});
      var shortcuts = h("div", "set-item");
      [["Wi‑Fi", "wifi"], ["Bluetooth", "bluetooth"], ["Pantalla", "display"], ["Sonido", "sound"], ["Apps", "apps"], ["Ajustes de Android", "all"]].forEach(function (p) {
        shortcuts.appendChild(button(p[0], function () { window.RadioAndroid && window.RadioAndroid.open(p[1]); }));
      });
      shortcuts.style.flexWrap = "wrap"; shortcuts.style.gap = "0.5rem";
      c.appendChild(shortcuts);
    }

    /* ----- Windows (solo en la app de Windows) ----- */
    if (window.RadioHost && typeof window.RadioHost.getConfig === "function") {
      group(mount, "Windows");
      c = card(mount, "");
      var HC = {}, hostRows = [];
      function hostSet(k, v, after) { var p = {}; p[k] = v; Promise.resolve(window.RadioHost.setConfig(p)).then(function (cfg) { HC = cfg || HC; paintHost(); if (after) after(); }); }
      function hostToggle(key, id) {
        var b = h("button", "tgl"); b.type = "button"; b.setAttribute("role", "switch"); b.setAttribute("aria-labelledby", id); b.appendChild(h("i"));
        b.addEventListener("click", function () { hostSet(key, !HC[key]); });
        hostRows.push(function () { b.setAttribute("aria-checked", String(!!HC[key])); });
        return b;
      }
      function hostSeg(key, options, id) {
        var sg = h("div", "seg set-seg"); sg.setAttribute("role", "group"); sg.setAttribute("aria-labelledby", id);
        options.forEach(function (o) {
          var bt = h("button", "seg__btn", o[0]); bt.type = "button";
          bt.addEventListener("click", function () { hostSet(key, o[1]); });
          hostRows.push(function () { bt.setAttribute("aria-pressed", String(HC[key] === o[1])); });
          sg.appendChild(bt);
        });
        return sg;
      }
      row(c, "Iniciar con Windows", "El radio se abre solo al encender la laptop", function (id) { return hostToggle("openAtLogin", id); });
      row(c, "Al apagar el auto (ACC)", "Después de guardar todo, Windows entra en este modo", function (id) {
        return hostSeg("suspendMode", [["Nada", "none"], ["Suspender", "sleep"], ["Hibernar", "hibernate"]], id);
      });
      row(c, "Abrir el cluster solo", "Usa la segunda pantalla al iniciar o al conectarla", function (id) { return hostToggle("autoCluster", id); });
      row(c, "Mantener la pantalla encendida", "Evita que Windows apague la pantalla", function (id) { return hostToggle("keepAwake", id); });
      var dispRow = row(c, "Pantallas", "", function () { return h("span", "set-item__hint", ""); });
      var dispHint = dispRow.querySelector(".set-item__hint");
      var espRow = row(c, "Puerto del ESP32", "Automático detecta el USB; si falla, escribe el COM en config.json", function () { return h("span", "set-item__hint", ""); });
      var espHint = espRow.querySelector(".set-item__hint");
      var note = h("div", "set-item"); note.appendChild(h("span", "set-item__hint", "Las demás opciones están en %APPDATA%\\AURA\\config.json y se aplican al reiniciar la app."));
      c.appendChild(note);
      function paintHost() {
        hostRows.forEach(function (f) { f(); });
        if (espHint) espHint.textContent = HC.espPort === "auto" ? "Automático" : String(HC.espPort || "");
      }
      Promise.resolve(window.RadioHost.getConfig()).then(function (cfg) { HC = cfg || {}; paintHost(); });
      Promise.resolve(window.RadioHost.displays()).then(function (ds) {
        if (dispHint && ds) dispHint.textContent = ds.map(function (d, i) { return (i + 1) + ": " + d.w + "×" + d.h + (d.touch ? " táctil" : "") + (d.primary ? " principal" : ""); }).join(" · ");
      });
      var sh = h("div", "set-item");
      [["Wi‑Fi", "wifi"], ["Bluetooth", "bluetooth"], ["Sonido", "sound"], ["Pantalla", "display"]].forEach(function (pp) {
        sh.appendChild(button(pp[0] + " de Windows", function () { window.AndroidBridge && window.AndroidBridge.openSettings(pp[1]); }));
      });
      sh.style.flexWrap = "wrap"; sh.style.gap = "0.5rem";
      c.appendChild(sh);
      var qb = h("div", "set-item");
      qb.appendChild(button("Salir de la app", function () { window.RadioHost.quit(); }));
      c.appendChild(qb);
    }

    /* ----- Vehículo ----- */
    group(mount, "Conducción");
    c = card(mount, "");
    row(c, "Modo conducción", "Con el auto en marcha agranda los controles y bloquea lo que distrae", function (id) { return toggle("driveMode", id); });
    var dsRow = row(c, "Activar a partir de", "", function (id) { return range("driveSpeed", 5, 40, 1, function (v) { return v + " km/h"; }, id); });
    var dbRow = row(c, "Controles grandes", "", function (id) { return toggle("driveBig", id); });
    var dvRow = row(c, "Bloquear videos y navegador", "YouTube y direcciones libres se bloquean; música, mapa y llamadas siguen. «Soy pasajero» lo salta", function (id) { return toggle("driveBlockVideo", id); });
    refreshers.push(function () { dsRow.hidden = dbRow.hidden = dvRow.hidden = !state.driveMode; });

    group(mount, "Vehículo");
    c = card(mount, "");
    row(c, "Cámara de reversa automática", "Se abre sola al meter reversa", function (id) { return toggle("autoReverseCam", id); });
    var holdRow = row(c, "Mantener la cámara al salir de reversa", "", function (id) {
      return seg("reverseHold", [["No", 0], ["3 s", 3], ["8 s", 8]], id);
    });
    var duckRow = row(c, "Bajar la música en reversa", "Para oír los sensores y el entorno", function (id) { return toggle("reverseDuck", id); });
    refreshers.push(function () { holdRow.hidden = !state.autoReverseCam; duckRow.hidden = !state.autoReverseCam; });
    row(c, "Bloquear puertas al avanzar", "Se bloquean al pasar de 10 km/h", function (id) { return toggle("autoLock", id); });
    row(c, "Avisar de puerta abierta en marcha", "", function (id) { return toggle("doorWarn", id); });
    row(c, "Unidad de presión", "Llantas", function (id) {
      return seg("pressUnit", [["psi", "psi"], ["bar", "bar"]], id);
    });
    row(c, "Presión recomendada", "Avisa si una llanta se aleja de este valor", function (id) {
      return range("tirePsi", 26, 45, 1, function (v) { return fmt.press(v / 0.145038); }, id);
    });
    row(c, "Viaje nuevo automático", "Empieza uno nuevo tras estar detenido este tiempo", function (id) {
      return seg("tripIdle", [["Manual", 0], ["30 min", 30], ["2 h", 120]], id);
    });
    row(c, "Avisar de servicios", "Aviso cuando falten pocos kilómetros", function (id) {
      return seg("serviceWarnKm", [["300 km", 300], ["500 km", 500], ["1.000 km", 1000]], id);
    });

    /* ----- Climatización ----- */
    group(mount, "Climatización");
    c = card(mount, "");
    row(c, "Al encender el auto", "Último: recuerda lo que dejaste. Auto: arranca en automático con la temperatura de abajo", function (id) {
      return seg("climStart", [["Último", "last"], ["Auto", "auto"], ["Apagado", "off"]], id);
    });
    row(c, "Temperatura en Auto", "Valor con el que arranca el modo Auto", function (id) {
      return range("climDefault", 18, 26, 0.5, function (v) { return fmt.temp(v); }, id);
    });
    row(c, "Paso de temperatura", "Cuánto cambia con cada toque (en °F siempre es 1°)", function (id) {
      return seg("climStep", [["0,5°", 0.5], ["1°", 1]], id);
    });
    row(c, "Desempañar a fondo", "Al activar el parabrisas: A/C, aire exterior y ventilador alto; al terminar, vuelve a como estaba", function (id) { return toggle("climDefrost", id); });
    row(c, "Apagar el desempañador trasero", "Se apaga solo para ahorrar energía", function (id) {
      return seg("rearMin", [["No", 0], ["5 min", 5], ["10 min", 10], ["15 min", 15]], id);
    });

    /* ----- Seguridad ----- */
    group(mount, "Seguridad");
    c = card(mount, "");
    row(c, "Bloquear escritura en marcha", "Con el auto en movimiento no se abre el teclado: usa la voz o el teléfono", function (id) { return toggle("lockMoving", id); });
    var lockRow = row(c, "Bloquear a partir de", "", function (id) {
      return range("lockSpeed", 3, 30, 1, function (v) { return v + " km/h"; }, id);
    });
    refreshers.push(function () { lockRow.hidden = !state.lockMoving; });

    /* ----- Llave y volante ----- */
    group(mount, "Llave y volante");
    c = card(mount, "");
    row(c, "Al apagar el auto", "Lo avisa el ESP32 (señal de accesorio). Con «Apagar pantalla» la música se pausa y el cluster se oscurece", function (id) {
      return seg("accOff", [["Apagar pantalla", "screen"], ["No hacer nada", "none"]], id);
    });
    var delayRow = row(c, "Esperar antes de apagar", "Puedes cancelar tocando el aviso", function (id) {
      return seg("accDelay", [["Al instante", 0], ["5 s", 5], ["15 s", 15], ["30 s", 30]], id, Number);
    });
    refreshers.push(function () { delayRow.hidden = state.accOff !== "screen"; });
    row(c, "Volumen por pulsación", "Botones del volante y perilla", function (id) {
      return seg("keyStep", [["2", 2], ["5", 5], ["10", 10]], id, Number);
    });
    row(c, "Brillo automático con las luces", "Baja el brillo cuando enciendes las luces del auto", function (id) { return toggle("autoBright", id); });
    var nightRow = row(c, "Brillo con luces encendidas", "", function (id) {
      return range("nightBright", 10, 100, 5, function (v) { return v + "%"; }, id);
    });
    refreshers.push(function () { nightRow.hidden = !state.autoBright; });
    var legend = h("div", "set-item set-legend");
    legend.appendChild(h("span", "set-item__hint", "Qué hace cada señal del volante (las envía el ESP32):"));
    [["vol+ / vol−", "Subir o bajar el volumen (la perilla también)"], ["mute", "Silenciar"], ["next / prev", "Siguiente o anterior (emisora o pista)"], ["play", "Pausar o reanudar"],
     ["src", "Cambiar de fuente: Inicio → Radio → Bluetooth"], ["home", "Volver al Inicio"], ["voice", "Abrir las órdenes de voz"], ["answer / hangup", "Abrir Llamadas / volver al Inicio"]].forEach(function (r) {
      var line = h("div", "set-legend__row"); line.appendChild(h("b", "", r[0])); line.appendChild(h("span", "", r[1])); legend.appendChild(line);
    });
    c.appendChild(legend);

    /* ----- Navegación ----- */
    group(mount, "Navegación");
    c = card(mount, "");
    row(c, "Guía por voz", "Anuncia cada giro", function (id) { return toggle("voice", id); });
    row(c, "Estilo del mapa", "Automático sigue el tema del sistema", function (id) {
      return seg("mapTheme", [["Automático", "auto"], ["Claro", "light"], ["Oscuro", "dark"]], id);
    });
    row(c, "Proveedor del mapa", "Si el mapa sale en blanco o pide una clave, prueba otro", function (id) {
      return seg("mapProvider", [["Esri", "esri"], ["OpenStreetMap", "osm"], ["CARTO", "carto"], ["Otro", "custom"]], id);
    });
    var tileRow = row(c, "Plantilla de teselas (Otro)", "Dirección con {z}, {x} y {y}; algunos proveedores piden clave propia", function (id) {
      return textField("tileUrl", "https://…/{z}/{x}/{y}.png", id);
    });
    tileRow.classList.add("set-item--stack");
    refreshers.push(function () { tileRow.hidden = state.mapProvider !== "custom"; });

    /* ----- Bluetooth y ESP32 ----- */
    /* ----- Casa (Home Assistant) ----- */
    group(mount, "Casa (Home Assistant)");
    c = card(mount, "");
    var haUrl = h("input", "set-input"), haTok = h("input", "set-input"), haMsg = null;
    haUrl.type = "text"; haUrl.placeholder = "http://homeassistant.local:8123"; haUrl.setAttribute("aria-label", "Dirección de Home Assistant"); haUrl.autocomplete = "off"; haUrl.spellcheck = false;
    haTok.type = "password"; haTok.placeholder = "Token de acceso de larga duración"; haTok.setAttribute("aria-label", "Token de acceso"); haTok.autocomplete = "off";
    var HAx = window.RadioHA;
    if (HAx) {
      var c0 = HAx.config(); haUrl.value = c0.url || ""; if (c0.hasToken) haTok.placeholder = "•••••••• (guardado; escribe otro para cambiarlo)";
      row(c, "Dirección", "La de tu Home Assistant en la red de la casa o por Nabu Casa / VPN", function () { return haUrl; }).classList.add("set-item--stack");
      row(c, "Token", "En Home Assistant: tu perfil → Seguridad → Tokens de acceso de larga duración", function () { return haTok; }).classList.add("set-item--stack");
      var haRow = row(c, "Conexión", "", function () {
        var w = h("div", "set-item__btns"); w.style.display = "flex"; w.style.gap = "0.5rem"; w.style.flexWrap = "wrap";
        w.appendChild(button("Probar y guardar", function () {
          var u = haUrl.value.trim(), t = haTok.value.trim() || (HAx.config().hasToken ? "__keep__" : "");
          if (!u) { haMsg.textContent = "Escribe la dirección."; return; }
          haMsg.textContent = "Probando…";
          var tk = t === "__keep__" ? null : t;
          if (tk === null) { HAx.setConfig({ url: u }); haMsg.textContent = "Dirección guardada."; return; }
          HAx.test(u, tk).then(function (r) {
            haMsg.textContent = (r.ok ? "✓ " : "✗ ") + r.msg;
            if (r.ok) { HAx.setConfig({ url: u, token: tk }); haTok.value = ""; haTok.placeholder = "•••••••• (guardado)"; if (window.RadioToast) window.RadioToast.show({ title: "Casa conectada", kind: "ok", ms: 2200 }); }
          });
        }));
        w.appendChild(button("Desconectar", function () { HAx.setConfig({ url: "", token: "" }); haUrl.value = ""; haTok.value = ""; haTok.placeholder = "Token de acceso de larga duración"; haMsg.textContent = "Desconectado. Se muestran datos de ejemplo."; }));
        w.appendChild(button("Mostrar todo lo oculto", function () { HAx.clearHidden(); haMsg.textContent = "Se muestran todas las fichas."; }));
        return w;
      });
      haMsg = (function () { var sp = h("span", "set-item__hint", HAx.demo() ? "Sin conectar: se muestran datos de ejemplo." : "Conectado."); haRow.querySelector(".set-item__txt").appendChild(sp); return sp; })();
    }

    /* ----- Asistente (Gemini) y mapas de Google ----- */
    group(mount, "Asistente y mapas de Google");
    c = card(mount, "");
    var AIx = window.RadioAI;
    if (AIx) {
      var gKey = h("input", "set-input"), gModel = h("input", "set-input"), mKey = h("input", "set-input"), aiMsg = null;
      gKey.type = "password"; gKey.autocomplete = "off"; gKey.placeholder = AIx.keys().hasGemini ? "•••••••• (guardada; escribe otra para cambiarla)" : "Clave de la API de Gemini (aistudio.google.com/apikey)"; gKey.setAttribute("aria-label", "Clave de Gemini");
      gModel.type = "text"; gModel.value = AIx.keys().model; gModel.spellcheck = false; gModel.setAttribute("aria-label", "Modelo de Gemini");
      mKey.type = "password"; mKey.autocomplete = "off"; mKey.placeholder = AIx.keys().hasMaps ? "•••••••• (guardada; escribe otra para cambiarla)" : "Clave de Google Maps Platform"; mKey.setAttribute("aria-label", "Clave de Google Maps");
      row(c, "Asistente con Gemini", "Entiende frases libres, controla la casa y responde hablando. Sin clave solo funcionan las órdenes fijas", function (id) { return toggle("aiVoice", id); });
      row(c, "Clave de Gemini", "Gratis en Google AI Studio. Se guarda solo en este equipo", function () { return gKey; }).classList.add("set-item--stack");
      row(c, "Modelo", "Cambia el nombre si Google publica uno más nuevo", function () { return gModel; }).classList.add("set-item--stack");
      var aiRow = row(c, "Probar", "", function () {
        var w = h("div", "set-item__btns"); w.style.display = "flex"; w.style.gap = "0.5rem"; w.style.flexWrap = "wrap";
        w.appendChild(button("Guardar y probar", function () {
          var o = { model: gModel.value.trim() === "gemini-2.5-flash" ? "" : gModel.value.trim() }; if (gKey.value.trim()) o.gemini = gKey.value.trim();
          AIx.setKeys(o); aiMsg.textContent = "Probando…";
          AIx.test().then(function (r) { aiMsg.textContent = r.ok ? "✓ Gemini responde (" + r.model + ")." : "✗ " + (r.error || "No respondió."); if (r.ok) { gKey.value = ""; gKey.placeholder = "•••••••• (guardada)"; } });
        }));
        w.appendChild(button("Probar micrófono", function () {
          aiMsg.textContent = "Habla durante 3 segundos…";
          AIx.diag().then(function (d) {
            if (!d.ok) { aiMsg.textContent = "✗ " + d.error; return; }
            var pct = Math.round(Math.min(1, d.peak / 0.2) * 100);
            aiMsg.textContent = (d.peak > d.thr ? "✓ Te oigo bien" : d.peak > 0.004 ? "⚠ Se oye muy bajo: acércate o sube el micrófono en Windows" : "✗ No llega señal: revisa el micrófono predeterminado de Windows") + " · nivel " + pct + "%" + (d.track ? " · " + d.track : "");
          });
        }));
        w.appendChild(button("Quitar clave", function () { AIx.setKeys({ gemini: "" }); gKey.value = ""; gKey.placeholder = "Clave de la API de Gemini (aistudio.google.com/apikey)"; aiMsg.textContent = "Clave eliminada."; }));
        return w;
      });
      aiMsg = (function () { var sp = h("span", "set-item__hint", AIx.ready() ? "Listo." : "Sin clave: órdenes fijas."); aiRow.querySelector(".set-item__txt").appendChild(sp); return sp; })();
      row(c, "Clave de Google Maps", "Activa el mapa de Google con tráfico y rutas. Debe tener habilitadas Maps JavaScript API, Places API (New) y Routes API", function () { return mKey; }).classList.add("set-item--stack");
      row(c, "", "", function () {
        var w = h("div", "set-item__btns"); w.style.display = "flex"; w.style.gap = "0.5rem";
        w.appendChild(button("Guardar clave de mapas", function () { if (mKey.value.trim()) { AIx.setKeys({ maps: mKey.value.trim() }); mKey.value = ""; mKey.placeholder = "•••••••• (guardada)"; if (window.RadioToast) window.RadioToast.show({ title: "Clave de mapas guardada", text: "Reinicia la pestaña del mapa para usarla", kind: "ok", ms: 2600 }); } }));
        w.appendChild(button("Quitar", function () { AIx.setKeys({ maps: "" }); mKey.value = ""; mKey.placeholder = "Clave de Google Maps Platform"; }));
        return w;
      });
      row(c, "Mapa", "Google necesita clave; Estándar usa OpenStreetMap sin cuenta", function (id) { return seg("mapEngine", [["Estándar", "osm"], ["Google", "google"]], id); });
    }

    group(mount, "Bluetooth y ESP32");
    c = card(mount, "");
    row(c, "Nombre del receptor Bluetooth", "Se muestra en las instrucciones para vincular el celular", function (id) {
      return textField("btName", "Nombre que ve tu celular", id);
    }).classList.add("set-item--stack");
    var espTxt = h("span", "set-value", "—");
    espTxt.id = "sys-esp";
    row(c, "ESP32 del auto", "Datos del auto y órdenes: relés, espejos, luces, volumen por lado", function () { return espTxt; });
    function paintEsp() {
      var E = window.RadioESP;
      if (!E) { espTxt.textContent = "No disponible"; return; }
      espTxt.textContent = E.linked() ? "Conectado" : E.available() ? "Puerto listo · sin datos" : "Sin conexión";
    }
    paintEsp();
    window.addEventListener("radio:esplink", paintEsp);
    var eacts = h("div", "set-actions");
    eacts.appendChild(button("Probar enlace", function () {
      var E = window.RadioESP, ok = E && E.send({ c: "hello" });
      if (window.RadioToast) window.RadioToast.show({ title: ok ? "Mensaje enviado al ESP32" : "Aún no hay un ESP32 conectado", kind: ok ? "ok" : "bad", ms: 2400 });
    }, "sys-esp-test"));
    c.appendChild(eacts);

    /* ----- Sistema ----- */
    group(mount, "Sistema");
    c = card(mount, "");
    var logHint = null, logPre = h("pre", "set-log"); logPre.hidden = true;
    var logRow = row(c, "Registro de errores", "", function () {
      var wrap = h("div", "set-item__btns");
      wrap.style.display = "flex"; wrap.style.gap = "0.5rem"; wrap.style.flexWrap = "wrap";
      wrap.appendChild(button("Ver", function () { logPre.textContent = (window.RadioErr && window.RadioErr.text(20)) || "Sin errores."; logPre.hidden = !logPre.hidden; }));
      wrap.appendChild(button("Copiar", function () {
        var t = (window.RadioErr && window.RadioErr.text(60)) || "";
        try { navigator.clipboard.writeText(t); if (window.RadioToast) window.RadioToast.show({ title: "Registro copiado", kind: "ok", ms: 1500 }); } catch (e) {}
      }));
      wrap.appendChild(button("Borrar", function () { if (window.RadioErr) window.RadioErr.clear(); logPre.textContent = "Sin errores."; paintLog(); }));
      if (window.RadioHost && window.RadioHost.openLogs) wrap.appendChild(button("Abrir carpeta", function () { window.RadioHost.openLogs(); }));
      return wrap;
    });
    logHint = (function () { var sp = h("span", "set-item__hint", ""); logRow.querySelector(".set-item__txt").appendChild(sp); return sp; })();
    function paintLog() { var n = window.RadioErr ? window.RadioErr.list().length : 0; logHint.textContent = n ? n + " error" + (n === 1 ? "" : "es") + " guardados. Ayuda a encontrar fallas." : "Sin errores. Aquí se guardan los fallos de la interfaz."; }
    window.addEventListener("radio:errlog", paintLog); paintLog();
    c.appendChild(logPre);
    var fsRow = row(c, "Pantalla completa", "", function () {
      return button("Activar", function () {
        var d = document;
        if (d.fullscreenElement) d.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen().catch(function () {});
      }, "sys-fs");
    });
    if (!root.requestFullscreen) fsRow.hidden = true;
    document.addEventListener("fullscreenchange", function () {
      var b = document.getElementById("sys-fs");
      if (b) b.textContent = document.fullscreenElement ? "Salir" : "Activar";
    });
    row(c, "Copia de seguridad", "Guarda o restaura tus ajustes, lista de música y lugares (sin claves)", function () {
      var box = h("div", "set-actions");
      var file = h("input"); file.type = "file"; file.accept = "application/json,.json"; file.hidden = true;
      file.addEventListener("change", function () {
        if (!file.files[0]) return;
        sysMsg("Importando…");
        importData(file.files[0], function (ok) { sysMsg(ok ? "Ajustes importados. Reiniciando…" : "Ese archivo no es una copia válida."); });
        file.value = "";
      });
      box.appendChild(button("Exportar", exportData, "sys-export"));
      box.appendChild(button("Importar", function () { file.click(); }, "sys-import"));
      box.appendChild(file);
      return box;
    });
    row(c, "Borrar todos los datos", "Restablece ajustes, música, lugares y códigos", function () {
      var b = button("Borrar", function () {
        if (!b.dataset.armed) {
          b.dataset.armed = "1"; b.setAttribute("data-armed", ""); b.textContent = "Toca otra vez para confirmar";
          setTimeout(function () { delete b.dataset.armed; b.removeAttribute("data-armed"); b.textContent = "Borrar"; }, 4000);
        } else wipe();
      }, "sys-wipe");
      return b;
    });
    var msg = h("p", "set-hint"); msg.id = "sys-msg"; msg.setAttribute("role", "status");
    c.appendChild(msg);
    function sysMsg(t) { msg.textContent = t || ""; }

    c = card(mount, "Acerca de");
    c.appendChild(h("p", "set-about", "AURA · versión " + VERSION));
    c.appendChild(h("p", "set-hint", "Mapas: según el proveedor elegido (datos de OpenStreetMap). Rutas: OSRM. Búsqueda de lugares: Photon. Enlace con el teléfono: servidor propio (server.js) o ntfy."));

    organize(mount);
    refreshUI();
  }

  /* Ajustes ordenados por categorías: lista a la izquierda y, a la derecha, solo lo de la categoría elegida */
  var CATS = [
    ["Apariencia", ["Pantalla"]],
    ["Hora y unidades", ["Hora y unidades"]],
    ["Sonido", ["Sonido"]],
    ["Inicio y entrada", ["Inicio del sistema", "Tarjetas del inicio", "Entrada"]],
    ["Apps", ["Apps", "Sistema Android"]],
    ["Vehículo", ["Conducción", "Vehículo", "Climatización", "Seguridad", "Llave y volante"]],
    ["Navegación", ["Navegación"]],
    ["Conexiones", ["Casa (Home Assistant)", "Asistente y mapas de Google", "Bluetooth y ESP32"]],
    ["Sistema", ["Sistema", "Windows"]]
  ];
  var CAT_KEY = "radio-settings-cat";
  function organize(mount) {
    var view = mount.closest(".view--settings");
    var host = view && view.querySelector(".settings");
    if (!host || host.querySelector(".set-side")) return;
    var panes = {}, order = [];
    function pane(name) {
      if (!panes[name]) {
        var p = h("div", "set-pane"); p.hidden = true; p.dataset.cat = name;
        panes[name] = p; order.push(name);
      }
      return panes[name];
    }
    CATS.forEach(function (c) { pane(c[0]); });
    var catOf = {};
    CATS.forEach(function (c) { c[1].forEach(function (g) { catOf[g] = c[0]; }); });

    // 1) Tarjetas fijas de Apariencia (fondo, texto, acento, restablecer)
    var statics = Array.prototype.filter.call(host.children, function (n) { return n !== mount; });

    // 2) Grupos del sistema, cada uno a su categoría
    var cur = "Sistema", first = {};
    Array.prototype.slice.call(mount.children).forEach(function (n) {
      if (n.classList && n.classList.contains("set-group")) {
        cur = catOf[n.textContent] || n.textContent;
        var p = pane(cur);
        if (!first[cur]) { first[cur] = true; n.hidden = true; }      // el nombre de la categoría ya está en la lista
        p.appendChild(n);
      } else pane(cur).appendChild(n);
    });

    statics.forEach(function (n) { if (n.classList) n.classList.add("set-card--wide"); pane("Apariencia").appendChild(n); });   // después de Pantalla (tema)

    var side = h("nav", "set-side"); side.setAttribute("aria-label", "Categorías de Ajustes");
    var body = h("div", "set-panes");
    var btns = {};
    order.forEach(function (name) {
      var b = h("button", "set-side__btn", name); b.type = "button";
      b.addEventListener("click", function () { select(name); });
      side.appendChild(b); btns[name] = b; body.appendChild(panes[name]);
    });
    function select(name) {
      if (!panes[name]) name = order[0];
      order.forEach(function (k) {
        panes[k].hidden = k !== name;
        if (k === name) btns[k].setAttribute("aria-current", "true"); else btns[k].removeAttribute("aria-current");
      });
      body.scrollTop = 0;
      try { localStorage.setItem(CAT_KEY, name); } catch (e) {}
    }
    host.textContent = "";
    host.appendChild(side); host.appendChild(body);
    host.appendChild(mount);                 // vacío: se conserva por si otro módulo lo busca
    var saved = null; try { saved = localStorage.getItem(CAT_KEY); } catch (e) {}
    select(saved);
  }

  /* ---------- Arranque ---------- */
  function ready() {
    build();
    rememberViews();
    startUp();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else setTimeout(ready, 0);

  window.RadioSystem = {
    get: function (k) { return k ? state[k] : Object.assign({}, state); },
    set: set,
    fmt: fmt,
    setSpeed: setSpeed,
    speed: function () { return Date.now() - speedAt < 6000 ? speedKmh : 0; },
    locked: function () { return locked; },
    duck: duck,
    version: VERSION
  };
})();
