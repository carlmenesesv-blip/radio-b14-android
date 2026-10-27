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

  function themeButton(name) { return document.querySelector('[data-theme-set="' + name + '"]'); }
  function autoIsDark() { var h = new Date().getHours(); return h >= 18 || h < 6; }
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
    if (changed.indexOf("themeMode") >= 0) applyTheme();
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
    var blob = new Blob([JSON.stringify({ app: "RADIO B14", version: VERSION, data: out }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "radio-b14-ajustes.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function importData(file, done) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        if (!j || j.app !== "RADIO B14" || !j.data) throw new Error("x");
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
    row(c, "Mantener la pantalla encendida", "Evita que se apague mientras el sistema está abierto", function (id) { return toggle("keepAwake", id); });
    row(c, "Reducir animaciones", "Transiciones más simples", function (id) { return toggle("reduceMotion", id); });
    row(c, "Alto contraste", "Textos y bordes más marcados", function (id) { return toggle("highContrast", id); });
    row(c, "Al encender, abrir", "", function (id) {
      return seg("startView", [["Inicio", "home"], ["Mapa", "map"], ["Música", "media"], ["Radio", "radio"], ["Última", "last"]], id);
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
    group(mount, "Entrada");
    c = card(mount, "");
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
    if (window.AndroidBridge && typeof window.AndroidBridge.sys === "function") {
      group(mount, "Sistema Android");
      c = card(mount, "");
      var homeHint = null, ovHint = null, wrHint = null, ovTgl = null;
      var homeRow = row(c, "Pantalla de inicio", "", function (id) {
        return button("Elegir Radio B14 como inicio", function () { window.RadioAndroid && window.RadioAndroid.open("home"); }, id);
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
        homeHint.textContent = i.home ? "Radio B14 ya es la pantalla de inicio." : "Para que al pulsar Inicio vuelva aquí, elígelo como inicio y marca «Siempre».";
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

    /* ----- Vehículo ----- */
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

    /* ----- Teléfono ----- */
    group(mount, "Teléfono");
    c = card(mount, "");
    row(c, "Nombre Bluetooth del radio", "Se muestra en las instrucciones para vincular el celular", function (id) {
      return textField("btName", "Nombre que ve tu celular", id);
    }).classList.add("set-item--stack");
    row(c, "Recibir del teléfono", "Música y destinos enviados desde tu teléfono", function (id) { return toggle("castOn", id); });
    row(c, "Pedir confirmación", "Pregunta antes de reproducir lo que llegue", function (id) { return toggle("castAsk", id); });
    row(c, "Control remoto", "Permite pausar, cambiar de pista y subir el volumen desde el teléfono", function (id) { return toggle("castRemote", id); });
    var code = h("span", "set-value set-code", "—");
    code.id = "sys-code";
    row(c, "Código de enlace", "", function () { return code; });
    var acts = h("div", "set-actions");
    acts.appendChild(button("Mostrar QR", function () { if (window.RadioMusic) window.RadioMusic.add("phone"); }, "sys-qr"));
    acts.appendChild(button("Nuevo código", function () { if (window.RadioCast) window.RadioCast.newCode(); }, "sys-newcode"));
    c.appendChild(acts);
    row(c, "Servidor de enlace (avanzado)", "Servicio ntfy que lleva los mensajes entre el teléfono y el sistema", function (id) {
      return textField("castServer", "https://ntfy.sh", id);
    }).classList.add("set-item--stack");
    row(c, "Dirección pública de la app (avanzado)", "Donde el teléfono abre esta app. Vacío usa la dirección actual", function (id) {
      return textField("castBase", "https://mi-radio.ejemplo.com/", id);
    }).classList.add("set-item--stack");

    /* ----- Sistema ----- */
    group(mount, "Sistema");
    c = card(mount, "");
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
    c.appendChild(h("p", "set-about", "RADIO B14 · versión " + VERSION));
    c.appendChild(h("p", "set-hint", "Mapas: según el proveedor elegido (datos de OpenStreetMap). Rutas: OSRM. Búsqueda de lugares: Photon. Enlace con el teléfono: servidor propio (server.js) o ntfy."));

    buildJump(mount);
    refreshUI();
  }

  /* Barra fija para saltar entre secciones de Ajustes */
  function buildJump(mount) {
    var view = mount.closest(".view--settings");
    if (!view || view.querySelector(".set-jump")) return;
    var nav = h("nav", "set-jump");
    nav.setAttribute("aria-label", "Ir a una sección de Ajustes");
    var targets = [["Apariencia", null]];
    mount.querySelectorAll(".set-group").forEach(function (g) { targets.push([g.textContent, g]); });
    var chips = targets.map(function (t) {
      var b = h("button", "set-jump__chip", t[0]);
      b.type = "button";
      b.addEventListener("click", function () {
        var smooth = state.reduceMotion || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth";
        if (t[1]) t[1].scrollIntoView({ block: "start", behavior: smooth });
        else view.scrollTo({ top: 0, behavior: smooth });
      });
      nav.appendChild(b);
      return b;
    });
    view.insertBefore(nav, view.firstChild);

    /* Resalta la sección visible */
    function mark() {
      var top = view.getBoundingClientRect().top + nav.offsetHeight + 24, idx = 0;
      targets.forEach(function (t, i) { if (t[1] && t[1].getBoundingClientRect().top <= top) idx = i; });
      chips.forEach(function (c, i) {
        if (i === idx) c.setAttribute("aria-current", "true"); else c.removeAttribute("aria-current");
        if (i === idx && nav.scrollWidth > nav.clientWidth) {
          var l = c.offsetLeft - 16, r = c.offsetLeft + c.offsetWidth + 16;
          if (l < nav.scrollLeft) nav.scrollLeft = l; else if (r > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = r - nav.clientWidth;
        }
      });
    }
    var raf = 0;
    view.addEventListener("scroll", function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; mark(); }); }, { passive: true });
    window.addEventListener("resize", mark);
    mark();
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
