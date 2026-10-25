/* ==========================================================
   APPS — lanzador de accesos y visor dentro del radio
   · Accesos predeterminados + los que añada el usuario.
   · Las apps que no permiten incrustarse se abren en pestaña nueva.
   · «Sistema» vuelve a Inicio de un toque; la app abierta queda en espera.
   Sección: APPS
   API: RadioApps.open(id|url) · RadioApps.close()
   ========================================================== */
(function () {
  "use strict";
  var KEY = "radio-apps";
  var $ = function (id) { return document.getElementById(id); };
  var grid = $("ap-grid"), launcher = $("ap-launcher"), frame = $("ap-frame"), ifr = $("ap-iframe");
  if (!grid || !frame) return;
  var addrForm = $("ap-addr"), addrIn = $("ap-addr-in"), note = $("ap-note");

  var AB = window.AndroidBridge || null;       // lo inyecta la app Android (launcher); null en navegador
  var UA = navigator.userAgent || "";
  var IOS = /iPhone|iPad|iPod/i.test(UA), ANDROID = /Android/i.test(UA);
  function pref(k) { var s = window.RadioSystem && window.RadioSystem.get && window.RadioSystem.get(); return !s || s[k] !== false; }

  // mode: "ext" = se abre en pestaña nueva (el sitio no permite incrustarse) · "in" = dentro del radio
  var DEFAULTS = [
    { id: "youtube", name: "YouTube", url: "https://www.youtube.com/", mode: "ext", pwa: true, pkg: "com.google.android.youtube" },
    { id: "ytmusic", name: "YouTube Music", url: "https://music.youtube.com/", mode: "ext", pwa: true, pkg: "com.google.android.apps.youtube.music" },
    { id: "spotify", name: "Spotify", url: "https://open.spotify.com/", mode: "ext", scheme: "spotify:", pwa: true, pkg: "com.spotify.music" },
    { id: "waze", name: "Waze", url: "https://www.waze.com/live-map", mode: "ext", scheme: "waze://", pkg: "com.waze" },
    { id: "gmaps", name: "Google Maps", url: "https://www.google.com/maps", mode: "ext", scheme: IOS ? "comgooglemaps://" : (ANDROID ? "geo:0,0" : ""), pkg: "com.google.android.apps.maps" },
    { id: "browser", name: "Navegador", url: "", mode: "in", builtin: true },
    { id: "allapps", name: "Todas las apps", url: "", mode: "android", builtin: true, androidOnly: true },
    { id: "androidset", name: "Ajustes Android", url: "", mode: "android", builtin: true, androidOnly: true }
  ];

  var data = load();
  var cur = null;          // app abierta en el visor (queda en espera al salir)
  var editing = false;

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "{}");
      return { custom: Array.isArray(d.custom) ? d.custom : [], hidden: Array.isArray(d.hidden) ? d.hidden : [] };
    } catch (e) { return { custom: [], hidden: [] }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function all() { return DEFAULTS.filter(function (a) { return data.hidden.indexOf(a.id) < 0 && (AB || !a.androidOnly); }).concat(data.custom); }
  function find(id) { return DEFAULTS.concat(data.custom).filter(function (a) { return a.id === id; })[0]; }
  function toast(o) { if (window.RadioToast) window.RadioToast.show(o); }

  function normalize(v) {
    v = (v || "").trim();
    if (!v) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = "https://" + v;
    try { var u = new URL(v); if (u.protocol !== "https:" && u.protocol !== "http:") return ""; return u.href; } catch (e) { return ""; }
  }
  function looksLikeUrl(v) { return !/\s/.test(v) && /\.[a-z]{2,}(\/|$|:)/i.test(v.replace(/^[a-z]+:\/\//i, "")) || /^https?:\/\//i.test(v) || /^localhost/i.test(v); }

  /* ---------- Lanzador ---------- */
  function render() {
    grid.textContent = "";
    all().forEach(function (a) {
      var wrap = document.createElement("div");
      wrap.className = "ap__cell"; wrap.setAttribute("role", "listitem");
      var b = document.createElement("button");
      b.type = "button"; b.className = "ap__tile"; b.dataset.id = a.id;
      if (cur && cur.id === a.id) b.dataset.running = "true";
      var ico = document.createElement("span"); ico.className = "ap__ico-tile"; ico.setAttribute("aria-hidden", "true");
      ico.textContent = a.builtin ? "" : (a.name || "?").trim().charAt(0).toUpperCase();
      if (a.builtin) ico.innerHTML = '<svg class="icon"><use href="#' + (a.id === "allapps" ? "i-grid" : (a.id === "androidset" ? "i-settings" : "i-map")) + '"/></svg>';
      var nm = document.createElement("span"); nm.className = "ap__name"; nm.textContent = a.name;
      var sub = document.createElement("span"); sub.className = "ap__sub";
      sub.textContent = cur && cur.id === a.id ? "Abierta" : (a.mode === "android" ? "Android" : (a.mode === "ext" ? (AB && a.pkg ? "App instalada" : "Pestaña nueva") : "En el radio"));
      b.appendChild(ico); b.appendChild(nm); b.appendChild(sub);
      b.addEventListener("click", function () { if (!editing) open(a.id); });
      wrap.appendChild(b);
      if (editing) {
        var x = document.createElement("button");
        x.type = "button"; x.className = "ap__del"; x.setAttribute("aria-label", "Quitar " + a.name);
        x.innerHTML = '<svg class="icon"><use href="#i-close"/></svg>';
        x.addEventListener("click", function () { remove(a); });
        wrap.appendChild(x);
      }
      grid.appendChild(wrap);
    });
    $("ap-add").hidden = !editing;
    var eb = $("ap-edit"); eb.textContent = editing ? "Listo" : "Editar"; eb.setAttribute("aria-pressed", String(editing));
  }

  function remove(a) {
    if (a.builtin || DEFAULTS.some(function (d) { return d.id === a.id; })) { if (data.hidden.indexOf(a.id) < 0) data.hidden.push(a.id); }
    else data.custom = data.custom.filter(function (c) { return c.id !== a.id; });
    if (cur && cur.id === a.id) close();
    save(); render();
  }

  $("ap-edit").addEventListener("click", function () { editing = !editing; render(); });
  $("ap-add").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("ap-name").value.trim(), url = normalize($("ap-url").value);
    if (!name || !url) { toast({ title: "Revisa los datos", text: "Escribe un nombre y una dirección válida.", kind: "bad" }); return; }
    data.custom.push({ id: "c" + Date.now().toString(36), name: name.slice(0, 18), url: url, mode: "in" });
    $("ap-name").value = ""; $("ap-url").value = "";
    save(); render();
  });

  /* ---------- Búsqueda rápida (escribes con el teclado del radio y se abre el resultado) ---------- */
  var SEARCH = {
    youtube: { n: "YouTube", u: "https://www.youtube.com/results?search_query=", pwa: true, pkg: "com.google.android.youtube" },
    ytmusic: { n: "YouTube Music", u: "https://music.youtube.com/search?q=", pwa: true, pkg: "com.google.android.apps.youtube.music" },
    spotify: { n: "Spotify", u: "https://open.spotify.com/search/", pwa: true, pkg: "com.spotify.music" },
    web: { n: "la web", u: "https://duckduckgo.com/?q=", pwa: false }
  };
  var sKey = "radio-apps-search", sSel = "youtube";
  try { sSel = SEARCH[localStorage.getItem(sKey)] ? localStorage.getItem(sKey) : "youtube"; } catch (e) {}
  var sForm = $("ap-search"), sQ = $("ap-search-q"), sSeg = $("ap-search-seg");
  function paintSearch() {
    sSeg.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === sSel)); });
    sQ.placeholder = "Buscar en " + SEARCH[sSel].n;
  }
  sSeg.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    sSel = b.dataset.s; try { localStorage.setItem(sKey, sSel); } catch (x) {}
    paintSearch();
  });
  sForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = sQ.value.trim(); if (!q) return;
    var t = SEARCH[sSel];
    openWeb(t.u + encodeURIComponent(q), t.n, t.pwa, t.pkg);
    sQ.blur();
  });
  paintSearch();

  /* ---------- Visor ---------- */
  // Web: ventana emergente del tamaño de toda la pantalla (sin pestañas ni barra); si no, pestaña normal
  function openWeb(url, name, pwa, pkg) {
    var w = null;
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

  // App instalada: se intenta con su esquema (spotify:, waze://…). El navegador no dice si existe,
  // así que si la página no pierde el foco enseguida se ofrece la web.
  function openExternal(url, name, scheme, pwa, pkg) {
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

  function open(idOrUrl) {
    var a = find(idOrUrl);
    if (a && a.id === "androidset") { try { AB.settings(); } catch (e) {} return; }
    if (a && a.id === "allapps") { showAllApps(); return; }
    if (!a) { var u = normalize(idOrUrl); if (!u) return; a = { id: "tmp", name: u.replace(/^https?:\/\//, "").split("/")[0], url: u, mode: "in" }; }
    if (a.mode === "ext" && a.url) { openExternal(a.url, a.name, a.scheme, a.pwa, a.pkg); return; }
    cur = a;
    if (a.url && ifr.dataset.appid !== a.id) { ifr.src = a.url; }
    if (!a.url && ifr.dataset.appid !== a.id) { ifr.removeAttribute("src"); }
    ifr.dataset.appid = a.id;
    addrIn.value = a.url || "";
    showFrame(true);
    if (!a.url) addrIn.focus();
    render();
  }

  /* ---------- Todas las apps instaladas (solo en la app Android) ---------- */
  function showAllApps() {
    var box = $("ap-all"), g = $("ap-all-grid");
    if (!box || !AB) return;
    var list = [];
    try { list = JSON.parse(AB.apps() || "[]"); } catch (e) {}
    g.textContent = "";
    list.forEach(function (it) {
      var b = document.createElement("button"); b.type = "button"; b.className = "ap__tile ap__tile--sm";
      var ic = document.createElement("span"); ic.className = "ap__ico-tile ap__ico-tile--img";
      var im = document.createElement("img"); im.alt = ""; im.loading = "lazy"; im.decoding = "async";
      try { var d = AB.icon(it.pkg); if (d) im.src = d; } catch (e) {}
      ic.appendChild(im);
      var nm = document.createElement("span"); nm.className = "ap__name"; nm.textContent = it.name;
      b.appendChild(ic); b.appendChild(nm);
      b.addEventListener("click", function () { try { AB.launch(it.pkg); } catch (e) {} });
      g.appendChild(b);
    });
    box.hidden = false; $("ap-grid").hidden = true; $("ap-search").hidden = true; $("ap-edit").hidden = true;
  }
  function hideAllApps() {
    var box = $("ap-all"); if (!box) return;
    box.hidden = true; $("ap-grid").hidden = false; $("ap-search").hidden = false; $("ap-edit").hidden = false;
  }
  if ($("ap-all-back")) $("ap-all-back").addEventListener("click", hideAllApps);

  function fsActive() { return document.fullscreenElement === frame; }
  function exitFs() { if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} } }
  function showFrame(on) {
    frame.hidden = !on; launcher.hidden = on;
    note.hidden = !(on && cur && cur.url);
    if (!on) exitFs();
    else if (!AB && pref("appsFullscreen") && frame.requestFullscreen && !fsActive()) {
      try { var p = frame.requestFullscreen(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
  }

  function close() {
    cur = null; ifr.removeAttribute("src"); delete ifr.dataset.appid; addrIn.value = "";
    showFrame(false); render();
  }

  addrForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = addrIn.value.trim();
    if (!v) return;
    if (!looksLikeUrl(v)) { openExternal("https://duckduckgo.com/?q=" + encodeURIComponent(v), "Búsqueda"); return; }
    var u = normalize(v);
    if (!u) return;
    cur = cur || { id: "tmp", name: "Navegador", mode: "in" };
    cur.url = u; ifr.src = u; addrIn.value = u; note.hidden = false;
    addrIn.blur();
  });

  function curUrl() { return (cur && cur.url) || normalize(addrIn.value); }
  $("ap-ext").addEventListener("click", function () { var u = curUrl(); if (u) openExternal(u, cur ? cur.name : "App"); });
  $("ap-note-ext").addEventListener("click", function () { var u = curUrl(); if (u) openExternal(u, cur ? cur.name : "App"); });
  $("ap-reload").addEventListener("click", function () { var u = curUrl(); if (u) ifr.src = u; });
  $("ap-close").addEventListener("click", close);
  $("ap-apps").addEventListener("click", function () { showFrame(false); render(); });
  $("ap-home").addEventListener("click", function () { exitFs(); if (window.RadioNav) window.RadioNav.show("home"); });

  // Al volver a la vista: si hay una app en espera se continúa donde se quedó
  var viewEl = document.querySelector('.view[data-view="apps"]');
  if (viewEl) new MutationObserver(function () {
    if (viewEl.classList.contains("is-active")) { showFrame(!!cur); render(); if (!cur) hideAllApps(); }
    else exitFs();
  }).observe(viewEl, { attributes: true, attributeFilter: ["class"] });
  // Si el usuario sale de pantalla completa con Esc, el visor sigue abierto en su sitio
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && viewEl && viewEl.classList.contains("is-active") && !frame.hidden) $("ap-home").click();
  });

  window.RadioApps = { open: open, close: close, list: function () { return all().slice(); } };
  render();
})();
