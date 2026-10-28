/* ==========================================================
   MEDIA — qué está sonando (radio o Bluetooth) para Inicio y el mapa
   Fuentes: RadioTuner (emisoras) y RadioBluetooth (receptor externo).
   API: RadioMedia.get() → {source, state, title, sub}
        RadioMedia.toggle() / next() / prev()
   Evento: radio:mediachange {source, state, title, sub}
   state: "idle" (nada), "paused" (emisora elegida en pausa), "playing"
   ========================================================== */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var home = $("home"), card = $("hm"), title = $("hm-title"), sub = $("hm-artist"), src = $("hm-src");
  var play = $("hm-play"), ico = $("hm-play-ico"), prev = $("hm-prev"), next = $("hm-next");

  var hud = $("hud-media"), hTitle = $("hud-title"), hSub = $("hud-sub"), hPlay = $("hud-play"), hIco = $("hud-play-ico");
  var cur = { source: "none", state: "idle", title: "Sin música", sub: "Toca para escuchar la radio" };

  function compute() {
    var bt = window.RadioBluetooth && window.RadioBluetooth.get();
    var t = window.RadioTuner && window.RadioTuner.get();
    if (bt) return { source: "bt", state: "playing", title: "Bluetooth", sub: "Música del celular" };
    if (t && t.power) return { source: "radio", state: "playing", title: t.name || "Radio", sub: t.status === "connecting" ? "Conectando…" : "Radio en vivo" };
    if (t && t.name) return { source: "radio", state: "paused", title: t.name, sub: "En pausa" };
    return { source: "none", state: "idle", title: "Sin música", sub: "Toca para escuchar la radio" };
  }

  // Lo que suena se envía tal cual a la pantalla del cluster (sin conexión ni código)
  var pubd = false;
  function pubMedia(n) {
    pubd = true;
    if (window.RadioLink) window.RadioLink.send({ k: "media", title: n.source === "none" ? "" : n.title, artist: n.sub, playing: n.state === "playing" });
  }
  function render() {
    var n = compute();
    var changed = n.source !== cur.source || n.state !== cur.state || n.title !== cur.title || n.sub !== cur.sub;
    cur = n;
    if (card) {
      card.dataset.state = n.state;
      card.dataset.ctl = n.source === "bt" ? "none" : "radio";
      title.textContent = n.title; sub.textContent = n.sub;
      src.textContent = n.source === "bt" ? "Bluetooth" : n.source === "radio" ? "Radio" : "Música";
      var on = n.state === "playing";
      play.setAttribute("aria-label", on ? "Pausar" : "Reproducir");
      ico.querySelector("use").setAttribute("href", on ? "#i-pause" : "#i-play");
    }
    if (hud) {                       // flotante del mapa
      hud.dataset.state = n.state;
      hTitle.textContent = n.title; hSub.textContent = n.source === "bt" ? "Bluetooth" : n.source === "radio" ? "Radio" : "Toca para escuchar";
      var hon = n.state === "playing";
      hPlay.setAttribute("aria-label", hon ? "Pausar" : "Reproducir");
      hIco.querySelector("use").setAttribute("href", hon ? "#i-pause" : "#i-play");
    }
    if (home) home.dataset.media = n.state === "playing" ? "playing" : "idle";
    if (changed || !pubd) pubMedia(n);
    if (changed) window.dispatchEvent(new CustomEvent("radio:mediachange", { detail: Object.assign({}, n) }));
  }

  function toggle() {
    var T = window.RadioTuner;
    if (cur.source === "bt") { if (window.RadioBluetooth) window.RadioBluetooth.set(false); return; }
    if (!T) return;
    if (cur.state === "playing") T.setPower(false);
    else if (cur.state === "paused") T.setPower(true);
    else if (window.RadioNav) window.RadioNav.show("radio");     // nada elegido aún: se va a elegir emisora
  }
  if (play) play.addEventListener("click", toggle);
  if (hPlay) hPlay.addEventListener("click", toggle);
  var hQs = $("hud-qs");
  if (hQs) hQs.addEventListener("click", function () { if (window.RadioQuick) window.RadioQuick.open(); });
  if (next) next.addEventListener("click", function () { if (window.RadioTuner) window.RadioTuner.next(); });
  if (prev) prev.addEventListener("click", function () { if (window.RadioTuner) window.RadioTuner.prev(); });
  // Tocar el texto abre la sección de la fuente actual
  var top = card && card.querySelector(".media__top");
  if (top) top.addEventListener("click", function () { if (window.RadioNav) window.RadioNav.show(cur.source === "bt" ? "media" : "radio"); });

  ["radio:tunerchange", "radio:btchange"].forEach(function (ev) { window.addEventListener(ev, render); });
  setInterval(render, 1500);       // el estado de conexión de la emisora cambia sin evento propio
  window.RadioMedia = { get: function () { return Object.assign({}, cur); }, toggle: toggle, ctl: function (c) { if (c === "toggle") toggle(); else if (c === "next") this.next(); else if (c === "prev") this.prev(); }, next: function () { if (next) next.click(); }, prev: function () { if (prev) prev.click(); } };
  render();
})();
