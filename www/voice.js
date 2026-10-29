/* ==========================================================
   VOICE — comandos de voz y escritos
   Botón de micrófono en la barra (y tecla «voice» del volante). Escucha con el reconocimiento
   de voz del navegador; si no está disponible (p. ej. en la app de Windows, que no incluye el
   servicio de Google) muestra un cuadro para escribir la orden: se interpreta igual.
   Órdenes: ir a una pestaña, abrir apps, volumen, silencio, siguiente/anterior/pausa,
   radio, climatización, «llama a…», «navega a…», tema claro/oscuro.
   API: RadioVoice {listen(), run(texto), parse(texto), close()}
   Sección: ENTRADA
   ========================================================== */
(function () {
  "use strict";
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var root = document.documentElement;
  var panel = null, txt = null, hint = null, form = null, input = null, rec = null, open = false, closeT = null, srBroken = false;

  function sys() { return (window.RadioSystem && window.RadioSystem.get && window.RadioSystem.get()) || {}; }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim(); }
  function num(s) {
    var w = { cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
      dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
      treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100 };
    var m = String(s).match(/\d+([.,]\d+)?/);
    if (m) return parseFloat(m[0].replace(",", "."));
    var parts = norm(s).split(" "), total = null;
    for (var i = 0; i < parts.length; i++) if (parts[i] in w) total = (total || 0) + w[parts[i]];
    return total;
  }

  var VIEWS = [
    ["home", /\b(inicio|casa|pantalla principal|home)\b/], ["map", /\b(mapa|navegacion|gps)\b/], ["calls", /\b(llamadas|telefono|marcador)\b/],
    ["media", /\b(bluetooth|musica del celular|celular)\b/], ["radio", /\b(radio|emisoras|fm|am)\b/], ["vehicle", /\b(vehiculo|carro|auto|coche)\b/],
    ["cluster", /\b(cluster|tablero|instrumentos)\b/], ["ambient", /\b(ambiente|luces ambientales|ambiental)\b/], ["apps", /\b(aplicaciones|apps)\b/],
    ["settings", /\b(ajustes|configuracion|opciones)\b/]
  ];
  var VIEW_NAME = { home: "Inicio", map: "Mapa", calls: "Llamadas", media: "Bluetooth", radio: "Radio", vehicle: "Vehículo", cluster: "Cluster", ambient: "Ambiente", apps: "Apps", settings: "Ajustes" };

  function bestApp(q) {
    var list = (window.RadioApps && window.RadioApps.list && window.RadioApps.list()) || [], best = null, bl = 0;
    list.forEach(function (a) {
      var n = norm(a.name); if (!n) return;
      if (q === n || q.indexOf(n) >= 0 || (n.indexOf(q) >= 0 && q.length >= 3)) { if (n.length > bl) { best = a; bl = n.length; } }
    });
    return best;
  }
  function findContact(q) {
    var C = window.RadioCalls; if (!C) return null;
    var all = (C.favs() || []).concat(C.recent() || []);
    for (var i = 0; i < all.length; i++) { var nm = norm(all[i].name); if (nm && (q.indexOf(nm) >= 0 || nm.indexOf(q) >= 0)) return all[i]; }
    return null;
  }
  function vol() { return window.RadioVolume && window.RadioVolume.get().master; }
  function setVol(v) { if (window.RadioVolume) { window.RadioVolume.set(Math.max(0, Math.min(100, Math.round(v)))); window.RadioVolume.open("drv"); } }

  // Devuelve {say, run} o null
  function parse(raw) {
    var t = norm(raw), m;
    if (!t) return null;

    // Ayuda
    if (/^(ayuda|que puedo decir|comandos)$/.test(t)) return { say: "Ayuda", run: help };

    // Volumen / silencio
    if (/\b(quita|quitar|sin)\b.*\b(silencio|mute)\b|\b(activa|activar|con)\b.*\bsonido\b/.test(t)) return { say: "Sonido activado", run: function () { window.RadioQuick && window.RadioQuick.set({ mute: false }); } };
    if (/\b(silencio|silenciar|mute|mutea|calla)\b/.test(t)) return { say: "Silencio", run: function () { window.RadioQuick && window.RadioQuick.set({ mute: true }); } };
    if ((m = t.match(/\bvolumen\b(.*)$/)) && /\b(al|a|en|pon|ponlo|ajusta)\b/.test(t) && num(m[1]) != null) {
      var v = num(m[1]); return { say: "Volumen " + v, run: function () { setVol(v); } };
    }
    if (/\b(sube|subir|aumenta|mas)\b.*\b(volumen|sonido|fuerte)\b|\bmas fuerte\b/.test(t)) return { say: "Subo el volumen", run: function () { setVol((vol() || 0) + (sys().keyStep || 5) * 2); } };
    if (/\b(baja|bajar|reduce|menos)\b.*\b(volumen|sonido)\b|\bmas bajo\b|\bmenos fuerte\b/.test(t)) return { say: "Bajo el volumen", run: function () { setVol((vol() || 0) - (sys().keyStep || 5) * 2); } };

    // Música
    if (/\b(siguiente|proxima|proximo|adelanta|salta)\b/.test(t) && !/\bllam/.test(t)) return { say: "Siguiente", run: function () { window.RadioMedia && window.RadioMedia.ctl("next"); } };
    if (/\b(anterior|atras|previa|previo|retrocede)\b/.test(t)) return { say: "Anterior", run: function () { window.RadioMedia && window.RadioMedia.ctl("prev"); } };
    if (/\b(pausa|pausar|deten|detener|para la musica|apaga la musica|apaga la radio)\b/.test(t)) return { say: "Pausa", run: function () { var M = window.RadioMedia; if (M && M.get().state === "playing") M.ctl("toggle"); } };
    if (/\b(pon la radio|enciende la radio|prende la radio|reproduce|reproducir|play|continua|sigue)\b/.test(t) && !/\babre\b/.test(t)) return { say: "Reproduciendo", run: function () { var M = window.RadioMedia; if (M && M.get().state !== "playing") M.ctl("toggle"); } };

    // Clima
    if ((m = t.match(/\b(clima|aire|temperatura|climatizacion)\b(.*)$/)) && /\b(pon|ponlo|ajusta|a|en)\b/.test(t) && num(m[2]) != null && num(m[2]) >= 16 && num(m[2]) <= 30) {
      var g = num(m[2]); return { say: "Clima a " + g + " °C", run: function () { window.RadioClimate && window.RadioClimate.set({ driver: g, pass: g, power: true }); } };
    }
    if (/\b(enciende|prende|activa)\b.*\b(clima|aire|climatizacion)\b/.test(t)) return { say: "Clima encendido", run: function () { window.RadioClimate && window.RadioClimate.set({ power: true }); } };
    if (/\b(apaga|desactiva)\b.*\b(clima|aire|climatizacion)\b/.test(t)) return { say: "Clima apagado", run: function () { window.RadioClimate && window.RadioClimate.set({ power: false }); } };

    // Tema
    if (/\bmodo oscuro|tema oscuro|\boscuro\b/.test(t)) return { say: "Modo oscuro", run: function () { window.RadioSystem && window.RadioSystem.set({ themeMode: "dark" }); } };
    if (/\bmodo claro|tema claro|\bclaro\b/.test(t)) return { say: "Modo claro", run: function () { window.RadioSystem && window.RadioSystem.set({ themeMode: "light" }); } };
    if (/\bautomatico\b.*\b(tema|modo)\b|\b(tema|modo)\b.*\bautomatico\b/.test(t)) return { say: "Tema automático", run: function () { window.RadioSystem && window.RadioSystem.set({ themeMode: "auto" }); } };

    // Llamadas
    if ((m = t.match(/\b(llama|llamar|marca|marcar|telefonea)\b\s*(a |al |a la )?(.+)$/))) {
      var who = m[3].trim(), digits = who.replace(/[^\d+]/g, "");
      if (digits.length >= 4 && /^[\d\s+()-]+$/.test(who)) return { say: "Llamando al " + who, run: function () { window.RadioCalls.dial(digits, ""); } };
      var c = findContact(who);
      if (c) return { say: "Llamando a " + (c.name || c.n), run: function () { window.RadioCalls.dial(c.n, c.name || ""); } };
      return { say: "No encuentro a «" + who + "» en favoritos", fail: true };
    }

    // Navegación a un destino
    if ((m = t.match(/\b(navega|navegar|lleva|llevame|ruta|como llego|vamos|ir)\b\s*(a |al |a la |hacia |hasta )?(.+)$/)) && !/^(inicio|mapa|ajustes|radio)/.test((m[3] || "").trim()) && (m[3] || "").trim().length > 2 &&
        !VIEWS.some(function (v) { return v[1].test((m[3] || "").trim()) && (m[3] || "").trim().split(" ").length <= 2; })) {
      var dest = m[3].trim();
      return { say: "Buscando «" + dest + "»", run: function () {
        window.RadioNav && window.RadioNav.show("map");
        var q = document.getElementById("nav-q");
        if (q) { q.value = dest; q.dispatchEvent(new Event("input", { bubbles: true })); q.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }
      } };
    }

    // Abrir una app
    if ((m = t.match(/\b(abre|abrir|inicia|iniciar|ejecuta|pon|ponme|lanza)\b\s*(la app de |la aplicacion de |la app |el |la |los |las )?(.+)$/))) {
      var a = bestApp(m[3].trim());
      if (a) return { say: "Abriendo " + a.name, run: function () { window.RadioNav && window.RadioNav.show("apps"); window.RadioApps.open(a.id); } };
    }

    // Ir a una pestaña
    for (var i = 0; i < VIEWS.length; i++) {
      if (VIEWS[i][1].test(t)) {
        var key = VIEWS[i][0];
        if (/\b(ve|ir|abre|abrir|muestra|mostrar|llevame|pon|ponme|vamos|pasa)\b/.test(t) || t.split(" ").length <= 3)
          return { say: VIEW_NAME[key], run: function () { window.RadioNav && window.RadioNav.show(key); } };
      }
    }
    var app2 = bestApp(t);
    if (app2 && t.split(" ").length <= 4) return { say: "Abriendo " + app2.name, run: function () { window.RadioNav && window.RadioNav.show("apps"); window.RadioApps.open(app2.id); } };
    return null;
  }

  function help() {
    show("Prueba: «ve al mapa», «abre Waze», «sube el volumen», «siguiente», «pon el clima en 22», «llama a mamá», «navega a San José», «modo oscuro».", "help");
    schedule(9000);
  }

  /* ---------- Panel ---------- */
  function build() {
    if (panel) return;
    panel = document.createElement("div");
    panel.className = "voice"; panel.id = "voice"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Comandos de voz");
    panel.innerHTML =
      '<div class="voice__orb" aria-hidden="true"><svg class="icon"><use href="#i-mic"/></svg></div>' +
      '<div class="voice__body"><div class="voice__txt" role="status" aria-live="polite"></div><div class="voice__hint"></div>' +
      '<form class="voice__form" autocomplete="off"><input class="voice__in" type="text" aria-label="Escribe la orden" placeholder="Escribe una orden, por ejemplo: abre Waze" spellcheck="false"><button type="submit" class="btn-pill">Enviar</button></form></div>' +
      '<button type="button" class="btn-round voice__x" aria-label="Cerrar"><svg class="icon"><use href="#i-close"/></svg></button>';
    document.body.appendChild(panel);
    txt = panel.querySelector(".voice__txt"); hint = panel.querySelector(".voice__hint"); form = panel.querySelector(".voice__form"); input = panel.querySelector(".voice__in");
    panel.querySelector(".voice__x").addEventListener("click", close);
    form.addEventListener("submit", function (e) { e.preventDefault(); var v = input.value.trim(); input.value = ""; if (v) run(v); });
  }
  function show(text, state) {
    build();
    panel.hidden = false; open = true;
    panel.dataset.state = state || "idle";
    txt.textContent = text || "";
    root.setAttribute("data-voice", "on");
    clearTimeout(closeT);
  }
  function schedule(ms) { clearTimeout(closeT); closeT = setTimeout(close, ms); }
  function close() {
    clearTimeout(closeT);
    if (rec) { try { rec.onend = null; rec.abort(); } catch (e) {} rec = null; }
    if (panel) { panel.hidden = true; panel.dataset.state = "idle"; }
    open = false; root.removeAttribute("data-voice");
  }

  function run(text) {
    var cmd = parse(text);
    if (!cmd) { show("No te entendí: «" + text + "»", "fail"); hint.textContent = "Di «ayuda» para ver ejemplos."; schedule(4000); return false; }
    if (cmd.fail) { show(cmd.say, "fail"); schedule(3500); return false; }
    show(cmd.say, "ok");
    try { cmd.run(); } catch (e) {}
    if (cmd.say !== "Ayuda") schedule(1600);
    return true;
  }

  function listen() {
    if (sys().voiceCmd === false) return;
    build();
    if (open && rec) { close(); return; }
    show("", "idle"); hint.textContent = "";
    if (!SR || srBroken) { fallback(srBroken ? "El reconocimiento de voz no está disponible en esta app." : "Este navegador no trae reconocimiento de voz."); return; }
    try {
      rec = new SR();
      rec.lang = "es-CR"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 3;
      var final = "";
      show("Te escucho…", "listen");
      rec.onresult = function (e) {
        var interim = "";
        for (var i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
        }
        txt.textContent = final || interim || "Te escucho…";
      };
      rec.onerror = function (e) {
        var er = e && e.error;
        if (er === "no-speech" || er === "aborted") { show("No te escuché", "fail"); schedule(2000); return; }
        if (er === "not-allowed") { fallback("Falta el permiso del micrófono."); return; }
        srBroken = true; fallback("El reconocimiento de voz no está disponible en esta app.");
      };
      rec.onend = function () { rec = null; if (final.trim()) run(final.trim()); else if (open && panel.dataset.state === "listen") { show("No te escuché", "fail"); schedule(2000); } };
      rec.start();
    } catch (err) { srBroken = true; fallback("No se pudo iniciar el micrófono."); }
  }
  function fallback(msg) {
    show(msg, "type");
    hint.textContent = "Escribe la orden y pulsa Enviar. Di «ayuda» para ver ejemplos.";
    if (input) setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#voice-btn");
    if (b) listen();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) close(); });
  window.addEventListener("radio:key", function (e) { if (e.detail && e.detail.key === "voice") listen(); });

  window.RadioVoice = { listen: listen, run: run, parse: function (t) { var c = parse(t); return c ? c.say : null; }, close: close, isOpen: function () { return open; } };
})();
