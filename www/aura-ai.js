/* ==========================================================
   AURA AI — asistente con Gemini + micrófono propio
   · Un solo micrófono abierto con cancelación de eco, ruido y ganancia (se pide el permiso una vez).
   · Detecta cuándo alguien habla (VAD por energía, se adapta al ruido y a la música), graba esa frase
     en WAV y se la manda a Gemini, que la transcribe, decide si le hablaron («Oye Aura») y devuelve
     órdenes simples en español que ejecuta el interpretador local (voice.js) y una respuesta hablada.
   · Funciona también en la app de Windows, que no trae el reconocimiento de voz de Google.
   · Privacidad: con «Oye Aura» activo, cada frase que se oye se envía a Google (con límite por minuto).
     Sin clave no se envía nada.
   Claves: se guardan en este equipo (localStorage «aura-keys»), no entran en la copia de ajustes.
   API: RadioAI {ready(), listen(), wake(on), ask(texto), keys(), setKeys(o), test(), speak(t), speaking()}
   Sección: ENTRADA
   ========================================================== */
(function () {
  "use strict";
  var KEYS = "aura-keys";
  var DEFAULT_MODEL = "gemini-2.5-flash";
  var API = "https://generativelanguage.googleapis.com/v1beta/models/";

  function sys() { return (window.RadioSystem && window.RadioSystem.get && window.RadioSystem.get()) || {}; }
  function V() { return window.RadioVoice; }

  /* ---------- Claves ---------- */
  function loadKeys() { try { return JSON.parse(localStorage.getItem(KEYS) || "{}") || {}; } catch (e) { return {}; } }
  var keys = loadKeys();
  function setKeys(o) {
    keys = Object.assign({}, keys, o || {});
    try { localStorage.setItem(KEYS, JSON.stringify(keys)); } catch (e) {}
    window.dispatchEvent(new CustomEvent("radio:keys", { detail: { gemini: !!keys.gemini, maps: !!keys.maps } }));
  }
  function ready() { return !!keys.gemini && sys().aiVoice !== false && sys().voiceCmd !== false; }

  /* ---------- Micrófono único ---------- */
  var stream = null, ctx = null, src = null, proc = null, idleT = null, starting = null;
  var RATE = 16000, ring = [], ringLen = 0, PRE = 0.5;       // buffer previo (s) para no cortar el inicio
  var cap = null;                                             // captura en curso {chunks, n, started}
  var floor = 0.01, hot = 0, quiet = 0, tts = false, listeners = [];
  var manual = false, manualCb = null, manualT = null, wakeOn = false;

  function mic() {
    if (stream && stream.active) { return Promise.resolve(stream); }
    if (starting) return starting;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error("nomic"));
    starting = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }).then(function (s) {
      stream = s; starting = null; graph(); return s;
    }, function (e) { starting = null; throw e; });
    return starting;
  }
  function graph() {
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC(); src = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);
    var zero = ctx.createGain(); zero.gain.value = 0;
    proc.onaudioprocess = function (e) { onAudio(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate); };
    src.connect(proc); proc.connect(zero); zero.connect(ctx.destination);
  }
  function release() {
    try { if (proc) { proc.disconnect(); proc.onaudioprocess = null; } if (src) src.disconnect(); if (ctx) ctx.close(); } catch (e) {}
    try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    stream = ctx = src = proc = null; ring = []; ringLen = 0;
  }
  // En páginas file:// o http por IP el navegador pregunta el permiso en cada apertura: ahí el micrófono se deja abierto
  var persist = !/^(https:|app:)$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname);
  function idleLater() { clearTimeout(idleT); if (persist) return; if (!wakeOn && !cap) idleT = setTimeout(function () { if (!wakeOn && !cap && !manual) release(); }, 120000); }

  function rms(buf) { var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }

  function onAudio(buf, sr) {
    var dur = buf.length / sr, level = rms(buf);
    if (tts) { hot = 0; quiet = 0; return; }                  // no se oye a sí misma
    // adaptación: el piso sube lento con el ruido/música y baja rápido
    if (!cap) floor = level < floor ? floor * 0.9 + level * 0.1 : floor * 0.995 + level * 0.005;
    var thr = Math.max(0.015, floor * 3.2);
    var loud = level > thr;
    if (!cap) {
      ring.push(buf); ringLen += buf.length;
      while (ringLen > PRE * sr && ring.length > 1) { ringLen -= ring[0].length; ring.shift(); }
      hot = loud ? hot + dur : 0;
      if (hot >= 0.16 && (wakeOn || manual)) beginCap(sr);
    } else {
      cap.chunks.push(buf); cap.n += buf.length; cap.sr = sr;
      cap.t += dur;
      if (loud) { quiet = 0; cap.voiced += dur; } else quiet += dur;
      if (quiet >= 0.9 || cap.t >= 9) endCap();
    }
  }
  function beginCap(sr) { cap = { chunks: ring.slice(), n: ringLen, sr: sr, t: 0, voiced: 0 }; ring = []; ringLen = 0; quiet = 0; hot = 0; emit("hear"); }
  function endCap() {
    var c = cap; cap = null; quiet = 0; hot = 0;
    if (!c || c.voiced < 0.3) { emit("idle"); if (manual) finishManual(null); return; }
    var wav = toWav(c.chunks, c.n, c.sr);
    emit("think");
    if (manual) { finishManual(wav); return; }
    handleWake(wav);
  }
  function emit(s) { listeners.forEach(function (f) { try { f(s); } catch (e) {} }); }

  /* ---------- WAV 16 kHz mono ---------- */
  function toWav(chunks, n, sr) {
    var all = new Float32Array(n), o = 0;
    chunks.forEach(function (c) { all.set(c, o); o += c.length; });
    var ratio = sr / RATE, len = Math.floor(all.length / ratio), out = new Int16Array(len);
    for (var i = 0; i < len; i++) {
      var a = Math.floor(i * ratio), b = Math.min(all.length, Math.floor((i + 1) * ratio)), s = 0, k = 0;
      for (var j = a; j < b; j++) { s += all[j]; k++; }
      var v = k ? s / k : 0; v = Math.max(-1, Math.min(1, v * 1.6));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    var buf = new ArrayBuffer(44 + out.length * 2), dv = new DataView(buf);
    function str(p, t) { for (var q = 0; q < t.length; q++) dv.setUint8(p + q, t.charCodeAt(q)); }
    str(0, "RIFF"); dv.setUint32(4, 36 + out.length * 2, true); str(8, "WAVE"); str(12, "fmt "); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, RATE, true); dv.setUint32(28, RATE * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, "data"); dv.setUint32(40, out.length * 2, true);
    for (var m = 0; m < out.length; m++) dv.setInt16(44 + m * 2, out[m], true);
    var bytes = new Uint8Array(buf), bin = "";
    for (var z = 0; z < bytes.length; z += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(z, z + 0x8000));
    return btoa(bin);
  }

  /* ---------- Contexto para Gemini ---------- */
  function context() {
    var c = { vista: document.documentElement.getAttribute("data-view") || "", hora: new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" }) };
    try { c.apps = ((window.RadioApps && window.RadioApps.list && window.RadioApps.list()) || []).slice(0, 40).map(function (a) { return a.name; }); } catch (e) {}
    try { c.favoritos = ((window.RadioCalls && window.RadioCalls.favs && window.RadioCalls.favs()) || []).map(function (f) { return f.name; }).filter(Boolean); } catch (e) {}
    try {
      var H = window.RadioHA;
      if (H && (H.demo() || H.configured())) c.casa = H.all().filter(function (s) { return /^(light|switch|cover|lock|fan|scene|script|camera|alarm_control_panel|input_boolean)\./.test(s.entity_id); })
        .slice(0, 80).map(function (s) { return H.name(s) + " (" + s.entity_id.split(".")[0] + (H.area(s) ? ", " + H.area(s) : "") + ", " + s.state + ")"; });
    } catch (e) {}
    try { var M = window.RadioMedia && window.RadioMedia.get(); if (M) c.musica = M.state + (M.title ? ": " + M.title : ""); } catch (e) {}
    return c;
  }
  var SYS = "Eres AURA, la asistente de voz del sistema de un carro (español de Costa Rica, tono amable y breve). " +
    "Recibes una frase (a veces como audio). Devuelve SIEMPRE JSON con: heard (lo que se dijo, transcrito), addressed (true si la frase es para ti), commands (lista de órdenes) y say (respuesta corta para decir en voz alta, máximo 2 frases, sin emojis). " +
    "Si wake=true, la frase solo es para ti cuando empieza con «oye Aura», «hey Aura» o similar; si no, addressed=false y commands vacío (puede ser música, radio o gente hablando). Quita ese saludo antes de interpretar. " +
    "Las órdenes se escriben en español simple, una acción cada una, SOLO con estos formatos (usa los nombres exactos de la lista de contexto): " +
    "«ve al mapa|a casa|al inicio|a ajustes|a la radio», «abre <app>», «sube el volumen», «baja el volumen», «pon el volumen en <n>», «silencio», «siguiente», «anterior», «pausa», «reproduce», " +
    "«pon el clima en <n>», «enciende el clima», «apaga el clima», «modo oscuro», «modo claro», «llama a <favorito>», «navega a <lugar>», " +
    "«enciende la luz de <nombre>», «apaga la luz de <nombre>», «apaga todo», «enciende todas las luces», «activa la escena <nombre>», «abre el portón», «cierra el portón», " +
    "«muestra la cámara de <nombre>», «cierra la puerta con llave», «arma la alarma». " +
    "Si te hacen una pregunta general, responde en say y deja commands vacío. Si no entiendes o no existe lo que piden, dilo en say. No inventes dispositivos que no estén en el contexto. " +
    "Nunca ejecutes abrir cerraduras, desarmar alarmas ni abrir portones sin que el usuario lo haya pedido de forma explícita.";

  var inflight = 0, stamps = [];
  function allowed() { var n = Date.now(); stamps = stamps.filter(function (t) { return n - t < 60000; }); if (stamps.length >= 8) return false; stamps.push(n); return true; }

  function gemini(parts, wake) {
    var model = keys.model || DEFAULT_MODEL;
    var body = {
      systemInstruction: { parts: [{ text: SYS }] },
      contents: [{ role: "user", parts: parts.concat([{ text: "wake=" + (wake ? "true" : "false") + "\ncontexto=" + JSON.stringify(context()) }]) }],
      generationConfig: {
        temperature: 0.2, responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { heard: { type: "STRING" }, addressed: { type: "BOOLEAN" }, commands: { type: "ARRAY", items: { type: "STRING" } }, say: { type: "STRING" } }, required: ["heard", "addressed", "commands", "say"] }
      }
    };
    return fetch(API + encodeURIComponent(model) + ":generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": keys.gemini }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j, status: r.status }; }); })
      .then(function (o) {
        if (!o.ok) { var m = (o.j && o.j.error && o.j.error.message) || ("HTTP " + o.status); var e = new Error(m); e.status = o.status; throw e; }
        var t = o.j && o.j.candidates && o.j.candidates[0] && o.j.candidates[0].content && o.j.candidates[0].content.parts;
        var txt = t && t.map(function (p) { return p.text || ""; }).join("");
        var r = JSON.parse(txt || "{}");
        return { heard: String(r.heard || ""), addressed: r.addressed !== false, commands: Array.isArray(r.commands) ? r.commands.map(String) : [], say: String(r.say || "") };
      });
  }

  /* ---------- Ejecutar el resultado ---------- */
  function apply(r) {
    var ok = 0;
    r.commands.forEach(function (c) { try { if (V() && V().exec(c)) ok++; } catch (e) {} });
    var say = r.say || (r.commands.length && ok ? "Listo" : "");
    if (V() && V().ui) V().ui.show(say || r.heard || "…", ok || say ? "ok" : "fail", r.heard && say ? "«" + r.heard + "»" : "");
    if (say) speak(say);
    if (V() && V().ui) V().ui.schedule(Math.max(3500, say.length * 70));
    return r;
  }
  function fail(e) {
    var m = e && e.message ? e.message : "";
    var t = /API key|API_KEY|permission|403|401/i.test(m) ? "La clave de Gemini no funciona. Revísala en Ajustes." : /quota|429|RESOURCE/i.test(m) ? "Se acabó la cuota de Gemini por ahora." : "No pude hablar con Gemini (revisa internet).";
    if (V() && V().ui) { V().ui.show(t, "fail", ""); V().ui.schedule(4500); }
    return null;
  }

  /* ---------- Hablar ---------- */
  var voice = null;
  function pickVoice() {
    if (voice || !window.speechSynthesis) return voice;
    var vs = speechSynthesis.getVoices() || [], pref = ["es-CR", "es-MX", "es-US", "es-419", "es-ES"];
    for (var i = 0; i < pref.length && !voice; i++) voice = vs.filter(function (v) { return v.lang && v.lang.replace("_", "-").indexOf(pref[i]) === 0; })[0] || null;
    return voice || vs.filter(function (v) { return v.lang && v.lang.indexOf("es") === 0; })[0] || null;
  }
  function speak(text) {
    if (!window.speechSynthesis || !text || sys().voiceSpeak === false) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text); u.lang = "es-CR"; var v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } u.rate = 1.03;
      u.onstart = function () { tts = true; }; u.onend = u.onerror = function () { setTimeout(function () { tts = false; }, 350); };
      tts = true; speechSynthesis.speak(u);
    } catch (e) { tts = false; }
  }

  /* ---------- Modo palabra de activación ---------- */
  function handleWake(wav) {
    if (!allowed()) { emit("idle"); return; }
    inflight++;
    gemini([{ inlineData: { mimeType: "audio/wav", data: wav } }, { text: "Audio del micrófono ambiente (puede haber música o gente hablando)." }], true).then(function (r) {
      inflight--; emit("idle");
      if (r.addressed && (r.commands.length || r.say)) apply(r);
    }, function (e) { inflight--; emit("idle"); if (e && e.status === 400) return; fail(e); });
  }
  function wake(on) {
    on = !!on && ready();
    if (on === wakeOn) return;
    wakeOn = on;
    if (on) mic().catch(function () { wakeOn = false; if (V() && V().ui) { V().ui.show("Falta el permiso del micrófono.", "fail", ""); V().ui.schedule(3000); } });
    else idleLater();
  }

  /* ---------- Pulsar para hablar ---------- */
  var duckSaved = null;
  function duck() {
    try { var Q = window.RadioQuick; if (Q && Q.get().mute !== true && duckSaved == null) { duckSaved = true; Q.set({ mute: true }); } } catch (e) {}
  }
  function restoreDuck() { try { if (duckSaved && window.RadioQuick) window.RadioQuick.set({ mute: false }); } catch (e) {} duckSaved = null; }
  function finishManual(wav) {
    var cb = manualCb; manual = false; manualCb = null; clearTimeout(manualT); restoreDuck(); if (cb) cb(wav);
  }

  function listen() {
    var ui = V() && V().ui; if (!ui) return;
    ui.show("Te escucho…", "listen", "");
    return mic().then(function () {
      manual = true; hot = 0; quiet = 0; cap = null; ring = []; ringLen = 0; duck();
      return new Promise(function (res) {
        manualCb = res;
        manualT = setTimeout(function () { if (cap) endCap(); else finishManual(null); }, 8000);
      });
    }).then(function (wav) {
      if (!wav) { ui.show("No te escuché", "fail", ""); ui.schedule(2000); return null; }
      ui.show("Pensando…", "think", "");
      return gemini([{ inlineData: { mimeType: "audio/wav", data: wav } }, { text: "El usuario pulsó el botón del micrófono: le habla a la asistente directamente." }], false).then(function (r) { return apply(r); }, fail);
    }, function (e) {
      restoreDuck(); manual = false;
      ui.show(e && e.name === "NotAllowedError" ? "Falta el permiso del micrófono." : "No se pudo abrir el micrófono.", "fail", ""); ui.schedule(3500);
    }).then(function (x) { idleLater(); return x; });
  }

  function ask(text) {
    if (!ready()) return Promise.resolve(null);
    if (V() && V().ui) V().ui.show("Pensando…", "think", "");
    return gemini([{ text: "Frase escrita: " + text }], false).then(function (r) { return apply(r); }, fail);
  }
  function test() { return gemini([{ text: "Frase escrita: di hola" }], false).then(function () { return { ok: true }; }, function (e) { return { ok: false, error: e && e.message }; }); }

  function sync() { wake(sys().voiceWake === true); }
  window.addEventListener("radio:systemchange", sync);
  window.addEventListener("radio:keys", sync);
  if (window.speechSynthesis) { try { speechSynthesis.onvoiceschanged = function () { voice = null; }; } catch (e) {} }
  setTimeout(sync, 1800);

  window.RadioAI = {
    ready: ready, listen: listen, wake: wake, ask: ask, test: test, speak: speak,
    speaking: function () { return tts; }, wakeActive: function () { return wakeOn; },
    keys: function () { return { hasGemini: !!keys.gemini, hasMaps: !!keys.maps, model: keys.model || DEFAULT_MODEL }; },
    mapsKey: function () { return keys.maps || ""; },
    setKeys: setKeys, onState: function (f) { listeners.push(f); }
  };
})();
