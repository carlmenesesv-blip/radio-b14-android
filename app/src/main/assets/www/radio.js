/* ==========================================================
   RADIO — lógica del sintonizador FM / AM
   Las estaciones son de DEMOSTRACIÓN. Para conectar un sintonizador
   real, reemplaza STATIONS / strength() y los métodos de window.RadioTuner.

   Unidades internas ("pasos"):
     FM: 1 paso = 0,1 MHz  → 955 = 95,5 MHz   (87,5 – 108,0)
     AM: 1 paso = 10 kHz   → 98  = 980 kHz    (530 – 1710)
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-tuner";
  var view = document.querySelector('[data-view="radio"]');
  if (!view) return;

  function $(id) { return document.getElementById(id); }
  var el = {
    radio: view.querySelector(".radio"),
    band: $("radio-band"), freq: $("radio-freq"), unit: $("radio-unit"),
    name: $("radio-name"), rds: $("radio-rds"),
    stereo: $("radio-stereo"), signal: $("radio-signal"),
    dial: $("radio-dial"), canvas: $("radio-canvas"),
    prev: $("radio-seek-prev"), next: $("radio-seek-next"),
    down: $("radio-step-down"), up: $("radio-step-up"),
    power: $("radio-power"), save: $("radio-save"), scan: $("radio-scan"),
    presets: $("radio-presets"), presetsLabel: $("radio-presets-label"), hint: $("radio-hint"),
    list: $("radio-stations"), note: $("radio-list-note")
  };

  var BANDS = {
    fm: { min: 875, max: 1080, unit: "MHz", label: "FM", fmt: function (f) { return (f / 10).toFixed(1); }, tick: function (f) { return String(f / 10); } },
    am: { min: 53, max: 171, unit: "kHz", label: "AM", fmt: function (f) { return String(f * 10); }, tick: function (f) { return String(f * 10); } }
  };

  var STATIONS = {
    fm: [
      { f: 881, name: "Pop FM", genre: "Éxitos actuales" },
      { f: 895, name: "Clásica", genre: "Música de concierto" },
      { f: 913, name: "Noticias 24", genre: "Noticias y análisis" },
      { f: 927, name: "Rock Nacional", genre: "Rock en español" },
      { f: 941, name: "Tropical", genre: "Salsa y merengue" },
      { f: 955, name: "Jazz Nocturno", genre: "Jazz y blues" },
      { f: 967, name: "Deportes", genre: "Deportes en vivo" },
      { f: 983, name: "Cultura", genre: "Cultura y debate" },
      { f: 995, name: "Éxitos 90s", genre: "Hits de los 90" },
      { f: 1011, name: "Latina", genre: "Música latina" },
      { f: 1029, name: "Chill", genre: "Relax y lounge" },
      { f: 1043, name: "Voces", genre: "Variedad y entrevistas" },
      { f: 1057, name: "Retro", genre: "Clásicos de oro" },
      { f: 1071, name: "Alternativa", genre: "Indie y alternativo" }
    ],
    am: [
      { f: 54, name: "Noticias AM", genre: "Noticias" },
      { f: 62, name: "Deportes AM", genre: "Deportes" },
      { f: 73, name: "Comunidad", genre: "Información local" },
      { f: 85, name: "Debate", genre: "Opinión y tertulia" },
      { f: 98, name: "Música Popular", genre: "Música popular" },
      { f: 109, name: "Cultura AM", genre: "Cultura y educación" },
      { f: 123, name: "Tertulia", genre: "Conversación" },
      { f: 138, name: "Campo", genre: "Agro y campo" },
      { f: 152, name: "Clásicos", genre: "Música de siempre" },
      { f: 164, name: "Opinión", genre: "Análisis" }
    ]
  };

  var NOTE_DEFAULT = "Estaciones de demostración";
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Estado ---------- */
  function clampF(band, f) { var b = BANDS[band]; return Math.max(b.min, Math.min(b.max, Math.round(f))); }

  function defaults() {
    return {
      band: "fm",
      freq: { fm: 955, am: 98 },
      power: true,
      presets: { fm: [881, 927, 955, 983, null, null], am: [54, 85, null, null, null, null] }
    };
  }
  function load() {
    var d = defaults(), s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!s) return d;
    if (s.band === "fm" || s.band === "am") d.band = s.band;
    d.power = s.power !== false;
    ["fm", "am"].forEach(function (b) {
      if (s.freq && isFinite(s.freq[b])) d.freq[b] = clampF(b, s.freq[b]);
      if (s.presets && Array.isArray(s.presets[b])) {
        d.presets[b] = s.presets[b].slice(0, 6).map(function (v) { return v !== null && isFinite(v) ? clampF(b, v) : null; });
        while (d.presets[b].length < 6) d.presets[b].push(null);
      }
    });
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  var state = load();
  var found = { fm: STATIONS.fm.map(function (s) { return s.f; }), am: STATIONS.am.map(function (s) { return s.f; }) };
  var cur = state.freq[state.band];       // posición del dial (puede tener decimales mientras se arrastra)
  var scanning = false, sweeping = false;
  var saving = false, savingTimer = null, hintTimer = null;

  /* ---------- Recepción simulada ---------- */
  function stationAt(band, f) {
    var list = STATIONS[band];
    for (var i = 0; i < list.length; i++) if (list[i].f === f) return list[i];
    return null;
  }
  function strength(band, f) {
    var list = STATIONS[band], best = 0;
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(list[i].f - f);
      var s = d === 0 ? 1 : d === 1 ? 0.55 : d === 2 ? 0.2 : 0;
      if (s > best) best = s;
    }
    return best;
  }

  /* ---------- Utilidades ---------- */
  function easeOut(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function linear(t) { return t; }
  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function say(text, ms) {
    el.hint.textContent = text;
    clearTimeout(hintTimer);
    if (ms) hintTimer = setTimeout(function () { el.hint.textContent = defaultHint(); }, ms);
  }
  function defaultHint() { return "Mantén presionado un preset para guardar la estación actual."; }

  /* ---------- Animación del dial ---------- */
  var anim = null;
  function stopAnim() { if (anim) { cancelAnimationFrame(anim.id); anim = null; } }

  function animateTo(target, ms, ease, done) {
    stopAnim();
    target = clampF(state.band, target);
    if (reduced || ms <= 0 || Math.abs(target - cur) < 0.001) { setCur(target); if (done) done(); return; }
    var from = cur, t0 = performance.now(), a = {};
    anim = a;
    function frame(now) {
      if (anim !== a) return;
      var t = Math.min(1, (now - t0) / ms);
      setCur(from + (target - from) * (ease || easeOut)(t));
      if (t < 1) a.id = requestAnimationFrame(frame);
      else { anim = null; if (done) done(); }
    }
    a.id = requestAnimationFrame(frame);
  }

  // Durante la búsqueda, registra todas las estaciones que el dial acaba de cruzar
  // (el dial puede avanzar más de un paso entre cuadros)
  function collectCrossed(prev, next) {
    var lo = Math.min(prev, next), hi = Math.max(prev, next), added = false;
    STATIONS[state.band].forEach(function (s) {
      if (s.f >= lo && s.f <= hi && found[state.band].indexOf(s.f) === -1) { found[state.band].push(s.f); added = true; }
    });
    if (added) { found[state.band].sort(function (x, y) { return x - y; }); renderList(); }
  }

  function setCur(v) {
    var b = BANDS[state.band], prev = cur;
    cur = Math.max(b.min, Math.min(b.max, v));
    if (sweeping) collectCrossed(prev, cur);
    var r = Math.round(cur);
    if (r !== state.freq[state.band]) { state.freq[state.band] = r; updateReadout(); }
    draw();
  }

  /* ---------- Render ---------- */
  function updateReadout() {
    var band = state.band, b = BANDS[band], f = state.freq[band];
    var st = stationAt(band, f), s = strength(band, f);

    el.freq.textContent = b.fmt(f);
    el.name.textContent = st ? st.name : s > 0 ? "Señal débil" : "Sin estación";
    el.rds.textContent = st ? st.genre : band === "fm" ? "Frecuencia modulada" : "Amplitud modulada";

    var level = s >= 1 ? 4 : s >= 0.55 ? 2 : s > 0 ? 1 : 0;
    Array.prototype.forEach.call(el.signal.children, function (bar, i) { bar.classList.toggle("is-on", i < level); });
    el.signal.setAttribute("aria-label", "Señal " + level + " de 4");
    el.stereo.classList.toggle("is-on", band === "fm" && s >= 1);

    el.dial.setAttribute("aria-valuenow", String(f));
    el.dial.setAttribute("aria-valuetext", b.fmt(f) + " " + b.unit);

    Array.prototype.forEach.call(el.presets.children, function (btn, i) {
      var pf = state.presets[band][i];
      btn.setAttribute("aria-pressed", String(pf !== null && pf === f));
    });
    Array.prototype.forEach.call(el.list.querySelectorAll(".radio__station"), function (btn) {
      btn.setAttribute("aria-pressed", String(Number(btn.dataset.f) === f));
    });

    window.dispatchEvent(new CustomEvent("radio:tunerchange", {
      detail: { band: band, freq: b.fmt(f), unit: b.unit, name: st ? st.name : "", power: state.power }
    }));
  }

  function renderBand() {
    var b = BANDS[state.band];
    Array.prototype.forEach.call(el.band.querySelectorAll(".seg__btn"), function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.band === state.band));
    });
    el.unit.textContent = b.unit;
    el.presetsLabel.textContent = "Presets " + b.label;
    el.dial.setAttribute("aria-valuemin", String(b.min));
    el.dial.setAttribute("aria-valuemax", String(b.max));
  }

  function renderPower() {
    el.power.setAttribute("aria-pressed", String(state.power));
    el.power.setAttribute("aria-label", state.power ? "Pausar radio" : "Reproducir radio");
    el.radio.dataset.power = state.power ? "on" : "off";
  }

  /* Presets: toque = sintonizar, mantener = guardar la estación actual */
  function renderPresets() {
    el.presets.innerHTML = "";
    state.presets[state.band].forEach(function (pf, i) {
      var btn = make("button", "radio__preset");
      btn.type = "button";
      btn.dataset.index = String(i);
      if (pf === null) {
        btn.classList.add("is-empty");
        btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span class="radio__preset-name">Vacío</span>';
        btn.setAttribute("aria-label", "Preset " + (i + 1) + " vacío. Guardar estación actual");
      } else {
        var st = stationAt(state.band, pf);
        btn.appendChild(make("span", "radio__preset-freq", BANDS[state.band].fmt(pf)));
        btn.appendChild(make("span", "radio__preset-name", st ? st.name : BANDS[state.band].unit));
        btn.setAttribute("aria-label", "Preset " + (i + 1) + ", " + BANDS[state.band].fmt(pf) + " " + BANDS[state.band].unit);
      }
      bindPreset(btn, i);
      el.presets.appendChild(btn);
    });
  }

  function bindPreset(btn, i) {
    var timer = null, long = false;
    function clear() { clearTimeout(timer); timer = null; }
    btn.addEventListener("pointerdown", function () {
      if (scanning) return;
      long = false; clear();
      timer = setTimeout(function () { long = true; savePreset(i); }, 600);
    });
    btn.addEventListener("pointerup", function () {
      if (scanning) return;
      var wasTimer = timer !== null;
      clear();
      if (long || !wasTimer) return;
      var pf = state.presets[state.band][i];
      if (saving || pf === null) savePreset(i);
      else animateTo(pf, glide(pf), easeOut, save);
    });
    btn.addEventListener("pointerleave", clear);
    btn.addEventListener("pointercancel", clear);
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    btn.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      var pf = state.presets[state.band][i];
      if (saving || pf === null) savePreset(i);
      else animateTo(pf, glide(pf), easeOut, save);
    });
  }

  function savePreset(i) {
    state.presets[state.band][i] = state.freq[state.band];
    exitSaving();
    save();
    renderPresets();
    updateReadout();
    say("Guardado en el preset " + (i + 1), 2200);
  }
  function enterSaving() {
    saving = true;
    el.presets.dataset.saving = "";
    el.save.setAttribute("aria-pressed", "true");
    say("Toca un preset para guardar aquí la estación actual");
    clearTimeout(savingTimer);
    savingTimer = setTimeout(function () { exitSaving(); say(defaultHint()); }, 6000);
  }
  function exitSaving() {
    saving = false;
    clearTimeout(savingTimer);
    delete el.presets.dataset.saving;
    el.save.setAttribute("aria-pressed", "false");
  }

  /* Lista de estaciones encontradas */
  function renderList() {
    el.list.innerHTML = "";
    var list = found[state.band];
    if (!list.length) {
      var li = make("li", "radio__empty", scanning ? "Buscando estaciones…" : "No hay estaciones. Toca «Buscar estaciones».");
      el.list.appendChild(li);
      return;
    }
    list.forEach(function (f) {
      var st = stationAt(state.band, f);
      var li = make("li");
      var btn = make("button", "radio__station");
      btn.type = "button";
      btn.dataset.f = String(f);
      btn.setAttribute("aria-pressed", String(f === state.freq[state.band]));
      btn.appendChild(make("span", "radio__station-freq", BANDS[state.band].fmt(f)));
      var txt = make("span", "radio__station-txt");
      txt.appendChild(make("div", "radio__station-name", st ? st.name : BANDS[state.band].unit));
      txt.appendChild(make("div", "radio__station-genre", st ? st.genre : ""));
      btn.appendChild(txt);
      btn.addEventListener("click", function () {
        if (scanning) return;
        animateTo(f, glide(f), easeOut, save);
      });
      li.appendChild(btn);
      el.list.appendChild(li);
    });
  }

  function renderAll() {
    renderBand();
    renderPower();
    renderPresets();
    renderList();
    updateReadout();
    draw();
  }

  /* ---------- Dial (canvas) ---------- */
  var ctx = el.canvas.getContext("2d");
  var colors = null;
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colors = {
      text: cs.getPropertyValue("--text").trim() || "#fff",
      dim: cs.getPropertyValue("--text-dim").trim() || "#999",
      faint: cs.getPropertyValue("--text-faint").trim() || "#555",
      font: getComputedStyle(document.body).fontFamily,
      rem: parseFloat(cs.fontSize) || 16
    };
  }

  function draw() {
    var w = el.dial.clientWidth, h = el.dial.clientHeight;
    if (!w || !h) return;
    if (!colors) readColors();
    var dpr = window.devicePixelRatio || 1;
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (el.canvas.width !== pw || el.canvas.height !== ph) { el.canvas.width = pw; el.canvas.height = ph; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var b = BANDS[state.band];
    var ppu = colors.rem * 0.8;           // píxeles por paso
    var half = w / 2;
    var from = Math.max(b.min, Math.floor(cur - half / ppu) - 1);
    var to = Math.min(b.max, Math.ceil(cur + half / ppu) + 1);
    var base = h - 8;

    ctx.lineCap = "round";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "400 " + Math.round(colors.rem * 0.72) + "px " + colors.font;

    for (var f = from; f <= to; f++) {
      var x = half + (f - cur) * ppu;
      var major = f % 10 === 0, mid = f % 5 === 0;
      var len = major ? h * 0.42 : mid ? h * 0.28 : h * 0.17;
      ctx.strokeStyle = major ? colors.dim : colors.faint;
      ctx.lineWidth = major ? 1.6 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, base - len);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = colors.dim;
        ctx.fillText(b.tick(f), x, base - len - colors.rem * 0.7);
      }
    }

    // marcas de estaciones encontradas
    ctx.fillStyle = colors.text;
    var list = found[state.band];
    for (var i = 0; i < list.length; i++) {
      var sx = half + (list[i] - cur) * ppu;
      if (sx < -4 || sx > w + 4) continue;
      ctx.beginPath();
      ctx.arc(sx, base + 1, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* El dial se vuelve a pintar si cambia el tema, el acento, el tamaño o el texto */
  new MutationObserver(function () { readColors(); draw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-accent", "style"] });
  if (window.ResizeObserver) new ResizeObserver(function () { readColors(); draw(); }).observe(el.dial);
  window.addEventListener("resize", function () { readColors(); draw(); });

  /* ---------- Sintonía ---------- */
  function glide(target) { return Math.min(700, 220 + Math.abs(target - cur) * 4); }

  function stepBy(d) {
    if (scanning) return;
    animateTo(state.freq[state.band] + d, 90, linear, save);
  }

  function seek(dir) {
    if (scanning) return;
    var list = found[state.band].slice().sort(function (a, b) { return a - b; });
    if (!list.length) { say("No hay estaciones. Toca «Buscar estaciones».", 2500); return; }
    var r = Math.round(cur), target = null, i;
    if (dir > 0) {
      for (i = 0; i < list.length; i++) if (list[i] > r) { target = list[i]; break; }
      if (target === null) target = list[0];
    } else {
      for (i = list.length - 1; i >= 0; i--) if (list[i] < r) { target = list[i]; break; }
      if (target === null) target = list[list.length - 1];
    }
    animateTo(target, glide(target), easeOut, save);
  }

  function setBand(band) {
    if (band === state.band) return;
    if (scanning) cancelScan();
    stopAnim();
    exitSaving();
    state.band = band;
    cur = state.freq[band];
    save();
    say(defaultHint());
    renderAll();
  }

  function setPower(on) {
    state.power = on;
    renderPower();
    save();
    updateReadout();
  }

  /* Búsqueda automática: recorre toda la banda y va llenando la lista */
  function scan() {
    if (scanning) { cancelScan(); return; }
    scanning = true;
    exitSaving();
    el.radio.dataset.scanning = "";
    el.scan.textContent = "Detener";
    el.scan.setAttribute("aria-pressed", "true");
    el.note.textContent = "Buscando…";
    found[state.band] = [];
    renderList();
    draw();
    var b = BANDS[state.band];
    animateTo(b.min, 300, easeOut, function () {
      sweeping = true;
      animateTo(b.max, 3200, linear, finishScan);
    });
  }
  function resetScanUi() {
    scanning = false; sweeping = false;
    delete el.radio.dataset.scanning;
    el.scan.textContent = "Buscar estaciones";
    el.scan.setAttribute("aria-pressed", "false");
  }
  function finishScan() {
    resetScanUi();
    var list = found[state.band];
    el.note.textContent = list.length + (list.length === 1 ? " estación encontrada" : " estaciones encontradas") + " · demostración";
    renderList();
    if (list.length) animateTo(list[0], 500, easeOut, save);
    else save();
  }
  function cancelScan() {
    stopAnim();
    resetScanUi();
    el.note.textContent = NOTE_DEFAULT;
    setCur(Math.round(cur));
    renderList();
    draw();
    save();
  }

  /* ---------- Eventos ---------- */
  el.band.addEventListener("click", function (e) {
    var btn = e.target.closest(".seg__btn");
    if (btn) setBand(btn.dataset.band);
  });

  el.power.addEventListener("click", function () { setPower(!state.power); });
  el.next.addEventListener("click", function () { seek(1); });
  el.prev.addEventListener("click", function () { seek(-1); });
  el.scan.addEventListener("click", scan);
  el.save.addEventListener("click", function () { if (saving) { exitSaving(); say(defaultHint()); } else enterSaving(); });

  // Sintonía fina: mantener presionado repite
  function hold(btn, delta) {
    var delay = null, timer = null;
    function stop() { clearTimeout(delay); clearInterval(timer); delay = timer = null; }
    btn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      stop();
      stepBy(delta);
      delay = setTimeout(function () { timer = setInterval(function () { stepBy(delta); }, 90); }, 400);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { btn.addEventListener(ev, function () { if (delay || timer) { stop(); save(); } }); });
    btn.addEventListener("click", function (e) { if (e.detail === 0) stepBy(delta); });
  }
  hold(el.down, -1);
  hold(el.up, 1);

  // Arrastrar el dial
  var drag = null;
  el.dial.addEventListener("pointerdown", function (e) {
    if (scanning) return;
    stopAnim();
    drag = { x: e.clientX, cur: cur };
    el.dial.setPointerCapture(e.pointerId);
  });
  el.dial.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var ppu = (colors ? colors.rem : 16) * 0.8;
    setCur(drag.cur - (e.clientX - drag.x) / ppu);
  });
  function endDrag() {
    if (!drag) return;
    drag = null;
    animateTo(Math.round(cur), 140, easeOut, save);
  }
  el.dial.addEventListener("pointerup", endDrag);
  el.dial.addEventListener("pointercancel", endDrag);
  el.dial.addEventListener("wheel", function (e) {
    e.preventDefault();
    stepBy(e.deltaY > 0 ? -1 : 1);
  }, { passive: false });
  el.dial.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "ArrowRight" || k === "ArrowUp") stepBy(1);
    else if (k === "ArrowLeft" || k === "ArrowDown") stepBy(-1);
    else if (k === "PageUp") seek(1);
    else if (k === "PageDown") seek(-1);
    else if (k === "Home") animateTo(BANDS[state.band].min, 400, easeOut, save);
    else if (k === "End") animateTo(BANDS[state.band].max, 400, easeOut, save);
    else return;
    e.preventDefault();
  });

  /* ---------- API ---------- */
  window.RadioTuner = {
    get: function () {
      var b = BANDS[state.band], f = state.freq[state.band], st = stationAt(state.band, f);
      return { band: state.band, freq: b.fmt(f), unit: b.unit, name: st ? st.name : "", power: state.power };
    },
    tune: function (band, step) { setBand(band); animateTo(step, 300, easeOut, save); },
    seekNext: function () { seek(1); },
    seekPrev: function () { seek(-1); },
    setPower: setPower
  };

  /* ---------- Inicio ---------- */
  el.note.textContent = NOTE_DEFAULT;
  say(defaultHint());
  readColors();
  renderAll();
  // La fuente del dial puede cargar después: repinta cuando esté lista
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { readColors(); draw(); });
})();
