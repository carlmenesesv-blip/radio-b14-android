/* AURA — paquetes de íconos por estilo visual.
   Cada estilo usa su propio paquete real (ver LICENCIAS-ICONOS.md):
   win11 → Fluent · oneui → Material Symbols Rounded · macos → Lucide
   sport → Phosphor Bold · retro → Pixelarticons · aura → set original.
   Reemplaza el contenido de los <symbol id="i-*"> del sprite, así todo el
   sistema (HTML y JS que usan <use href="#i-…">) cambia sin tocar nada más. */
(function () {
  "use strict";
  var root = document.documentElement;
  var sprite = null, orig = null, current = "aura";
  var FILLED = { win11: 1, oneui: 1, sport: 1, retro: 1 }; // paquetes de relleno (los demás son de trazo)

  function symbols() {
    sprite = sprite || document.querySelector("svg[aria-hidden] > symbol[id^='i-']");
    return sprite ? sprite.parentNode : null;
  }
  function snapshot(host) {
    if (orig) return;
    orig = {};
    var list = host.querySelectorAll("symbol[id^='i-']");
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      orig[s.id] = { vb: s.getAttribute("viewBox"), html: s.innerHTML };
    }
  }
  function wrap(pack, inner) {
    return FILLED[pack] ? '<g fill="currentColor" stroke="none">' + inner + "</g>" : inner;
  }
  function clearOn(host) {
    var on = host.querySelectorAll("symbol[data-on]");
    for (var i = 0; i < on.length; i++) on[i].parentNode.removeChild(on[i]);
  }
  function apply(pack) {
    var host = symbols(); if (!host) return;
    snapshot(host); clearOn(host);
    var data = (window.RadioIconPacks || {})[pack];
    var NS = "http://www.w3.org/2000/svg";
    Object.keys(orig).forEach(function (id) {
      var el = host.querySelector("#" + id); if (!el) return;
      var key = id.slice(2), e = data && data[key];
      if (id === "i-logo") return;
      if (!e) { el.setAttribute("viewBox", orig[id].vb || "0 0 24 24"); el.innerHTML = orig[id].html; return; }
      el.setAttribute("viewBox", e[0]);
      el.innerHTML = wrap(pack, e[1]);
      if (e[2]) {
        var on = document.createElementNS(NS, "symbol");
        on.id = id + "--on"; on.setAttribute("viewBox", e[0]); on.setAttribute("data-on", "1");
        on.innerHTML = wrap(pack, e[2]);
        host.appendChild(on);
      }
    });
    current = pack;
    root.setAttribute("data-iconpack", data ? pack : "aura");
    syncDock();
  }
  /* Dock: el botón activo usa la variante rellena del paquete (si existe) */
  function syncDock() {
    var btns = document.querySelectorAll(".dock__btn use");
    for (var i = 0; i < btns.length; i++) {
      var u = btns[i], b = u.closest(".dock__btn");
      var base = (u.getAttribute("href") || "").replace("--on", "");
      var active = b && b.getAttribute("aria-current") === "page";
      var onId = base + "--on";
      u.setAttribute("href", active && document.getElementById(onId.slice(1)) ? onId : base);
    }
  }
  function sync() {
    var vs = root.getAttribute("data-vs") || "aura";
    if (vs !== current) apply(vs); else syncDock();
  }
  function init() {
    sync();
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-vs"] });
    var nav = document.querySelector(".dock__nav");
    if (nav) new MutationObserver(syncDock).observe(nav, { attributes: true, subtree: true, attributeFilter: ["aria-current"] });
  }
  window.RadioIcons = { apply: apply, current: function () { return current; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
