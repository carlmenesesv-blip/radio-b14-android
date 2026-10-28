/* ==========================================================
   CAMERA — cámara de reversa (acceso manual desde Home)
   Fuentes:
   - Cámara del equipo (getUserMedia): USB/UVC, entrada de video del
     sistema o cámara del dispositivo. Requiere https o localhost.
   - Flujo de red: URL MJPEG / imagen en vivo (<img>) o video
     (.mp4/.webm/.m3u8 según soporte del navegador).
   API: RadioCamera.open() / close() / isOpen() / get() / set(patch)
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-camera";
  var DEFAULTS = { source: "device", deviceId: "", url: "", mirror: false, guides: true };
  var state = load();

  var $ = function (id) { return document.getElementById(id); };
  var root = $("cam");
  if (!root) return;
  var el = {
    open: $("cam-open"), close: $("cam-close"), video: $("cam-video"), img: $("cam-img"),
    chip: $("cam-chip"), title: $("cam-empty-title"), msg: $("cam-empty-msg"),
    src: $("cam-source"), device: $("cam-device"), url: $("cam-url"), go: $("cam-go"),
    guides: $("cam-guides-btn"), mirror: $("cam-mirror"), retry: $("cam-retry")
  };

  var stream = null, timer = null, token = 0, lastFocus = null;

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    s = Object.assign({}, DEFAULTS, s || {});
    if (s.source !== "url") s.source = "device";
    s.mirror = s.mirror === true; s.guides = s.guides !== false;
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- Estado visual ---------- */
  var CHIP = { connecting: "Conectando", live: "En vivo", nosignal: "Sin señal" };
  function setState(st, title, msg) {
    root.dataset.state = st;
    el.chip.querySelector("span").textContent = CHIP[st] || "";
    if (title) el.title.textContent = title;
    if (msg !== undefined) el.msg.textContent = msg;
    window.dispatchEvent(new CustomEvent("radio:camerachange", { detail: { open: isOpen(), state: st } }));
  }

  function renderControls() {
    var isDev = state.source === "device";
    el.src.querySelectorAll(".seg__btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.value === state.source)); });
    el.device.hidden = !isDev;
    el.url.hidden = isDev;
    el.go.hidden = isDev;
    el.guides.setAttribute("aria-pressed", String(state.guides));
    el.mirror.setAttribute("aria-pressed", String(state.mirror));
    root.dataset.guides = state.guides ? "on" : "off";
    root.dataset.mirror = state.mirror ? "on" : "off";
    el.url.value = state.url;
  }

  /* ---------- Fuentes ---------- */
  function stop() {
    token++;
    clearTimeout(timer);
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    el.video.pause && el.video.pause();
    el.video.removeAttribute("src"); el.video.srcObject = null; el.video.hidden = true;
    el.img.removeAttribute("src"); el.img.hidden = true;
  }

  function listDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function (list) {
      var cams = list.filter(function (d) { return d.kind === "videoinput"; });
      el.device.innerHTML = "";
      if (!cams.length) {
        var o = document.createElement("option"); o.value = ""; o.textContent = "Sin cámaras detectadas"; el.device.appendChild(o);
        return;
      }
      cams.forEach(function (d, i) {
        var o = document.createElement("option");
        o.value = d.deviceId; o.textContent = d.label || "Cámara " + (i + 1);
        el.device.appendChild(o);
      });
      var has = cams.some(function (d) { return d.deviceId === state.deviceId; });
      el.device.value = has ? state.deviceId : cams[0].deviceId;
    }).catch(function () {});
  }

  function startDevice() {
    var my = token;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState("nosignal", "Cámara no disponible", "El navegador no permite usar la cámara en esta dirección. Abre la app con https:// o desde localhost.");
      return;
    }
    var video = state.deviceId ? { deviceId: { exact: state.deviceId } } : { facingMode: "environment" };
    navigator.mediaDevices.getUserMedia({ video: video, audio: false }).then(function (s) {
      if (my !== token) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s;
      el.video.srcObject = s; el.video.hidden = false;
      s.getVideoTracks()[0].addEventListener("ended", function () {
        if (my === token) setState("nosignal", "Se perdió la señal", "La cámara se desconectó. Revisa el cable y pulsa Reintentar.");
      });
      var p = el.video.play(); if (p && p.catch) p.catch(function () {});
      listDevices();
    }).catch(function (err) {
      if (my !== token) return;
      var denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      var none = err && (err.name === "NotFoundError" || err.name === "OverconstrainedError");
      setState("nosignal",
        denied ? "Permiso denegado" : "Sin señal",
        denied ? "Permite el acceso a la cámara en el navegador y pulsa Reintentar."
        : none ? "No se encontró la cámara seleccionada. Elige otra o revisa la conexión."
        : "No se pudo abrir la cámara. Pulsa Reintentar.");
    });
  }

  function validUrl(u) {
    try { var x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; }
  }

  function startUrl() {
    var my = token;
    var href = validUrl(state.url);
    if (!href) { setState("nosignal", "Falta la dirección", "Escribe la URL del flujo (por ejemplo http://192.168.1.50/video.mjpg) y pulsa Conectar."); return; }
    var asVideo = /\.(mp4|webm|ogv|m3u8)(\?|#|$)/i.test(href);
    var node = asVideo ? el.video : el.img;
    function fail() {
      if (my !== token) return;
      el.img.hidden = true; el.video.hidden = true;
      setState("nosignal", "Sin señal", "No se pudo abrir el flujo. Verifica la dirección y que la red esté disponible. Si esta app usa https, el flujo también debe ser https.");
    }
    if (asVideo) {
      el.video.hidden = false;
      el.video.onerror = fail;
      el.video.src = href;
      var p = el.video.play(); if (p && p.catch) p.catch(function () {});
    } else {
      el.img.hidden = false;
      el.img.onload = function () { if (my === token) { clearTimeout(timer); setState("live"); } };
      el.img.onerror = fail;
      el.img.src = href;
    }
    timer = setTimeout(function () { if (my === token && root.dataset.state === "connecting") fail(); }, 10000);
  }

  function start() {
    stop();
    setState("connecting", "Conectando…", "Buscando la señal de la cámara.");
    if (state.source === "url") startUrl(); else startDevice();
  }

  el.video.addEventListener("playing", function () { setState("live"); });

  /* ---------- Abrir / cerrar ---------- */
  function isOpen() { return root.classList.contains("is-open"); }
  function open() {
    if (isOpen()) return;
    lastFocus = document.activeElement;
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    renderControls();
    el.close.focus({ preventScroll: true });
    start();
    window.dispatchEvent(new CustomEvent("radio:camerachange", { detail: { open: true, state: root.dataset.state } }));
  }
  function close() {
    if (!isOpen()) return;
    stop();
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    window.dispatchEvent(new CustomEvent("radio:camerachange", { detail: { open: false, state: root.dataset.state } }));
  }

  /* ---------- Eventos ---------- */
  if (el.open) el.open.addEventListener("click", open);
  el.close.addEventListener("click", close);
  el.retry.addEventListener("click", start);

  el.src.addEventListener("click", function (e) {
    var b = e.target.closest(".seg__btn"); if (!b) return;
    state.source = b.dataset.value; save(); renderControls(); start();
  });
  el.device.addEventListener("change", function () { state.deviceId = el.device.value; save(); start(); });
  function connect() { state.url = el.url.value.trim(); save(); start(); }
  el.go.addEventListener("click", connect);
  el.url.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); connect(); } });
  el.guides.addEventListener("click", function () { state.guides = !state.guides; save(); renderControls(); });
  el.mirror.addEventListener("click", function () { state.mirror = !state.mirror; save(); renderControls(); });

  document.addEventListener("keydown", function (e) {
    if (!isOpen()) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "Tab") {
      var f = Array.prototype.filter.call(root.querySelectorAll("button, input, select"), function (n) { return !n.hidden && !n.disabled && n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", function () { if (isOpen()) listDevices(); });
  }

  renderControls();

  window.RadioCamera = {
    open: open, close: close, isOpen: isOpen,
    get: function () { return Object.assign({}, state, { open: isOpen(), state: root.dataset.state }); },
    set: function (patch) { Object.assign(state, patch); save(); renderControls(); if (isOpen()) start(); }
  };
})();
