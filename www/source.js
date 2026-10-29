/* ==========================================================
   SOURCE — qué está sonando y una sola fuente de audio a la vez
   Junta la radio, el Bluetooth y las apps web (cuando suenan) en un indicador de la barra
   y, si «Una sola fuente de audio» está activo, pausa lo anterior al empezar otra.
   API: RadioSource {get(), toggle(), go()}   Evento: radio:sourcechange {source,title,playing}
   Sección: SONIDO
   ========================================================== */
(function () {
  "use strict";
  var root = document.documentElement;
  var chip = document.getElementById("now"), ico = chip && chip.querySelector("use"), ttl = chip && chip.querySelector(".sbar__nt");
  var app = { id: null, title: "", audible: false };
  var cur = { source: "none", title: "", playing: false }, prevRadio = false, prevBt = false, prevApp = false;

  function sys() { return (window.RadioSystem && window.RadioSystem.get && window.RadioSystem.get()) || {}; }
  function media() { return (window.RadioMedia && window.RadioMedia.get && window.RadioMedia.get()) || { source: "none", state: "idle" }; }
  function compute() {
    if (app.audible) return { source: "app", title: app.title || "Aplicación", playing: true };
    var m = media();
    if (m.state === "playing" && (m.source === "radio" || m.source === "bt")) return { source: m.source, title: m.title || (m.source === "bt" ? "Bluetooth" : "Radio"), playing: true };
    return { source: "none", title: "", playing: false };
  }
  var ICON = { radio: "#i-radio", bt: "#i-bluetooth", app: "#i-music" };
  var VIEW = { radio: "radio", bt: "media", app: "apps" };

  function exclusive(m) {
    if (sys().exclusiveAudio === false) return;
    var radioNow = m.state === "playing" && m.source === "radio", btNow = m.state === "playing" && m.source === "bt";
    // Lo que acaba de empezar manda; el resto se pausa
    if (radioNow && !prevRadio || btNow && !prevBt) {
      if (app.audible && window.RadioHost && window.RadioHost.embedPause) { try { window.RadioHost.embedPause(); } catch (e) {} }
    }
    prevRadio = radioNow; prevBt = btNow;
  }
  function onApp() {
    if (app.audible && !prevApp && sys().exclusiveAudio !== false) {
      var m = media();
      if (m.state === "playing") {
        if (m.source === "radio" && window.RadioTuner) window.RadioTuner.setPower(false);
        else if (m.source === "bt" && window.RadioBluetooth) window.RadioBluetooth.set(false);
      }
    }
    prevApp = app.audible;
  }

  function render() {
    var n = compute(), changed = n.source !== cur.source || n.title !== cur.title || n.playing !== cur.playing;
    cur = n;
    var view = root.getAttribute("data-view");
    var show = n.playing && view !== "home" && view !== "radio" && view !== "media" && !(view === "apps" && n.source === "app");
    if (chip) {
      chip.hidden = !show;
      if (show) { if (ico) ico.setAttribute("href", ICON[n.source] || "#i-music"); if (ttl) ttl.textContent = n.title; chip.setAttribute("aria-label", "Suena: " + n.title + ". Toca para abrir"); }
    }
    root.setAttribute("data-source", n.source);
    if (changed) window.dispatchEvent(new CustomEvent("radio:sourcechange", { detail: Object.assign({}, n) }));
  }

  window.addEventListener("radio:mediachange", function () { exclusive(media()); render(); });
  window.addEventListener("radio:embed", function (e) {
    var d = e.detail || {};
    if (!d.audio) return;
    app.id = d.id; app.audible = !!d.audible; if (d.title) app.title = d.title;
    onApp(); render();
  });
  new MutationObserver(render).observe(root, { attributes: true, attributeFilter: ["data-view"] });
  if (chip) chip.addEventListener("click", function () { go(); });

  function go() { if (cur.source !== "none" && window.RadioNav) window.RadioNav.show(VIEW[cur.source]); }
  function toggle() {
    if (cur.source === "app" && window.RadioHost && window.RadioHost.embedToggle) { window.RadioHost.embedToggle(); return true; }
    return false;
  }
  window.RadioSource = { get: function () { return Object.assign({}, cur); }, toggle: toggle, go: go };
  render();
})();
