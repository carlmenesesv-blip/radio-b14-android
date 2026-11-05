/* ==========================================================
   TABLERO — datos del Home «Tablero». Todo viene de los módulos reales:
   velocidad (RadioSystem/ESP), puertas y luces (RadioCar), clima (RadioClimate),
   volumen (RadioVolume), música (RadioMedia) y destino (RadioMap). Sin dato → «—».
   Además: al elegir el estilo visual «Tablero» el inicio cambia a este diseño.
   Sección: HOME
   ========================================================== */
(function () {
  "use strict";
  var root = document.getElementById("home-tab"); if (!root) return;
  function $(id) { return document.getElementById(id); }
  function W(n) { return window[n]; }
  function sys() { return (W("RadioSystem") && W("RadioSystem").get && W("RadioSystem").get()) || {}; }
  function arc(el, f) { if (el) el.setAttribute("stroke-dasharray", (Math.max(0, Math.min(1, f)) * (el.id === "tg-arc" ? 100 : 75)).toFixed(1) + " 100"); }
  function setIcon(svg, id) { var u = svg && svg.querySelector("use"); if (u) u.setAttribute("href", "#" + id); }

  /* ---------- velocidad ---------- */
  var seen = false, MAXK = 180;
  function speed() {
    var v = $("tg-v"), u = $("tg-u"), S = W("RadioSystem"), mi = sys().distance === "mi";
    if (!seen || !S) { v.textContent = "—"; arc($("tg-arc"), 0); if (u) u.textContent = mi ? "mph" : "km/h"; return; }
    var k = S.speed(); v.textContent = S.speedValue ? S.speedValue(k) : Math.round(k);
    if (u) u.textContent = mi ? "mph" : "km/h";
    arc($("tg-arc"), k / MAXK);
  }
  window.addEventListener("radio:speed", function () { seen = true; speed(); });
  setInterval(speed, 2000);

  /* ---------- coche ---------- */
  function car() {
    var C = W("RadioCar"); if (!C) return;
    var g = C.get(), L = g.lights || {}, D = g.doors || {};
    var el = $("tab-car");
    el.dataset.head = L.head ? "1" : "0"; el.dataset.brake = L.brake ? "1" : "0"; el.dataset.rev = L.reverse ? "1" : "0";
    el.dataset.tl = (L.turnL || L.hazard) ? "1" : "0"; el.dataset.tr = (L.turnR || L.hazard) ? "1" : "0";
    var open = Object.keys(D).filter(function (k) { return D[k]; });
    var st = $("tab-status"), t = $("ts-t");
    st.dataset.warn = open.length ? "1" : "0";
    t.textContent = open.length ? (open.length === 1 ? "1 abierto" : open.length + " abiertos") : (g.locked ? "Bloqueado · todo cerrado" : "Desbloqueado · todo cerrado");
    setPress("tt-lock", g.locked); setPress("tt-light", !!L.head);
  }
  function setPress(id, on) { var b = $(id); if (b) b.setAttribute("aria-pressed", String(!!on)); }

  /* ---------- clima ---------- */
  function deg(c) {
    if (c == null || !isFinite(c)) return "—";
    var f = sys().tempUnit === "f"; return Math.round(f ? c * 9 / 5 + 32 : c) + "°";
  }
  function clim() {
    var K = W("RadioClimate"); if (!K) return;
    var s = K.get(), on = !!s.power;
    setPress("tt-clim", on);
    $("dc-v").textContent = on ? deg(s.target) : "Apagado";
    $("dc-v").style.fontSize = on ? "" : "1.1rem";
    $("dc-l").textContent = on ? (s.auto ? "Auto" : "Fan " + s.fan) : "Clima";
    arc($("dc-arc"), on ? (s.target - 16) / 14 : 0);
    $("dc-cab").textContent = deg(s.cabin); $("dc-out").textContent = deg(s.outside);
  }
  function climStep(d) {
    var K = W("RadioClimate"); if (!K) return;
    var s = K.get(), n = Math.max(16, Math.min(30, s.target + d * 0.5));
    K.set({ power: true, driver: n, pass: n });
  }

  /* ---------- volumen ---------- */
  function vol() {
    var V = W("RadioVolume"); if (!V) return;
    var m = V.get().master, Q = W("RadioQuick"), mute = Q && Q.get && Q.get().mute;
    $("dv-v").textContent = mute ? "Mute" : Math.round(m) + "%"; arc($("dv-arc"), mute ? 0 : m / 100);
  }
  function volStep(d) { var V = W("RadioVolume"); if (!V) return; var Q = W("RadioQuick"); if (Q && Q.get && Q.get().mute) Q.set({ mute: false }); V.set(Math.max(0, Math.min(100, V.get().master + d * 5))); vol(); }

  /* ---------- música ---------- */
  function media() {
    var M = W("RadioMedia"); if (!M) return;
    var n = M.get(), on = n.state === "playing";
    $("tm-src").textContent = n.source === "bt" ? "Bluetooth" : n.source === "radio" ? "Radio" : "Música";
    $("tm-t").textContent = n.title || "Sin reproducir"; $("tm-s").textContent = n.sub || "";
    setIcon($("tm-play-i"), on ? "i-pause" : "i-play"); setIcon($("tt-play-i"), on ? "i-pause" : "i-play");
    $("tm-play").setAttribute("aria-label", on ? "Pausar" : "Reproducir"); setPress("tt-play", on);
  }

  /* ---------- navegación ---------- */
  function nav() {
    var R = W("RadioMap"); if (!R) return;
    var g = R.get(), d = g.dest, b = root.querySelector(".tab__nav");
    $("tn-t").textContent = d ? d.name : "Sin destino";
    $("tn-s").textContent = d ? (g.navigating ? "Navegando" : (d.sub || "Destino elegido")) : "Toca para elegir uno";
    b.dataset.on = d ? "1" : "0";
  }

  /* ---------- eventos ---------- */
  function on(id, fn) { var e = $(id); if (e) e.addEventListener("click", fn); }
  on("tt-lock", function () { var C = W("RadioCar"); if (C) C.update({ locked: !C.get().locked }); });
  on("tt-light", function () { var C = W("RadioCar"); if (C) C.update({ lights: { head: !C.get().lights.head } }); });
  on("tt-clim", function () { var K = W("RadioClimate"); if (K) K.set({ power: !K.get().power }); });
  on("tt-play", function () { var M = W("RadioMedia"); if (M) M.toggle(); });
  on("tm-play", function () { var M = W("RadioMedia"); if (M) M.toggle(); });
  on("tm-prev", function () { var M = W("RadioMedia"); if (M) M.prev(); });
  on("tm-next", function () { var M = W("RadioMedia"); if (M) M.next(); });
  on("dc-dn", function () { climStep(-1); }); on("dc-up", function () { climStep(1); });
  on("dv-dn", function () { volStep(-1); }); on("dv-up", function () { volStep(1); });
  root.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-go]");
    if (b && W("RadioNav")) W("RadioNav").show(b.getAttribute("data-go"));
  });
  window.addEventListener("radio:carchange", car);
  window.addEventListener("radio:climatechange", clim);
  window.addEventListener("radio:mediachange", media);
  window.addEventListener("radio:systemchange", function () { clim(); speed(); });
  window.addEventListener("radio:quickchange", vol);
  setInterval(function () { nav(); vol(); clim(); }, 1000);
  function all() { car(); clim(); vol(); media(); nav(); speed(); }
  setTimeout(all, 300); setTimeout(all, 1500);

  /* ---------- el estilo visual «Tablero» trae su inicio ---------- */
  var lastVS = null;
  function follow() {
    var vs = sys().visualStyle, S = W("RadioSystem"); if (!S) return;
    if (lastVS !== null && vs !== lastVS) {
      if (vs === "tablero" && sys().homeLayout !== "tablero") S.set({ homeLayout: "tablero" });
      else if (lastVS === "tablero" && vs !== "tablero" && sys().homeLayout === "tablero") S.set({ homeLayout: "calma" });
    }
    lastVS = vs;
  }
  window.addEventListener("radio:systemchange", follow);
  setTimeout(function () { lastVS = sys().visualStyle; }, 0);
  window.RadioTablero = { refresh: all };
})();
