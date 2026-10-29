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
    ["home", /\b(inicio|pantalla principal|home)\b/], ["casa", /\b(casa|hogar|domotica|mi casa)\b/], ["map", /\b(mapa|navegacion|gps)\b/], ["calls", /\b(llamadas|telefono|marcador)\b/],
    ["media", /\b(bluetooth|musica del celular|celular)\b/], ["radio", /\b(radio|emisoras|fm|am)\b/], ["vehicle", /\b(vehiculo|carro|auto|coche)\b/],
    ["cluster", /\b(cluster|tablero|instrumentos)\b/], ["ambient", /\b(ambiente|luces ambientales|ambiental)\b/], ["apps", /\b(aplicaciones|apps)\b/],
    ["settings", /\b(ajustes|configuracion|opciones)\b/]
  ];
  var VIEW_NAME = { home: "Inicio", casa: "Casa", map: "Mapa", calls: "Llamadas", media: "Bluetooth", radio: "Radio", vehicle: "Vehículo", cluster: "Cluster", ambient: "Ambiente", apps: "Apps", settings: "Ajustes" };

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


    // Casa (Home Assistant)
    var H = window.RadioHA;
    if (H && H.configured && (H.configured() || H.demo())) {
      var hc = houseCmd(t, H); if (hc) return hc;
    }

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


  /* ---------- Casa ---------- */
  function confirmTap(title, fn) {
    if (window.RadioToast) window.RadioToast.show({ title: title, text: "Toca para confirmar", kind: "info", ms: 8000, actions: [{ label: "Confirmar", fn: fn }] });
  }
  function houseCmd(t, H) {
    var m, e;
    var LIGHTS = ["light", "switch", "fan", "input_boolean"];
    if (/\b(apaga|apagar)\b.*\btodo\b|\bapaga todas las luces\b|\bapaga las luces\b/.test(t)) return { say: "Apago las luces", run: function () { H.allLights(false); } };
    if (/\b(enciende|prende)\b.*\btodas las luces\b/.test(t)) return { say: "Enciendo todas las luces", run: function () { H.allLights(true); } };
    if ((m = t.match(/\b(escena|modo)\b\s*(de |del |la |el )?(.+)$/)) || (m = t.match(/\b(activa|ejecuta|lanza)\b\s*(la escena |el modo |la |el )?(.+)$/))) {
      e = H.findByName(m[3], ["scene", "script"]);
      if (e) return { say: H.name(e), run: function () { H.toggle(e.entity_id); } };
    }
    if ((m = t.match(/\b(abre|abrir|cierra|cerrar|sube|baja)\b\s*(el |la |los |las )?(.+)$/)) && /\b(porton|garaje|cochera|persiana|cortina|puerta del garaje)\b/.test(m[3])) {
      e = H.findByName(m[3], ["cover"]);
      if (e) {
        var open = /abre|abrir|sube/.test(m[1]);
        if (open) return { say: "¿Abrir " + H.name(e) + "?", run: function () { confirmTap("¿Abrir " + H.name(e) + "?", function () { H.call("cover", "open_cover", { entity_id: e.entity_id }); }); } };
        return { say: "Cierro " + H.name(e), run: function () { H.call("cover", "close_cover", { entity_id: e.entity_id }); } };
      }
    }
    if ((m = t.match(/\b(muestra|muestrame|ver|abre|enseña)\b\s*(la |el )?camara\s*(de |del |de la )?(.*)$/))) {
      e = H.findByName(m[4] || "camara", ["camera"]) || H.domain("camera")[0];
      if (e) return { say: H.name(e), run: function () { window.RadioNav && window.RadioNav.show("casa"); window.RadioCasa && window.RadioCasa.openCamera(e.entity_id); } };
    }
    if (/\b(cierra|bloquea|asegura)\b.*\b(llave|puerta|cerradura)\b/.test(t)) {
      e = H.findByName(t.replace(/cierra|bloquea|asegura|con llave|la puerta/g, ""), ["lock"]) || H.domain("lock")[0];
      if (e) return { say: "Cierro " + H.name(e), run: function () { H.call("lock", "lock", { entity_id: e.entity_id }); } };
    }
    if (/\b(abre|desbloquea|quita la llave)\b.*\b(puerta|cerradura|llave)\b/.test(t) && !/garaje|porton/.test(t)) {
      e = H.domain("lock")[0];
      if (e) return { say: "¿Abrir " + H.name(e) + "?", run: function () { confirmTap("¿Abrir " + H.name(e) + "?", function () { H.call("lock", "unlock", { entity_id: e.entity_id }); }); } };
    }
    if (/\balarma\b/.test(t)) {
      e = H.domain("alarm_control_panel")[0];
      if (e) {
        if (/\b(arma|activa|pon|enciende)\b/.test(t)) { var mode = /\b(fuera|salgo|ausente)\b/.test(t) ? "away" : /\b(noche|dormir)\b/.test(t) ? "night" : "home"; return { say: "Armo la alarma", run: function () { H.alarm(e.entity_id, mode); } }; }
        if (/\b(desarma|desactiva|apaga|quita)\b/.test(t)) return { say: "Para desarmar, usa el código", run: function () { window.RadioCasa && window.RadioCasa.open("resumen"); } };
      }
    }
    if ((m = t.match(/\b(enciende|prende|apaga|activa|desactiva)\b\s*(el |la |los |las |un |una )?(luz |luces )?(de |del |de la |en )?(.+)$/))) {
      var q = (m[5] || "").trim();
      if (q && !/\b(radio|musica|clima|aire|pantalla|app|aplicacion)\b/.test(q)) {
        e = H.findByName(q, LIGHTS);
        if (e) { var on = /^(enciende|prende|activa)$/.test(m[1]); return { say: (on ? "Enciendo " : "Apago ") + H.name(e), run: function () { var d = e.entity_id.split(".")[0]; H.call(d === "input_boolean" || d === "switch" || d === "fan" || d === "light" ? d : "homeassistant", on ? "turn_on" : "turn_off", { entity_id: e.entity_id }); } }; }
      }
    }
    return null;
  }

  function help() {
    show("Prueba: «ve al mapa», «abre Waze», «sube el volumen», «siguiente», «pon el clima en 22», «llama a mamá», «navega a San José», «modo oscuro», «enciende la luz de la sala», «apaga todo», «activa la escena cine», «muestra la cámara de la entrada».", "help");
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
    if (typeof wakeSync === "function") setTimeout(wakeSync, 400);
  }

  function speak(text) {
    if (sys().voiceSpeak !== true || !window.speechSynthesis || !text) return;
    try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = "es-CR"; u.rate = 1.02; speechSynthesis.speak(u); } catch (e) {}
  }
  function run(text) {
    var cmd = parse(text);
    if (!cmd) { show("No te entendí: «" + text + "»", "fail"); hint.textContent = "Di «ayuda» para ver ejemplos."; schedule(4000); return false; }
    if (cmd.fail) { show(cmd.say, "fail"); schedule(3500); return false; }
    show(cmd.say, "ok"); speak(cmd.say);
    try { cmd.run(); } catch (e) {}
    if (cmd.say !== "Ayuda") schedule(1600);
    return true;
  }

  function listen() {
    if (sys().voiceCmd === false) return;
    build();
    if (open && rec) { close(); return; }
    wakeStop();
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


  /* ---------- Palabra de activación: «Oye Nómada» ---------- */
  var wakeRec = null, wakeOn = false, wakeRetry = 0;
  function wakeStop() { wakeOn = false; if (wakeRec) { try { wakeRec.onend = null; wakeRec.abort(); } catch (e) {} wakeRec = null; } }
  function wakeStart() {
    if (wakeOn || !SR || srBroken || sys().voiceWake !== true || sys().voiceCmd === false) return;
    wakeOn = true;
    try {
      wakeRec = new SR(); wakeRec.lang = "es-CR"; wakeRec.continuous = true; wakeRec.interimResults = false;
      wakeRec.onresult = function (e) {
        for (var i = e.resultIndex; i < e.results.length; i++) {
          if (!e.results[i].isFinal) continue;
          var tr = norm(e.results[i][0].transcript), mm = tr.match(/\b(oye|hey|ey|hola)\s+(nomada|nomadas|no mada)\b\s*(.*)$/);
          if (!mm) continue;
          var rest = (mm[3] || "").trim();
          if (rest) { show("", "ok"); run(rest); } else { wakeStop(); listen(); }
        }
      };
      wakeRec.onerror = function (e) { if (e && (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "network")) { srBroken = true; wakeStop(); } };
      wakeRec.onend = function () { wakeRec = null; wakeOn = false; if (!srBroken && sys().voiceWake === true && wakeRetry++ < 200) setTimeout(wakeStart, 600); };
      wakeRec.start();
    } catch (e) { wakeOn = false; }
  }
  function wakeSync() { if (sys().voiceWake === true) wakeStart(); else wakeStop(); }
  window.addEventListener("radio:systemchange", wakeSync);
  setTimeout(wakeSync, 1500);

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#voice-btn");
    if (b) listen();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) close(); });
  window.addEventListener("radio:key", function (e) { if (e.detail && e.detail.key === "voice") listen(); });

  window.RadioVoice = { listen: listen, run: run, parse: function (t) { var c = parse(t); return c ? c.say : null; }, close: close, isOpen: function () { return open; } };
})();
