/* ==========================================================
   STATUSBAR — barra de estado y panel de accesos rápidos
   - Tocar o deslizar hacia abajo en la barra abre el panel
   - Cerrar: botón, fondo, asa (deslizar arriba) o tecla Esc
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-quick";
  var DEFAULTS = {
    wifi: true, bluetooth: true, data: true, gps: true,
    mute: false, dnd: false,
    brightness: 100, volume: 60
  };

  var state = load();

  var bar = document.getElementById("statusbar");
  var panel = document.getElementById("qs");
  var dim = document.getElementById("dim");
  var tiles = document.querySelectorAll(".qs__tile");
  var sbTime = document.getElementById("sb-time");
  var qsTime = document.getElementById("qs-time");
  var qsDate = document.getElementById("qs-date");
  var brightness = document.getElementById("qs-brightness");
  var volume = document.getElementById("qs-volume");
  var handle = document.getElementById("qs-handle");

  /* ---------- Estado ---------- */
  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    return Object.assign({}, DEFAULTS, saved || {});
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- Render ---------- */
  function setRange(input, value) {
    input.value = value;
    var min = Number(input.min) || 0;
    var max = Number(input.max) || 100;
    input.style.setProperty("--val", ((value - min) / (max - min)) * 100 + "%");
  }

  function setIcon(id, visible) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle("is-off", !visible);
  }

  function render() {
    tiles.forEach(function (t) {
      t.setAttribute("aria-pressed", String(!!state[t.dataset.key]));
    });

    setIcon("sb-data", state.data);
    setIcon("sb-wifi", state.wifi);
    setIcon("sb-bluetooth", state.bluetooth);
    setIcon("sb-gps", state.gps);
    setIcon("sb-dnd", state.dnd);
    setIcon("sb-volume", !state.mute);
    setIcon("sb-mute", state.mute);

    setRange(brightness, state.brightness);
    setRange(volume, state.volume);

    // 100% = sin atenuar, 10% = muy oscuro
    dim.style.opacity = String(((100 - state.brightness) / 100) * 0.85);

    // Avisa a otros módulos (p. ej. el botón de volumen fijo)
    window.dispatchEvent(new CustomEvent("radio:quickchange", { detail: Object.assign({}, state) }));
  }

  /* ---------- API pública ---------- */
  function set(patch) {
    Object.assign(state, patch);
    save();
    render();
  }

  /* ---------- Abrir / cerrar ---------- */
  function open() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    bar.setAttribute("aria-expanded", "true");
  }
  function close() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    bar.setAttribute("aria-expanded", "false");
  }
  function isOpen() { return panel.classList.contains("is-open"); }

  /* ---------- Fichas ---------- */
  tiles.forEach(function (t) {
    t.addEventListener("click", function () {
      var k = t.dataset.key;
      state[k] = !state[k];
      save();
      render();
    });
  });

  /* ---------- Deslizadores ---------- */
  brightness.addEventListener("input", function () {
    state.brightness = Number(brightness.value);
    save();
    render();
  });
  volume.addEventListener("input", function () {
    state.volume = Number(volume.value);
    save();
    render();
  });

  /* ---------- Gestos en la barra ---------- */
  var startY = null;
  bar.addEventListener("pointerdown", function (e) { startY = e.clientY; });
  bar.addEventListener("pointerup", function (e) {
    if (startY === null) return;
    var dy = e.clientY - startY;
    startY = null;
    // toque corto o deslizar hacia abajo
    if (Math.abs(dy) < 10 || dy > 20) open();
  });
  bar.addEventListener("pointercancel", function () { startY = null; });
  bar.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
  });

  /* ---------- Gestos en el asa (deslizar arriba cierra) ---------- */
  var handleY = null;
  handle.addEventListener("pointerdown", function (e) { handleY = e.clientY; });
  handle.addEventListener("pointerup", function (e) {
    if (handleY === null) return;
    var dy = e.clientY - handleY;
    handleY = null;
    if (Math.abs(dy) < 10 || dy < -20) close();
  });
  handle.addEventListener("pointercancel", function () { handleY = null; });

  /* ---------- Cierres ---------- */
  document.querySelectorAll("[data-qs-close]").forEach(function (el) {
    el.addEventListener("click", close);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) close();
  });

  /* ---------- Reloj ---------- */
  function tick() {
    var now = new Date();
    var time = (window.RadioSystem ? window.RadioSystem.fmt.time(now) : now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }));
    sbTime.textContent = time;
    qsTime.textContent = time;
    qsDate.textContent = now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  }
  tick();
  setInterval(tick, 1000);
  window.addEventListener("radio:systemchange", tick);

  render();

  window.RadioQuick = {
    open: open,
    close: close,
    set: set,
    get: function () { return Object.assign({}, state); }
  };
})();
