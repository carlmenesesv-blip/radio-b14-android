/* ==========================================================
   CAST — recibir música y destinos desde el teléfono
   El teléfono abre phone.html (por QR) y comparte un código
   secreto con el sistema. Los mensajes viajan por un servicio
   de relevo (ntfy) porque una página web no puede hablar
   directo con el teléfono: no hay "Chromecast" real en web.

   Mensajes (JSON, v:1):
     {t:"hello"}                         el teléfono se conectó
     {t:"play", url|preview, title…}     reproducir
     {t:"ctl", c:"toggle|pause|next|prev|vol|mute", d}
     {t:"dest", lat, lon, name}          destino de navegación
   El sistema responde {from:"car", t:"ack"|"state"}.

   API: RadioCast.newCode() · link() · status() · RadioToast.show()
   Almacenamiento: "radio-cast-code"
   ========================================================== */
(function () {
  "use strict";

  var CODE_KEY = "radio-cast-code";
  var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var DEFAULT_SERVER = "https://ntfy.sh";
  var PHONE_TTL = 5 * 60 * 1000;

  var S = window.RadioSystem;
  var startedAt = Math.floor(Date.now() / 1000);
  var code = loadCode();
  var es = null, link = "", conn = "off", phoneSeen = 0, seen = {}, stateTimer = null;

  function $(id) { return document.getElementById(id); }
  function cfg(k, d) { var v = S ? S.get(k) : null; return v == null || v === "" ? d : v; }

  /* ---------- Código ---------- */
  function genCode() {
    var out = "", a = new Uint32Array(8);
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < 8; i++) out += ALPHABET[a[i] % ALPHABET.length];
    return out;
  }
  function loadCode() {
    var c = null;
    try { c = localStorage.getItem(CODE_KEY); } catch (e) {}
    if (!c || !/^[A-Z2-9]{8}$/.test(c)) {
      c = genCode();
      try { localStorage.setItem(CODE_KEY, c); } catch (e) {}
    }
    return c;
  }
  function topic() { return "rb14-" + code.toLowerCase(); }
  /* Servidor propio (server.js): si la app se abrió desde él, responde en /_info */
  var own = null;
  function server() {
    var s = String(cfg("castServer", DEFAULT_SERVER)).replace(/\/+$/, "");
    return own && s === DEFAULT_SERVER ? location.origin : s;
  }
  function isLocalHost(h) { return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || h === "0.0.0.0"; }
  /* Dirección del servidor tal como la ve el teléfono */
  function phoneOrigin() {
    if (!own) return "";
    if (isLocalHost(location.hostname) && own.lan && own.lan.length) return location.protocol + "//" + own.lan[0] + (own.port ? ":" + own.port : "");
    return location.origin;
  }
  function detectOwn() {
    if (!/^https?:$/.test(location.protocol) || !window.fetch) return;
    fetch("_info", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || j.app !== "radio-b14") return;
      own = j;
      connect();
    }).catch(function () {});
  }
  function enabled() { return S ? !!S.get("castOn") : true; }

  /* ---------- Enlace que abre el teléfono ---------- */
  function baseUrl() {
    var b = String(cfg("castBase", "")).trim();
    if (!b && own) { var po = phoneOrigin(); if (po) return po + "/"; }
    if (b) {
      if (!/^[a-z]+:\/\//i.test(b)) b = "https://" + b;
      b = b.replace(/[?#].*$/, "").replace(/phone\.html?$/i, "");
      return /\/$/.test(b) ? b : b + "/";
    }
    return location.href.replace(/[?#].*$/, "").replace(/[^\/]*$/, "");
  }
  function buildLink() {
    var u = baseUrl() + "phone.html?c=" + code;
    var s = own && !String(cfg("castBase", "")).trim() ? phoneOrigin() : server();
    if (s !== DEFAULT_SERVER) u += "&s=" + encodeURIComponent(s);
    return u;
  }
  function linkWarning() {
    var b = baseUrl();
    var host = "";
    try { host = new URL(b).hostname; } catch (e) { return "La dirección de la app no es válida."; }
    if (own && !isLocalHost(host)) return "";
    if (own && isLocalHost(host)) return "El servidor no encontró una dirección de red. Conecta este equipo al Wi-Fi o escribe su dirección en Ajustes → Teléfono → Dirección pública.";
    if (!/^https?:/i.test(b)) return "Esta app está abierta como archivo: el teléfono no podrá abrirla. Publícala en una dirección web y escríbela en Ajustes → Teléfono.";
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "0.0.0.0") return "La app está abierta como «localhost»: el teléfono no puede abrir esa dirección. Publícala en una dirección https y escríbela en Ajustes → Teléfono → Dirección pública.";
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return "Dirección de red local: el teléfono debe estar en la misma red Wi-Fi. Para instalarla en el teléfono hace falta https.";
    if (/^http:/i.test(b)) return "Sin https el teléfono no podrá instalar la app ni usar «Compartir». El enlace sí abre.";
    return "";
  }

  /* ---------- Avisos en pantalla ---------- */
  var toastBox = null;
  function toast(o) {
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "toasts";
      toastBox.setAttribute("aria-live", "polite");
      toastBox.setAttribute("role", "status");
      document.body.appendChild(toastBox);
    }
    var t = document.createElement("div");
    t.className = "toast" + (o.kind ? " toast--" + o.kind : "");
    var txt = document.createElement("div");
    txt.className = "toast__txt";
    var strong = document.createElement("strong"); strong.textContent = o.title || "";
    txt.appendChild(strong);
    if (o.text) { var sp = document.createElement("span"); sp.textContent = o.text; txt.appendChild(sp); }
    t.appendChild(txt);
    var timer;
    function close() { clearTimeout(timer); t.classList.remove("is-in"); setTimeout(function () { t.remove(); }, 200); }
    (o.actions || []).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "toast__btn"; b.textContent = a.label;
      b.addEventListener("click", function () { close(); if (a.fn) a.fn(); });
      t.appendChild(b);
    });
    toastBox.appendChild(t);
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
    requestAnimationFrame(function () { t.classList.add("is-in"); });
    timer = setTimeout(close, o.ms || ((o.actions && o.actions.length) ? 12000 : 5000));
    return close;
  }
  window.RadioToast = { show: toast };

  /* ---------- Relevo ---------- */
  function publish(msg) {
    if (!enabled()) return;
    msg.from = "car"; msg.v = 1;
    try {
      fetch(server() + "/" + topic(), { method: "POST", body: JSON.stringify(msg) }).catch(function () {});
    } catch (e) {}
  }

  function connect() {
    disconnect();
    link = buildLink();
    if (!enabled()) { setConn("off"); return; }
    if (!window.EventSource) { setConn("error"); return; }
    setConn("connecting");
    try {
      es = new EventSource(server() + "/" + topic() + "/sse");
    } catch (e) { setConn("error"); return; }
    es.onopen = function () { setConn("ready"); };
    es.onerror = function () { setConn(es && es.readyState === 2 ? "error" : "connecting"); };
    es.onmessage = onMessage;
  }
  function disconnect() {
    if (es) { es.onopen = es.onerror = es.onmessage = null; es.close(); es = null; }
  }

  function setConn(c) { conn = c; render(); }
  function phoneOn() { return conn !== "off" && Date.now() - phoneSeen < PHONE_TTL; }

  function onMessage(ev) {
    var d, m;
    try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (!d || d.event !== "message") return;
    if (d.id) { if (seen[d.id]) return; seen[d.id] = 1; }
    if (d.time && d.time < startedAt - 20) return;
    try { m = JSON.parse(d.message); } catch (e) { return; }
    if (!m || m.v !== 1 || m.from === "car" || typeof m.t !== "string") return;
    handle(m);
  }

  /* ---------- Acciones recibidas ---------- */
  function ack(m, ok, error) { publish({ t: "ack", id: m.id || "", ok: !!ok, error: error || "" }); }

  function handle(m) {
    var wasOn = phoneOn();
    phoneSeen = Date.now();
    if (m.t === "hello") {
      if (!wasOn) toast({ title: "Teléfono conectado", text: m.name || "Ya puedes enviar música y destinos." });
      render(); lastState = ""; sendState(true); return;
    }
    if (m.t === "play") return onPlay(m);
    if (m.t === "ctl") return onCtl(m);
    if (m.t === "dest") return onDest(m);
    render();
  }

  function onPlay(m) {
    var M = window.RadioMusic;
    if (!M) return ack(m, false, "Música no disponible");
    var label = [m.title, m.artist].filter(Boolean).join(" · ") || "Enlace del teléfono";
    if (m.media) {
      /* Canción subida desde el teléfono al servidor propio */
      if (!/^\/_media\/rb14-[a-z2-9]{8}\/[a-f0-9]{10}\.[a-z0-9]{2,5}$/.test(String(m.media))) return ack(m, false, "Archivo no válido");
      m = Object.assign({}, m, { url: server() + m.media, preview: "", artist: m.artist || "Desde el teléfono" });
    }
    function go() {
      var r = M.cast(m);
      ack(m, r.ok, r.error);
      if (!r.ok) toast({ kind: "bad", title: "No se pudo reproducir", text: r.error });
      else toast({ title: "Desde el teléfono", text: label });
    }
    if (S && S.get("castAsk")) {
      toast({ title: "El teléfono quiere reproducir", text: label, actions: [{ label: "Reproducir", fn: go }, { label: "Ignorar", fn: function () { ack(m, false, "Ignorado en el auto"); } }] });
    } else go();
  }

  function onCtl(m) {
    var M = window.RadioMusic, Q = window.RadioQuick;
    if (S && !S.get("castRemote")) return ack(m, false, "Control remoto desactivado");
    var c = m.c, v = Number(m.d);
    if (c === "toggle" && M) M.toggle();
    else if (c === "pause" && M) M.pause();
    else if (c === "next" && M) M.next();
    else if (c === "prev" && M) M.prev();
    else if (c === "vol" && Q && isFinite(v)) {
      var max = S ? S.get("maxVolume") : 100;
      Q.set({ volume: Math.max(0, Math.min(max, Math.round(Q.get().volume + v))), mute: false });
    } else if (c === "mute" && Q) Q.set({ mute: !Q.get().mute });
    else return ack(m, false, "Orden no válida");
    ack(m, true);
    sendState();
  }

  function onDest(m) {
    var lat = Number(m.lat), lon = Number(m.lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return ack(m, false, "Coordenadas no válidas");
    var name = String(m.name || "Destino del teléfono").slice(0, 120);
    toast({
      title: "Destino del teléfono", text: name,
      actions: [{ label: "Ver ruta", fn: function () {
        if (window.RadioNav) window.RadioNav.show("map");
        if (window.RadioMap) window.RadioMap.setDestination({ lat: lat, lon: lon, name: name });
      } }, { label: "Ignorar" }]
    });
    ack(m, true);
  }

  /* ---------- Estado hacia el teléfono ---------- */
  var lastState = "";
  function sendState(force) {
    if (stateTimer) return;               // limita la frecuencia: un envío cada 400 ms como máximo
    stateTimer = setTimeout(function () {
      stateTimer = null;
      if (!phoneOn()) return;
      var g = window.RadioMusic ? window.RadioMusic.get() : null, q = window.RadioQuick ? window.RadioQuick.get() : null;
      var msg = {
        t: "state",
        playing: !!(g && g.playing), title: g && g.item ? g.item.title || "" : "", artist: g && g.item ? g.item.artist || "" : "",
        vol: q ? q.volume : null, mute: q ? !!q.mute : false
      };
      var key = JSON.stringify(msg);
      if (key === lastState && force !== true) return;   // sin cambios: no se envía
      lastState = key;
      publish(msg);
    }, 400);
  }
  window.addEventListener("radio:musicchange", sendState);
  window.addEventListener("radio:quickchange", sendState);

  /* ---------- Interfaz de emparejamiento ---------- */
  var STATUS = {
    off: ["off", "Desactivado en Ajustes → Teléfono."],
    connecting: ["wait", "Conectando con el servicio de enlace…"],
    ready: ["ok", "Listo. Esperando a que escanees el código."],
    phone: ["ok", "Teléfono conectado. Ya puedes enviar música."],
    error: ["bad", "Sin conexión con el servicio de enlace. Reintentando…"]
  };

  function render() {
    var qr = $("cast-qr"), codeEl = $("cast-code"), st = $("cast-status"), warn = $("cast-warn"), sysCode = $("sys-code");
    var key = conn === "ready" && phoneOn() ? "phone" : conn;
    var s = STATUS[key] || STATUS.error;
    if (codeEl) codeEl.textContent = code.slice(0, 4) + " " + code.slice(4);
    if (sysCode) sysCode.textContent = code.slice(0, 4) + " " + code.slice(4);
    if (st) { st.textContent = s[1]; st.dataset.state = s[0]; }
    if (qr && qr.dataset.link !== link) {
      qr.dataset.link = link;
      try { qr.innerHTML = window.QR.svg(link, { margin: 2, label: "Código QR para conectar el teléfono" }); }
      catch (e) { qr.textContent = "No se pudo generar el QR."; }
    }
    if (warn) { var w = linkWarning(); warn.textContent = w; warn.hidden = !w; var hp = $("cast-help"); if (hp) hp.hidden = !w; }
    document.documentElement.setAttribute("data-phone", phoneOn() ? "on" : "off");
    window.dispatchEvent(new CustomEvent("radio:castchange", { detail: { status: key, code: code, phone: phoneOn() } }));
  }

  function newCode() {
    code = genCode();
    try { localStorage.setItem(CODE_KEY, code); } catch (e) {}
    phoneSeen = 0;
    connect();
    toast({ title: "Código nuevo", text: "Los teléfonos anteriores quedaron desconectados." });
  }

  function init() {
    var copy = $("cast-copy"), nw = $("cast-new");
    if (nw) nw.addEventListener("click", newCode);
    if (copy) copy.addEventListener("click", function () {
      var done = function () { copy.textContent = "Enlace copiado"; setTimeout(function () { copy.textContent = "Copiar enlace"; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () {});
    });
    connect();
  }

  window.addEventListener("radio:systemchange", function (e) {
    var ch = (e.detail && e.detail.changed) || [];
    if (ch.indexOf("castOn") >= 0 || ch.indexOf("castServer") >= 0) connect();
    else if (ch.indexOf("castBase") >= 0) { link = buildLink(); render(); }
  });
  setInterval(render, 30000);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(); detectOwn(); });
  else { init(); detectOwn(); }

  window.RadioCast = {
    newCode: newCode,
    link: function () { return link; },
    code: function () { return code; },
    status: function () { return { conn: conn, phone: phoneOn(), code: code, server: server(), own: !!own }; },
    reconnect: connect
  };
})();
