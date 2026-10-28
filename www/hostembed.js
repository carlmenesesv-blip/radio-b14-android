/* ==========================================================
   HOSTEMBED — apps web dentro del radio (solo en la app de Windows)
   La app de Windows coloca una vista nativa justo encima del hueco #ap-iframe.
   Esa vista queda por encima de la página, así que cuando se abre un aviso,
   el volumen, la climatización o el teclado, se congela en una captura.
   API: RadioEmbed {available, open(id,url), show(on), reload(), go(url), close(), url()}
   Sección: APPS
   ========================================================== */
(function () {
  "use strict";
  var H = window.RadioHost;
  if (!H || typeof H.embedOpen !== "function") { window.RadioEmbed = { available: false }; return; }

  var holder = null, openId = null, wanted = false, frozen = false, snap = null, lastRect = "", curUrl = "", timer = null, ro = null;

  function el() { return holder || (holder = document.getElementById("ap-iframe")); }
  function rect() {
    var e = el(); if (!e) return null;
    var b = e.parentNode.getBoundingClientRect();
    return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) };
  }
  function overlayOpen() {
    return !!document.querySelector("#vpop.is-open, #cpop.is-open, .toasts .toast, #osk:not([hidden]), .ap__menu:not([hidden]), .ap__add:not([hidden])");
  }
  function paintSnap(src) {
    var p = el() && el().parentNode; if (!p) return;
    p.style.backgroundImage = src ? "url(" + src + ")" : "";
    p.style.backgroundSize = "100% 100%";
  }
  function sync() {
    if (!openId) return;
    var r = rect(), key = r ? [r.x, r.y, r.width, r.height].join() : "";
    var fr = document.getElementById("ap-frame");
    var want = wanted && r && r.width > 20 && r.height > 20 && document.documentElement.getAttribute("data-view") === "apps" && fr && !fr.hidden;
    var over = want && overlayOpen();
    if (!want) { if (!frozen) { H.embedHide(); } frozen = false; paintSnap(null); lastRect = ""; return; }
    if (over && !frozen) {
      frozen = true;
      Promise.resolve(H.embedFreeze()).then(function (s) { if (frozen) paintSnap(s); }, function () {});
      return;
    }
    if (!over && frozen) { frozen = false; paintSnap(null); lastRect = ""; }
    if (!over && key !== lastRect) { lastRect = key; H.embedShow(r); }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(sync, 30); }

  new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
  window.addEventListener("resize", schedule);
  if (window.ResizeObserver) { ro = new ResizeObserver(schedule); setTimeout(function () { if (el()) ro.observe(el().parentNode); }, 0); }
  setInterval(sync, 700);   // red de seguridad

  window.__b14Embed = function (s) {
    if (!s) return;
    curUrl = s.url || curUrl;
    window.dispatchEvent(new CustomEvent("radio:embed", { detail: s }));
  };

  window.RadioEmbed = {
    available: true,
    open: function (id, url) { openId = id; wanted = true; curUrl = url || ""; lastRect = ""; var r0 = rect(); H.embedOpen(id, url, r0 && r0.width > 20 ? r0 : null); schedule(); },
    show: function (on) { wanted = !!on; if (on && openId) lastRect = ""; schedule(); },
    reload: function () { if (openId) H.embedCmd("reload"); },
    back: function () { if (openId) H.embedCmd("back"); },
    go: function (url) { if (openId) { curUrl = url; H.embedNav(url); } },
    close: function () { if (!openId) return; var id = openId; openId = null; wanted = false; frozen = false; paintSnap(null); H.embedClose(id); },
    url: function () { return curUrl; },
    id: function () { return openId; }
  };
})();
