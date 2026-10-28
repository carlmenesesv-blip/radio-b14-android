/* ==========================================================
   APPS — cajón de aplicaciones (launcher)
   · En la app Android muestra TODAS las apps instaladas con su icono
     (puente AndroidBridge); en un navegador, accesos web predeterminados.
   · Búsqueda, favoritas fijadas arriba, pulsación larga = menú
     (abrir, fijar, información, desinstalar).
   · Navegador y accesos web propios se abren dentro del radio con la barra
     «Sistema» para volver; el resto abre la app oficial instalada.
   Sección: APPS
   API: RadioApps.open(id|url) · close() · refresh() · list() · icon(app, size)
   Evento: radio:applaunch {id,name,kind,pkg} cada vez que se abre una app
   ========================================================== */
(function () {
  "use strict";
  var KEY = "radio-apps";
  var $ = function (id) { return document.getElementById(id); };
  var grid = $("ap-grid"), launcher = $("ap-launcher"), frame = $("ap-frame"), ifr = $("ap-iframe");
  if (!grid || !frame) return;
  var addrForm = $("ap-addr"), addrIn = $("ap-addr-in"), note = $("ap-note");
  var q = $("ap-q"), qClear = $("ap-q-clear"), favs = $("ap-favs"), favsRow = $("ap-favs-row"), count = $("ap-count"),
      scroller = $("ap-scroll"), webBox = $("ap-web"), menu = $("ap-menu"), addForm = $("ap-add");

  var AB = window.AndroidBridge || null;       // lo inyecta la app Android (launcher); null en navegador
  var UA = navigator.userAgent || "";
  var IOS = /iPhone|iPad|iPod/i.test(UA), ANDROID = /Android/i.test(UA);
  function pref(k) { var s = window.RadioSystem && window.RadioSystem.get && window.RadioSystem.get(); return !s || s[k] !== false; }
  var EMB = window.RadioEmbed && window.RadioEmbed.available ? window.RadioEmbed : null;   // app de Windows: apps web dentro del radio
  function has(fn) { return !!AB && typeof AB[fn] !== "undefined"; }

  // Accesos web predeterminados (solo cuando no hay puente Android). mode "ext": se abre fuera del radio
  var DEFAULTS = [
    { id: "youtube", name: "YouTube", url: "https://www.youtube.com/", mode: "ext", pwa: true, pkg: "com.google.android.youtube" },
    { id: "ytmusic", name: "YouTube Music", url: "https://music.youtube.com/", mode: "ext", pwa: true, pkg: "com.google.android.apps.youtube.music" },
    { id: "spotify", name: "Spotify", url: "https://open.spotify.com/", mode: "ext", scheme: "spotify:", pwa: true, pkg: "com.spotify.music" },
    { id: "waze", name: "Waze", url: "https://www.waze.com/live-map", mode: "ext", scheme: "waze://", pkg: "com.waze" },
    { id: "gmaps", name: "Google Maps", url: "https://www.google.com/maps", mode: "ext", scheme: IOS ? "comgooglemaps://" : (ANDROID ? "geo:0,0" : ""), pkg: "com.google.android.apps.maps" }
  ];
  var BROWSER = { id: "browser", name: "Navegador", url: "", mode: "in", kind: "builtin" };
  // Apps que se fijan solas la primera vez si están instaladas
  var AUTO_PINS = ["com.spotify.music", "com.google.android.apps.youtube.music", "com.google.android.youtube", "com.waze", "com.google.android.apps.maps", "com.android.chrome"];

  var data = load();
  var cur = null;          // app abierta en el visor (queda en espera al salir)
  var cache = [];          // elementos actuales del cajón

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        custom: Array.isArray(d.custom) ? d.custom : [], hidden: Array.isArray(d.hidden) ? d.hidden : [],
        pins: Array.isArray(d.pins) ? d.pins : [], pinsInit: d.pinsInit === true
      };
    } catch (e) { return { custom: [], hidden: [], pins: [], pinsInit: false }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function toast(o) { if (window.RadioToast) window.RadioToast.show(o); }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function normalize(v) {
    v = (v || "").trim();
    if (!v) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = "https://" + v;
    try { var u = new URL(v); if (u.protocol !== "https:" && u.protocol !== "http:") return ""; return u.href; } catch (e) { return ""; }
  }
  function looksLikeUrl(v) { return !/\s/.test(v) && /\.[a-z]{2,}(\/|$|:)/i.test(v.replace(/^[a-z]+:\/\//i, "")) || /^https?:\/\//i.test(v) || /^localhost/i.test(v); }

  /* ---------- Elementos del cajón ---------- */
  function androidApps() {
    var list = [];
    try { list = JSON.parse(AB.apps() || "[]"); } catch (e) {}
    return list.map(function (a) { return { id: "p:" + a.pkg, name: a.name, pkg: a.pkg, kind: "android" }; });
  }
  function build() {
    var base = [];
    if (AB) base = androidApps();
    if (EMB) base = base.concat(DEFAULTS.filter(function (d) { return data.hidden.indexOf(d.id) < 0; }).map(function (d) { return Object.assign({ kind: "web" }, d, { mode: "in" }); }));
    else if (!AB) base = DEFAULTS.filter(function (d) { return data.hidden.indexOf(d.id) < 0; }).map(function (d) { return Object.assign({ kind: "web" }, d); });
    base.push(BROWSER);
    data.custom.forEach(function (c) { base.push(Object.assign({ kind: "custom" }, c)); });
    base.sort(function (a, b) { return a.name.localeCompare(b.name, "es", { sensitivity: "base" }); });
    cache = base;
    // Primera vez en Android: se fijan las apps de navegación y música que existan
    if (AB && !data.pinsInit && base.length > 2) {
      AUTO_PINS.forEach(function (p) { if (base.some(function (a) { return a.pkg === p; })) data.pins.push("p:" + p); });
      data.pinsInit = true; save();
    }
    return base;
  }
  function byId(id) { return cache.filter(function (a) { return a.id === id; })[0]; }

  /* ---------- Iconos ---------- */
  var iconCache = {};
  function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function letterIcon(node, name) {
    node.textContent = (name || "?").trim().charAt(0).toUpperCase();
    node.style.background = "linear-gradient(145deg, hsl(" + hue(name) + " 42% 46%), hsl(" + ((hue(name) + 30) % 360) + " 45% 32%))";
  }
  function iconEl(a, size) {
    var s = document.createElement("span"); s.className = "ap__ico" + (size ? " ap__ico--" + size : ""); s.setAttribute("aria-hidden", "true");
    if (a.kind === "builtin") { s.classList.add("ap__ico--sys"); s.innerHTML = '<svg class="icon"><use href="#i-map"/></svg>'; return s; }
    if (a.kind === "android" && has("icon")) {
      s.dataset.pkg = a.pkg;
      if (iconCache[a.pkg]) setImg(s, iconCache[a.pkg]); else { letterIcon(s, a.name); lazyIcons.observe(s); }
      return s;
    }
    letterIcon(s, a.name);
    return s;
  }
  function setImg(s, src) {
    if (!src) { return; }
    s.textContent = ""; s.style.background = "none";
    var im = document.createElement("img"); im.alt = ""; im.decoding = "async"; im.src = src; s.appendChild(im);
  }
  var lazyIcons = (window.IntersectionObserver) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      lazyIcons.unobserve(e.target);
      var pkg = e.target.dataset.pkg, src = iconCache[pkg];
      if (!src) { try { src = AB.icon(pkg) || ""; } catch (x) { src = ""; } iconCache[pkg] = src; }
      setImg(e.target, src);
    });
  }, { root: scroller, rootMargin: "200px" }) : { observe: function (n) { var p = n.dataset.pkg; try { setImg(n, iconCache[p] = AB.icon(p)); } catch (e) {} }, unobserve: function () {} };

  /* ---------- Pintado ---------- */
  var lpTimer = null, lpFired = false;

  function cell(a, cls) {
    var b = document.createElement("button");
    b.type = "button"; b.className = cls; b.dataset.id = a.id; b.setAttribute("role", "listitem");
    if (cur && cur.id === a.id) b.dataset.running = "true";
    b.appendChild(iconEl(a, cls === "ap__fav" ? "lg" : ""));
    var n = document.createElement("span"); n.className = "ap__name"; n.textContent = a.name; b.appendChild(n);
    b.addEventListener("click", function () { if (lpFired) { lpFired = false; return; } launch(a); });
    b.addEventListener("pointerdown", function (e) {
      lpFired = false; clearTimeout(lpTimer);
      lpTimer = setTimeout(function () { lpFired = true; showMenu(a, b); }, 520);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (t) { b.addEventListener(t, function () { clearTimeout(lpTimer); }); });
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    return b;
  }

  function filtered() {
    var t = norm(q.value).trim();
    if (!t) return cache;
    var hits = cache.filter(function (a) { return norm(a.name).indexOf(t) >= 0; });
    hits.sort(function (a, b) { return (norm(a.name).indexOf(t) === 0 ? 0 : 1) - (norm(b.name).indexOf(t) === 0 ? 0 : 1); });
    return hits;
  }

  function render() {
    build();
    var list = filtered(), t = q.value.trim();
    grid.textContent = "";
    var fr = document.createDocumentFragment();
    list.forEach(function (a) { fr.appendChild(cell(a, "ap__app")); });
    grid.appendChild(fr);
    count.textContent = t ? (list.length ? list.length + (list.length === 1 ? " resultado" : " resultados") : "Sin resultados para «" + t + "»") : cache.length + " apps";
    // Favoritas: fijadas existentes (no se muestran mientras se busca)
    favsRow.textContent = "";
    var pins = data.pins.map(byId).filter(Boolean);
    favs.hidden = !pins.length || !!t;
    pins.forEach(function (a) { favsRow.appendChild(cell(a, "ap__fav")); });
    // Búsqueda en streaming/web mientras se escribe
    webBox.hidden = t.length < 2;
    if (!webBox.hidden) $("ap-web-lbl").textContent = "Buscar «" + (t.length > 18 ? t.slice(0, 17) + "…" : t) + "» en";
    qClear.hidden = !t;
  }

  /* ---------- Menú de pulsación larga ---------- */
  function hideMenu() { menu.hidden = true; menu.textContent = ""; }
  function menuBtn(label, fn) {
    var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitem"); b.className = "ap__mitem"; b.textContent = label;
    b.addEventListener("click", function () { hideMenu(); fn(); });
    return b;
  }
  function showMenu(a, anchor) {
    menu.textContent = "";
    var t = document.createElement("div"); t.className = "ap__mtitle"; t.textContent = a.name; menu.appendChild(t);
    menu.appendChild(menuBtn("Abrir", function () { launch(a); }));
    var pinned = data.pins.indexOf(a.id) >= 0;
    menu.appendChild(menuBtn(pinned ? "Quitar de favoritas" : "Fijar en favoritas", function () { togglePin(a); }));
    if (a.kind === "android" && has("appInfo")) menu.appendChild(menuBtn("Información de la app", function () { try { AB.appInfo(a.pkg); } catch (e) {} }));
    if (a.kind === "android" && has("uninstall")) menu.appendChild(menuBtn("Desinstalar", function () { try { AB.uninstall(a.pkg); } catch (e) {} }));
    if (a.kind === "custom") menu.appendChild(menuBtn("Quitar acceso", function () { removeItem(a); }));
    if (a.kind === "web") menu.appendChild(menuBtn("Ocultar", function () { removeItem(a); }));
    menu.hidden = false;
    // Posición junto al icono, dentro de la vista
    var host = launcher.getBoundingClientRect(), r = anchor.getBoundingClientRect();
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var left = Math.max(8, Math.min(host.width - mw - 8, r.left - host.left + r.width / 2 - mw / 2));
    var top = r.bottom - host.top + 6;
    if (top + mh > host.height - 8) top = Math.max(8, r.top - host.top - mh - 6);
    menu.style.left = left + "px"; menu.style.top = top + "px";
    var first = menu.querySelector(".ap__mitem"); if (first) first.focus({ preventScroll: true });
  }
  document.addEventListener("pointerdown", function (e) { if (!menu.hidden && !menu.contains(e.target)) { hideMenu(); } }, true);
  scroller.addEventListener("scroll", hideMenu, { passive: true });

  function togglePin(a) {
    var i = data.pins.indexOf(a.id);
    if (i >= 0) data.pins.splice(i, 1);
    else if (data.pins.length >= 10) { toast({ title: "Favoritas llenas", text: "Quita alguna para fijar otra.", kind: "bad" }); return; }
    else data.pins.push(a.id);
    save(); render();
  }
  function removeItem(a) {
    if (a.kind === "custom") data.custom = data.custom.filter(function (c) { return c.id !== a.id; });
    else if (data.hidden.indexOf(a.id) < 0) data.hidden.push(a.id);
    data.pins = data.pins.filter(function (p) { return p !== a.id; });
    if (cur && cur.id === a.id) close();
    save(); render();
  }

  /* ---------- Abrir ---------- */
  function launch(a) {
    // Aviso para «Más usadas»: aprende qué apps abres y a qué hora
    try { window.dispatchEvent(new CustomEvent("radio:applaunch", { detail: { id: a.id, name: a.name, kind: a.kind || "", pkg: a.pkg || "" } })); } catch (e) {}
    if (a.kind === "android") { try { if (!AB.launch(a.pkg)) toast({ title: a.name + " no se pudo abrir", kind: "bad" }); } catch (e) {} return; }
    if (a.mode === "ext" && a.url) { openExternal(a.url, a.name, a.scheme, a.pwa, a.pkg); return; }
    openInside(a);
  }
  function open(idOrUrl) {
    var a = byId(idOrUrl) || data.custom.filter(function (c) { return c.id === idOrUrl; })[0] || (idOrUrl === "browser" ? BROWSER : null);
    if (!a) { var u = normalize(idOrUrl); if (!u) return; a = { id: "tmp", name: u.replace(/^https?:\/\//, "").split("/")[0], url: u, mode: "in", kind: "custom" }; }
    launch(a);
  }
  function openInside(a) {
    cur = a;
    if (EMB) {
      if (a.url && ifr.dataset.appid !== a.id) EMB.open(a.id, a.url);
      ifr.dataset.appid = a.id;
      addrIn.value = (a.url && EMB.id() === a.id ? EMB.url() : "") || a.url || "";
      showFrame(true);
      if (!a.url) addrIn.focus();
      render();
      return;
    }
    if (a.url && ifr.dataset.appid !== a.id) ifr.src = a.url;
    if (!a.url && ifr.dataset.appid !== a.id) ifr.removeAttribute("src");
    ifr.dataset.appid = a.id;
    addrIn.value = a.url || "";
    showFrame(true);
    if (!a.url) addrIn.focus();
    render();
  }

  // Web: ventana emergente del tamaño de toda la pantalla (sin pestañas ni barra); si no, pestaña normal
  function openWeb(url, name, pwa, pkg) {
    var w = null;
    if (EMB) { openInside({ id: "w:" + url, name: name, url: url, mode: "in", kind: "custom" }); if (window.RadioNav) window.RadioNav.show("apps"); return; }
    if (AB) {   // Android: abre la app instalada con la dirección; si no está, el navegador del sistema
      var okA = false;
      try { okA = AB.openUrl(url, pkg || ""); } catch (e) {}
      if (!okA) toast({ title: "No se pudo abrir " + name, text: "Revisa que haya una app o navegador instalado.", kind: "bad" });
      return;
    }
    // Apps web instalables (YouTube…): un enlace normal permite que Chrome/Edge lo abra en la app instalada.
    // Una ventana emergente la salta, así que aquí no se usa.
    if (pwa && pref("appsNative")) {
      var l = document.createElement("a"); l.href = url; l.target = "_blank"; l.rel = "noopener"; l.style.display = "none";
      document.body.appendChild(l); l.click(); l.remove();
      toast({ title: name + " abierta", text: "Si tienes la app instalada, se abre esa; si no, en una pestaña.", ms: 3500 });
      return;
    }
    try {
      if (pref("appsFullscreen")) {
        var sw = screen.availWidth || screen.width, sh = screen.availHeight || screen.height;
        w = window.open(url, "_blank", "popup=yes,noopener,left=0,top=0,width=" + sw + ",height=" + sh);
      } else w = window.open(url, "_blank", "noopener");
    } catch (e) {}
    if (!w) toast({ title: "El navegador bloqueó la ventana", text: "Permite ventanas emergentes para este sitio y vuelve a intentarlo.", kind: "bad" });
    else toast({ title: name + " abierta", text: "Vuelve aquí cuando quieras.", ms: 3000 });
  }

  // App instalada: con el puente Android se lanza por paquete; en navegador, por esquema (spotify:, waze://…)
  function openExternal(url, name, scheme, pwa, pkg) {
    if (EMB) { openWeb(url, name, pwa, pkg); return; }
    if (AB && pkg && pref("appsNative")) {
      var done = false;
      try { done = AB.launch(pkg); } catch (e) {}
      if (done) return;
      toast({ title: name + " no está instalada", text: "Puedes instalarla desde la tienda o abrir la web.", kind: "bad",
        actions: [{ label: "Tienda", fn: function () { try { AB.store(pkg); } catch (e) {} } }, { label: "Abrir web", fn: function () { openWeb(url, name, pwa, ""); } }] });
      return;
    }
    if (AB) { openWeb(url, name, pwa, pkg); return; }
    if (!scheme || !pref("appsNative")) { openWeb(url, name, pwa); return; }
    var left = false;
    function gone() { if (document.hidden || !document.hasFocus()) left = true; }
    window.addEventListener("blur", gone); document.addEventListener("visibilitychange", gone);
    var a = document.createElement("a"); a.href = scheme; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () {
      window.removeEventListener("blur", gone); document.removeEventListener("visibilitychange", gone);
      if (!left) toast({ title: name + " no se abrió", text: "No parece estar instalada en este equipo.", kind: "bad",
        actions: [{ label: "Abrir en la web", fn: function () { openWeb(url, name, pwa); } }] });
    }, 1800);
  }

  /* ---------- Búsqueda: apps del equipo + streaming/web ---------- */
  var SEARCH = {
    youtube: { n: "YouTube", u: "https://www.youtube.com/results?search_query=", pwa: true, pkg: "com.google.android.youtube" },
    ytmusic: { n: "YouTube Music", u: "https://music.youtube.com/search?q=", pwa: true, pkg: "com.google.android.apps.youtube.music" },
    spotify: { n: "Spotify", u: "https://open.spotify.com/search/", pwa: true, pkg: "com.spotify.music" },
    web: { n: "la web", u: "https://duckduckgo.com/?q=", pwa: false }
  };
  function webSearch(key) {
    var t = q.value.trim(); if (!t || !SEARCH[key]) return;
    var s = SEARCH[key];
    openWeb(s.u + encodeURIComponent(t), s.n, s.pwa, s.pkg);
    q.blur();
  }
  webBox.addEventListener("click", function (e) { var b = e.target.closest(".ap__chip"); if (b) webSearch(b.dataset.s); });

  var qTimer = null;
  q.addEventListener("input", function () { clearTimeout(qTimer); qTimer = setTimeout(render, 90); render_clearOnly(); });
  function render_clearOnly() { qClear.hidden = !q.value; }
  q.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    clearTimeout(qTimer); render();
    var list = filtered();
    if (list.length === 1) { launch(list[0]); q.blur(); }
    else if (!list.length && q.value.trim()) { var u = normalize(q.value); if (looksLikeUrl(q.value.trim()) && u) openInside({ id: "tmp", name: "Navegador", url: u, mode: "in", kind: "custom" }); else webSearch("youtube"); }
    else q.blur();
  });
  qClear.addEventListener("click", function () { q.value = ""; render(); q.focus(); });

  /* ---------- Accesos web propios ---------- */
  $("ap-add-btn").addEventListener("click", function () { addForm.hidden = !addForm.hidden; if (!addForm.hidden) $("ap-name").focus(); });
  $("ap-add-cancel").addEventListener("click", function () { addForm.hidden = true; });
  addForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("ap-name").value.trim(), url = normalize($("ap-url").value);
    if (!name || !url) { toast({ title: "Revisa los datos", text: "Escribe un nombre y una dirección válida.", kind: "bad" }); return; }
    data.custom.push({ id: "c" + Date.now().toString(36), name: name.slice(0, 18), url: url, mode: "in" });
    $("ap-name").value = ""; $("ap-url").value = ""; addForm.hidden = true;
    save(); render();
  });

  /* ---------- Visor ---------- */
  function fsActive() { return document.fullscreenElement === frame; }
  function exitFs() { if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} } }
  function showFrame(on) {
    frame.hidden = !on; launcher.hidden = on;
    note.hidden = EMB ? true : !(on && cur && cur.url);
    if (EMB) EMB.show(on && !!cur && !!cur.url);
    if (!on) exitFs();
    else if (!AB && pref("appsFullscreen") && frame.requestFullscreen && !fsActive()) {
      try { var p = frame.requestFullscreen(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
  }
  function close() {
    cur = null; ifr.removeAttribute("src"); delete ifr.dataset.appid; addrIn.value = "";
    if (EMB) EMB.close();
    showFrame(false); render();
  }

  addrForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = addrIn.value.trim();
    if (!v) return;
    if (!looksLikeUrl(v)) { openWeb("https://duckduckgo.com/?q=" + encodeURIComponent(v), "Búsqueda", false, ""); return; }
    var u = normalize(v);
    if (!u) return;
    cur = cur || { id: "tmp", name: "Navegador", mode: "in", kind: "custom" };
    cur.url = u; addrIn.value = u; note.hidden = !!EMB ? true : false;
    if (EMB) { if (EMB.id() === (cur.id || "tmp")) EMB.go(u); else EMB.open(cur.id || "tmp", u); ifr.dataset.appid = cur.id || "tmp"; showFrame(true); addrIn.blur(); return; }
    ifr.src = u;
    addrIn.blur();
  });

  function curUrl() { return (cur && cur.url) || normalize(addrIn.value); }
  $("ap-ext").addEventListener("click", function () { var u = curUrl(); if (!u) return; if (EMB && window.RadioHost.openExternal) window.RadioHost.openExternal(u); else openWeb(u, cur ? cur.name : "App", false, ""); });
  $("ap-note-ext").addEventListener("click", function () { var u = curUrl(); if (!u) return; if (EMB && window.RadioHost.openExternal) window.RadioHost.openExternal(u); else openWeb(u, cur ? cur.name : "App", false, ""); });
  $("ap-reload").addEventListener("click", function () { if (EMB) { EMB.reload(); return; } var u = curUrl(); if (u) ifr.src = u; });
  $("ap-close").addEventListener("click", close);
  $("ap-apps").addEventListener("click", function () { showFrame(false); render(); });
  $("ap-home").addEventListener("click", function () { exitFs(); if (window.RadioNav) window.RadioNav.show("home"); });

  // Al volver a la vista: si hay una app en espera se continúa donde se quedó
  var viewEl = document.querySelector('.view[data-view="apps"]');
  if (viewEl) new MutationObserver(function () {
    if (viewEl.classList.contains("is-active")) { showFrame(!!cur); render(); }
    else { exitFs(); hideMenu(); }
  }).observe(viewEl, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !viewEl || !viewEl.classList.contains("is-active")) return;
    if (!menu.hidden) { hideMenu(); return; }
    if (!frame.hidden) $("ap-home").click();
  });

  if (EMB) window.addEventListener("radio:embed", function (e) {
    var d = e.detail || {};
    if (d.url && document.activeElement !== addrIn) addrIn.value = d.url;
    if (cur && d.url) cur.url = cur.url || d.url;
  });

  // Apps instaladas o quitadas mientras el radio está abierto (lo avisa la app Android)
  window.addEventListener("radio:appschanged", function () { iconCache = {}; render(); });

  // Abre un servicio (app oficial si está instalada; si no, la web). Lo usa la pestaña Música.
  function openService(sv) { openExternal(sv.url, sv.name, sv.scheme, sv.pwa !== false, sv.pkg); }

  window.RadioApps = {
    openService: openService,
    open: open, close: close, refresh: render,
    list: function () { return cache.slice(); },
    icon: function (a, size) { return iconEl(a, size); }
  };
  render();
})();
