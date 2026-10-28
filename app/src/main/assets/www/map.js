/* ==========================================================
   MAP — navegación: mapa, GPS, búsqueda, rutas, guía por voz
   y enlace con Waze. Usa TileMap (tilemap.js).

   Servicios (gratuitos, sin clave, uso razonable):
     · Mapas: teselas de OpenStreetMap (o la fuente de Ajustes)
     · Búsqueda de lugares: Photon (photon.komoot.io)
     · Rutas: OSRM (router.project-osrm.org)
   Waze no ofrece una API abierta de rutas o tráfico: aquí se
   envía el destino a la app de Waze y se puede abrir su mapa
   de tráfico en vivo (embed.waze.com).

   API: RadioMap.setDestination({lat,lon,name}) · get() ·
        simulate(kmh) · stopNavigation() · show()
   Almacenamiento: "radio-map" (casa, trabajo, favoritos,
   recientes, última posición).
   ========================================================== */
(function () {
  "use strict";

  var TM = window.TileMap;
  var S = window.RadioSystem;
  var KEY = "radio-map";
  var FALLBACK = { lat: 9.9341, lon: -84.0877, zoom: 14 }; // San José, Costa Rica (solo si no hay GPS ni posición guardada)
  var PHOTON = "https://photon.komoot.io";
  var OSRM = "https://router.project-osrm.org";
  // Proveedores de teselas. "invert": en modo oscuro se invierte la tesela clara.
  var PROVIDERS = {
    esri: { light: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", dark: null, attr: "© Esri, OpenStreetMap" },
    osm: { light: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", dark: null, attr: "© OpenStreetMap" },
    carto: { light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", attr: "© OpenStreetMap © CARTO" }
  };

  function $(id) { return document.getElementById(id); }
  var navEl = $("nav");
  if (!TM || !navEl) return;

  var fmt = S ? S.fmt : {
    dist: function (m) { return m < 950 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1).replace(".", ",") + " km"; },
    duration: function (s) { var m = Math.max(1, Math.round(s / 60)); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min"; },
    time: function (d) { return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }); },
    speedValue: function (k) { return Math.round(k); }, unitSpeed: function () { return "km/h"; }
  };
  function sys(k) { return S ? S.get(k) : null; }

  /* ---------- Datos guardados ---------- */
  var data = loadData();
  function loadData() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    d = d || {};
    return { home: d.home || null, work: d.work || null, favs: d.favs || [], recents: d.recents || [], last: d.last || null };
  }
  function saveData() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  /* ---------- Estado ---------- */
  var st = { pos: null, follow: true, mode: "browse", dest: null, routes: [], sel: 0, nav: null, sim: null, gps: "wait", assign: "", routing: false };
  var watchId = null;

  /* ---------- Geometría ---------- */
  var RAD = Math.PI / 180;
  function dist(a, b) { return TM.haversine(a, b); }
  function bearing(a, b) {
    var y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
    var x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }

  /* ==========================================================
     Mapas
     ========================================================== */
  function provider() {
    var k = sys("mapProvider") || "esri";
    if (k === "custom") {
      var u = String(sys("tileUrl") || "").trim();
      if (/\{z\}/.test(u) && /\{x\}/.test(u) && /\{y\}/.test(u)) return { light: u, dark: null, attr: "Mapa personalizado" };
      k = "esri";
    }
    return PROVIDERS[k] || PROVIDERS.esri;
  }
  function tileUrl() { var p = provider(), t = mapTheme(); return t === "dark" && p.dark ? p.dark : p.light; }
  function needsInvert() { var p = provider(); return mapTheme() === "dark" && !p.dark; }
  var start = data.last || FALLBACK;
  var map = new TM($("nav-map"), { lat: start.lat, lon: start.lon, zoom: start.zoom || 14, tileUrl: tileUrl() });
  var mini = null;
  var miniEl = $("home-map");
  if (miniEl) mini = new TM(miniEl, { lat: start.lat, lon: start.lon, zoom: 15, interactive: false, tileUrl: tileUrl(), minZ: 10, maxZ: 17 });

  function mapTheme() {
    var t = sys("mapTheme") || "auto";
    return t === "auto" ? (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark") : t;
  }
  function applyTheme() {
    var t = mapTheme();
    navEl.setAttribute("data-mt", t);
    var ts = needsInvert() ? "invert" : "native";
    navEl.setAttribute("data-ts", ts);
    if (miniEl) { miniEl.setAttribute("data-mt", t); miniEl.setAttribute("data-ts", ts); }
    if (map) { map.setTileUrl(tileUrl()); if (mini) mini.setTileUrl(tileUrl()); }
    applyAttr();
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  var attr = $("nav-attr");
  function applyAttr() {
    if (attr) attr.textContent = provider().attr;
  }
  applyAttr();

  map.on("tileerror", function (e) { navEl.setAttribute("data-tiles", e.errors > 3 && e.loaded < 1 ? "error" : "ok"); });
  map.on("tiles", function () { navEl.setAttribute("data-tiles", "ok"); });
  map.on("userpan", function () { st.follow = false; navEl.classList.add("is-free"); scheduleRecenter(); });

  var carSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.500l7 18-7-4.200-7 4.200z"/></svg>';
  var pinSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.200 7-12a7 7 0 0 0-14 0c0 5.800 7 12 7 12z"/><circle cx="12" cy="10" r="2.600"/></svg>';

  function setCarPin() {
    var p = st.pos;
    if (!p) return;
    var o = { lat: p.lat, lon: p.lon, cls: "pin-car" + (p.heading == null ? " is-dot" : ""), html: p.heading == null ? "<i></i>" : carSvg, rot: p.heading == null ? 0 : p.heading };
    map.setPin("car", o);
    if (mini) mini.setPin("car", o);
  }

  /* ==========================================================
     Ubicación (GPS) y simulación
     ========================================================== */
  var gpsBanner = $("nav-gps"), gpsText = $("nav-gps-text"), gpsBtn = $("nav-gps-btn");
  function gpsOn() { return !window.RadioQuick || window.RadioQuick.get().gps !== false; }

  function setGps(state, text, action) {
    st.gps = state;
    var show = state !== "ok";
    gpsBanner.hidden = !show;
    gpsText.textContent = text || "";
    gpsBtn.hidden = !action;
    gpsBtn.textContent = action || "";
    gpsBtn.dataset.act = action ? state : "";
    navEl.setAttribute("data-gps", state);
  }

  var permState = null;           // "granted" | "prompt" | "denied" (si el navegador lo informa)
  if (navigator.permissions && navigator.permissions.query) {
    try {
      navigator.permissions.query({ name: "geolocation" }).then(function (r) {
        permState = r.state;
        r.onchange = function () {
          permState = r.state;
          // Si el usuario concede el permiso desde el navegador, se reanuda sola, sin pedirlo otra vez
          if (r.state === "granted" && watchId == null && !st.sim) startGps();
        };
      }).catch(function () {});
    } catch (e) {}
  }

  function startGps() {
    if (st.sim || watchId != null) return;
    if (!gpsOn()) { setGps("off", "La ubicación está desactivada en los accesos rápidos.", "Activar"); return; }
    if (!navigator.geolocation) { setGps("unsupported", "Este navegador no ofrece ubicación."); return; }
    if (window.isSecureContext === false) {
      setGps("insecure", "El navegador solo da ubicación exacta en páginas https o localhost. Abre el radio desde una dirección segura.");
      return;
    }
    // Permiso ya negado: no se vuelve a pedir en bucle; se espera a que el usuario lo cambie
    if (permState === "denied") { setGps("denied", "El permiso de ubicación está bloqueado. Actívalo en los ajustes del sitio del navegador.", "Reintentar"); return; }
    setGps("wait", "Buscando señal GPS…");
    watchId = navigator.geolocation.watchPosition(function (p) {
      var c = p.coords;
      permState = "granted";
      // Descarta fixes mucho peores que el actual (saltos por Wi‑Fi/antenas) para no mover el punto
      var prev = st.pos;
      if (prev && c.accuracy > 150 && c.accuracy > (prev.acc || 0) * 2 && Date.now() - prev.t < 20000) return;
      onFix({ lat: c.latitude, lon: c.longitude, acc: c.accuracy, heading: c.heading, speed: c.speed == null ? null : c.speed * 3.6, t: p.timestamp || Date.now() });
    }, function (err) {
      if (err.code === 1) {
        permState = "denied";
        stopGps();
        setGps("denied", "Permite el acceso a la ubicación en el navegador para ver dónde estás.", "Reintentar");
      } else if (st.pos && Date.now() - st.pos.t < 60000) {
        /* timeout puntual con posición reciente: se conserva sin molestar */
      } else setGps("nosignal", "Sin señal de GPS. Se mostrará la última posición conocida.", "Reintentar");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function stopGps() {
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  }
  gpsBtn.addEventListener("click", function () {
    var a = gpsBtn.dataset.act;
    if (a === "off" && window.RadioQuick) window.RadioQuick.set({ gps: true });
    else { stopGps(); startGps(); }
  });
  window.addEventListener("radio:quickchange", function () {
    if (!gpsOn()) { stopGps(); if (!st.sim) setGps("off", "La ubicación está desactivada en los accesos rápidos.", "Activar"); }
    else if (watchId == null && !st.sim) startGps();
  });

  function onFix(f) {
    var prev = st.pos;
    if (prev) {
      var d = dist(prev, f), dt = (f.t - prev.t) / 1000;
      if (f.speed == null && dt > 0.2) f.speed = Math.min(250, d / dt * 3.6);
      if ((f.heading == null || isNaN(f.heading)) && d > 6) f.heading = bearing(prev, f);
    }
    if (f.heading == null || isNaN(f.heading)) f.heading = prev ? prev.heading : null;
    if (f.speed == null || f.speed < 3) f.speed = 0;
    st.pos = f;
    if (st.gps !== "ok") setGps("ok");
    if (!st.nav) homeAddr();

    data.last = { lat: f.lat, lon: f.lon, zoom: map.z };
    if (!onFix.saved || Date.now() - onFix.saved > 15000) { onFix.saved = Date.now(); saveData(); }

    if (S) S.setSpeed(f.speed);
    homeSpeed(f.speed);
    setCarPin();
    if (st.follow) followCar();
    if (mini) { mini.setView({ lat: f.lat, lon: f.lon }); $("home-card-map") && $("home-card-map").classList.add("is-live"); }
    if (st.nav) progress(f);
    updateDistances();
  }

  function followCar() {
    var p = st.pos;
    if (!p) return;
    var h = $("nav-map").clientHeight;
    map.offset = { x: 0, y: st.nav ? h * 0.18 : 0 };
    map.setView({ lat: p.lat, lon: p.lon });
  }

  var recenterTimer = null;
  function scheduleRecenter() {
    clearTimeout(recenterTimer);
    if (!st.nav) return;
    recenterTimer = setTimeout(function () { recenter(); }, 12000);
  }
  function recenter() {
    st.follow = true;
    navEl.classList.remove("is-free");
    map.offset = { x: 0, y: 0 };
    if (st.pos) {
      if (map.z < 15) map.setView(null, st.nav ? 17 : 16);
      followCar();
    } else setGps(st.gps, gpsText.textContent, gpsBtn.hidden ? "" : gpsBtn.textContent);
  }

  function homeSpeed(kmh) {
    var hs = $("hud-speed");
    if (hs) { hs.textContent = String(fmt.speedValue(kmh)); var hu = $("hud-unit"); if (hu) hu.textContent = fmt.unitSpeed(); }
    var cs = $("car-speed");
    if (cs) { cs.textContent = String(fmt.speedValue(kmh)); var sm = cs.closest(".stat__t"); sm = sm && sm.querySelector("small"); if (sm) sm.textContent = fmt.unitSpeed(); }
  }

  // La velocidad también puede venir del ESP32 (sensor del auto): se refleja igual en Inicio y en el mapa
  window.addEventListener("radio:speed", function (e) { if (e.detail) homeSpeed(e.detail.kmh); });

  /* Simulación del recorrido (para probar sin salir a la calle) */
  function startSim(route, kmh) {
    stopGps();
    stopSim();
    st.sim = { s: 0, kmh: kmh || 40, timer: null, last: Date.now() };
    navEl.setAttribute("data-sim", "on");
    st.sim.timer = setInterval(function () {
      var sim = st.sim;
      if (!sim || !st.nav) return stopSim();
      var now = Date.now(), dt = Math.min(1, (now - sim.last) / 1000); sim.last = now;
      sim.s += sim.kmh / 3.6 * dt;
      var r = st.nav.route, total = r.cum[r.cum.length - 1];
      if (sim.s >= total) sim.s = total;
      var pt = pointAt(r, sim.s);
      onFix({ lat: pt.lat, lon: pt.lon, acc: 5, heading: pt.heading, speed: sim.kmh, t: now });
    }, 250);
  }
  function stopSim() {
    if (st.sim) { clearInterval(st.sim.timer); st.sim = null; }
    navEl.removeAttribute("data-sim");
  }
  function pointAt(r, s) {
    var cum = r.cum, lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    var a = r.ll[lo], b = r.ll[Math.min(lo + 1, r.ll.length - 1)];
    var seg = cum[Math.min(lo + 1, cum.length - 1)] - cum[lo];
    var t = seg > 0 ? (s - cum[lo]) / seg : 0;
    return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, heading: bearing(a, b) };
  }

  /* ==========================================================
     Búsqueda de lugares (Photon)
     ========================================================== */
  var q = $("nav-q"), panel = $("nav-panel"), list = $("nav-results"), quick = $("nav-quick"), recentsEl = $("nav-recents");
  var searchTimer = null, searchAbort = null, cache = {};

  function placeFrom(f) {
    var p = f.properties || {}, c = f.geometry.coordinates;
    var street = [p.street, p.housenumber].filter(Boolean).join(" ");
    var name = p.name || street || p.city || "Lugar";
    var rest = [];
    if (street && street !== name) rest.push(street);
    var area = p.city || p.town || p.village || p.county || p.district;
    if (area && area !== name) rest.push(area);
    if (p.state && p.state !== area && p.state !== name) rest.push(p.state);
    if (p.country) rest.push(p.country);
    return { lat: c[1], lon: c[0], name: name, sub: rest.join(", ") };
  }

  function parseCoords(text) {
    var m = String(text).match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (!m) return null;
    var lat = Number(m[1]), lon = Number(m[2]);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && /\./.test(m[0]) ? { lat: lat, lon: lon } : null;
  }

  function runSearch(text) {
    text = text.trim();
    clearTimeout(searchTimer);
    if (searchAbort) { try { searchAbort.abort(); } catch (e) {} searchAbort = null; }
    if (text.length < 3) { renderIdle(); return; }
    var c = parseCoords(text);
    if (c) { renderResults([{ lat: c.lat, lon: c.lon, name: "Coordenadas", sub: c.lat.toFixed(5) + ", " + c.lon.toFixed(5) }]); return; }
    if (cache[text]) { renderResults(cache[text]); return; }
    resultsMsg("Buscando…");
    var url = PHOTON + "/api/?limit=7&q=" + encodeURIComponent(text);
    if (st.pos) url += "&lat=" + st.pos.lat.toFixed(4) + "&lon=" + st.pos.lon.toFixed(4) + "&location_bias_scale=0.4";
    var ctl = window.AbortController ? new AbortController() : null;
    searchAbort = ctl;
    fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); }).then(function (d) {
      var items = (d.features || []).filter(function (f) { return f.geometry && f.geometry.coordinates; }).map(placeFrom);
      cache[text] = items;
      if (q.value.trim() === text) renderResults(items);
    }).catch(function (e) {
      if (e && e.name === "AbortError") return;
      resultsMsg("No se pudo buscar. Revisa la conexión a internet.");
    });
  }

  function resultsMsg(t) {
    list.innerHTML = "";
    var li = document.createElement("li"); li.className = "nav__msg"; li.textContent = t; list.appendChild(li);
  }

  function itemEl(pl, icon) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button"; b.className = "nav__item";
    b.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#' + (icon || "i-pin") + '"/></svg>';
    var t = document.createElement("span"); t.className = "nav__item-t";
    var n = document.createElement("b"); n.textContent = pl.name;
    var s = document.createElement("span"); s.textContent = pl.sub || "";
    t.appendChild(n); t.appendChild(s);
    b.appendChild(t);
    var d = document.createElement("span"); d.className = "nav__item-d"; d.dataset.lat = pl.lat; d.dataset.lon = pl.lon;
    b.appendChild(d);
    b.addEventListener("click", function () { pickPlace(pl); });
    li.appendChild(b);
    return li;
  }
  function renderResults(items) {
    list.innerHTML = "";
    if (!items.length) { resultsMsg("No encontré ese lugar. Prueba con otro nombre o dirección."); return; }
    items.forEach(function (pl) { list.appendChild(itemEl(pl)); });
    updateDistances();
  }
  function updateDistances() {
    if (!st.pos) return;
    list.querySelectorAll(".nav__item-d").forEach(function (d) {
      d.textContent = fmt.dist(dist(st.pos, { lat: Number(d.dataset.lat), lon: Number(d.dataset.lon) }));
    });
  }

  function renderIdle() {
    // Casa / Trabajo / recientes (cuando no hay texto)
    quick.innerHTML = "";
    [["home", "Casa", "i-home"], ["work", "Trabajo", "i-work"]].forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "nav__chip"; b.dataset.k = k[0];
      b.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#' + k[2] + '"/></svg><span></span>';
      b.lastChild.textContent = data[k[0]] ? k[1] : k[1] + " · definir";
      b.addEventListener("click", function () {
        if (data[k[0]]) pickPlace(data[k[0]]);
        else { st.assign = k[0]; q.placeholder = "Busca la dirección de " + (k[0] === "home" ? "tu casa" : "tu trabajo"); q.focus(); }
      });
      quick.appendChild(b);
    });
    list.innerHTML = "";
    var shown = {}, any = false;
    data.favs.concat(data.recents).forEach(function (pl) {
      var k = pl.lat.toFixed(4) + "," + pl.lon.toFixed(4);
      if (shown[k] || list.children.length >= 7) return;
      shown[k] = 1; any = true;
      list.appendChild(itemEl(pl, data.favs.indexOf(pl) >= 0 ? "i-star" : "i-pin"));
    });
    if (!any) resultsMsg("Escribe un lugar o dirección, o usa el micrófono.");
    updateDistances();
  }

  function openPanel() { panel.hidden = false; navEl.classList.add("is-searching"); if (!q.value.trim()) renderIdle(); }
  function closePanel() { panel.hidden = true; navEl.classList.remove("is-searching"); st.assign = ""; q.placeholder = q.dataset.ph; }
  q.dataset.ph = q.placeholder;

  q.addEventListener("focus", openPanel);
  q.addEventListener("click", openPanel);
  q.addEventListener("input", function () {
    $("nav-clear").hidden = !q.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { runSearch(q.value); }, 400);
  });
  $("nav-form").addEventListener("submit", function (e) { e.preventDefault(); runSearch(q.value); });
  $("nav-clear").addEventListener("click", function () { q.value = ""; $("nav-clear").hidden = true; renderIdle(); if (!isLocked()) q.focus(); });
  $("nav-panel-close").addEventListener("click", function () { q.blur(); closePanel(); });

  // Voz
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var micBtn = $("nav-mic");
  if (!SR) micBtn.hidden = true;
  micBtn.addEventListener("click", function () {
    if (!SR) return;
    var rec = new SR();
    rec.lang = /^es/i.test(navigator.language || "") ? navigator.language : "es-ES";
    rec.interimResults = false; rec.maxAlternatives = 1;
    micBtn.classList.add("is-live");
    openPanel();
    resultsMsg("Escuchando… di el nombre o la dirección.");
    rec.onresult = function (ev) {
      var t = ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : "";
      if (t) { q.value = t; $("nav-clear").hidden = false; runSearch(t); }
    };
    rec.onerror = function () { resultsMsg("No te escuché. Toca el micrófono para intentarlo otra vez."); };
    rec.onend = function () { micBtn.classList.remove("is-live"); };
    try { rec.start(); } catch (e) { micBtn.classList.remove("is-live"); }
  });

  // Bloqueo de escritura en marcha
  function isLocked() { return !!(S && S.locked()); }
  function applyLock() {
    var l = isLocked();
    q.readOnly = l;
    q.setAttribute("inputmode", l ? "none" : "search");
    q.placeholder = l ? "En marcha: usa el micrófono o tus lugares" : (q.dataset.ph || "¿A dónde vamos?");
    navEl.classList.toggle("is-locked", l);
  }
  window.addEventListener("radio:lockchange", applyLock);
  applyLock();

  /* ---------- Guardar lugares ---------- */
  function remember(pl) {
    var k = pl.lat.toFixed(4) + "," + pl.lon.toFixed(4);
    data.recents = [{ lat: pl.lat, lon: pl.lon, name: pl.name, sub: pl.sub || "" }].concat(data.recents.filter(function (r) { return r.lat.toFixed(4) + "," + r.lon.toFixed(4) !== k; })).slice(0, 8);
    saveData();
  }
  function saveAs(kind) {
    var d = st.dest;
    if (!d) return;
    var pl = { lat: d.lat, lon: d.lon, name: d.name, sub: d.sub || "" };
    if (kind === "fav") {
      data.favs = data.favs.filter(function (f) { return f.lat.toFixed(4) !== pl.lat.toFixed(4) || f.lon.toFixed(4) !== pl.lon.toFixed(4); });
      data.favs.unshift(pl); data.favs = data.favs.slice(0, 12);
    } else data[kind] = pl;
    saveData();
    toast("Guardado", pl.name + " · " + (kind === "home" ? "Casa" : kind === "work" ? "Trabajo" : "Favoritos"));
  }
  function toast(title, text) { if (window.RadioToast) window.RadioToast.show({ title: title, text: text }); }

  /* ==========================================================
     Lugar elegido + tarjeta
     ========================================================== */
  var card = {
    root: $("nav-card"), name: $("nc-name"), sub: $("nc-sub"), routes: $("nc-routes"), msg: $("nc-msg"),
    go: $("nc-go"), sim: $("nc-sim"), waze: $("nc-waze"), save: $("nc-save"), saveRow: $("nc-save-row")
  };

  function pickPlace(pl) {
    if (st.assign) {
      var k = st.assign; st.assign = "";
      data[k] = { lat: pl.lat, lon: pl.lon, name: pl.name, sub: pl.sub || "" };
      saveData();
      toast("Guardado", pl.name + " · " + (k === "home" ? "Casa" : "Trabajo"));
      q.placeholder = q.dataset.ph;
      renderIdle();
      return;
    }
    q.value = ""; $("nav-clear").hidden = true;
    q.blur(); closePanel();
    setDestination(pl);
  }

  function setDestination(pl) {
    if (st.nav) stopNavigation(true);
    st.dest = { lat: Number(pl.lat), lon: Number(pl.lon), name: pl.name || "Destino", sub: pl.sub || "" };
    st.routes = []; st.sel = 0;
    map.setRoutes([]); if (mini) mini.setRoutes([]);
    map.setPin("dest", { lat: st.dest.lat, lon: st.dest.lon, cls: "pin-dest", html: pinSvg });
    if (mini) mini.setPin("dest", { lat: st.dest.lat, lon: st.dest.lon, cls: "pin-dest", html: pinSvg });
    setMode("place");
    card.name.textContent = st.dest.name;
    card.sub.textContent = st.dest.sub;
    card.saveRow.hidden = true;
    renderRoutes();
    st.follow = false; navEl.classList.add("is-free");
    if (st.pos) { requestRoutes(); }
    else {
      map.setView({ lat: st.dest.lat, lon: st.dest.lon }, 15);
      cardMsg("Sin ubicación todavía: no puedo calcular la ruta desde aquí. Puedes abrir el destino en Waze.");
    }
    if (window.RadioNav) window.RadioNav.show("map");
  }

  function cardMsg(t, kind) { card.msg.textContent = t || ""; if (kind) card.msg.dataset.kind = kind; else delete card.msg.dataset.kind; }

  function clearDestination() {
    st.dest = null; st.routes = []; st.sel = 0;
    map.removePin("dest"); map.setRoutes([]);
    if (mini) { mini.removePin("dest"); mini.setRoutes([]); }
    setMode("browse");
    cardMsg("");
  }

  /* ==========================================================
     Rutas (OSRM)
     ========================================================== */
  function buildRoute(r, idx) {
    var ll = r.geometry.coordinates.map(function (c) { return { lat: c[1], lon: c[0] }; });
    var cum = [0];
    for (var i = 1; i < ll.length; i++) cum.push(cum[i - 1] + dist(ll[i - 1], ll[i]));
    var steps = [], at = 0;
    (r.legs || []).forEach(function (leg) {
      (leg.steps || []).forEach(function (s) {
        steps.push({ at: at, dist: s.distance, name: s.name || "", ref: s.ref || "", man: s.maneuver || {}, loc: s.maneuver && s.maneuver.location });
        at += s.distance;
      });
    });
    return { id: idx, pts: r.geometry.coordinates, ll: ll, cum: cum, dist: r.distance, dur: r.duration, steps: steps, ratio: cum[cum.length - 1] ? r.distance / cum[cum.length - 1] : 1 };
  }

  function fetchRoute(from, to, alts) {
    var url = OSRM + "/route/v1/driving/" + from.lon.toFixed(6) + "," + from.lat.toFixed(6) + ";" + to.lon.toFixed(6) + "," + to.lat.toFixed(6) +
      "?overview=full&geometries=geojson&steps=true&alternatives=" + (alts ? "true" : "false");
    return fetch(url).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (o) {
      if (!o.j || o.j.code !== "Ok" || !o.j.routes || !o.j.routes.length) {
        var e = new Error(o.j && o.j.code === "NoRoute" ? "noroute" : "service"); throw e;
      }
      return o.j.routes.slice(0, 3).map(buildRoute);
    });
  }

  function requestRoutes() {
    if (!st.dest || !st.pos) return;
    var token = ++requestRoutes.n;
    st.routing = true;
    renderRoutes();
    cardMsg("Calculando la mejor ruta…");
    fetchRoute(st.pos, st.dest, true).then(function (routes) {
      if (token !== requestRoutes.n || !st.dest) return;
      st.routing = false;
      st.routes = routes; st.sel = 0;
      cardMsg("");
      renderRoutes(); drawRoutes(true);
    }).catch(function (e) {
      if (token !== requestRoutes.n) return;
      st.routing = false; st.routes = [];
      renderRoutes();
      cardMsg(e && e.message === "noroute" ? "No hay una ruta por carretera hasta ese lugar." : "No se pudo calcular la ruta (sin internet o servicio no disponible). Puedes abrirla en Waze.", "bad");
    });
  }
  requestRoutes.n = 0;

  function drawRoutes(fit) {
    var arr = st.routes.map(function (r, i) { return { pts: r.pts, selected: i === st.sel }; });
    map.setRoutes(arr);
    if (mini) mini.setRoutes(arr);
    if (fit && st.routes.length) {
      var all = st.routes[st.sel].pts.slice();
      var narrow = $("nav-map").clientWidth < 700;
      map.fitBounds(all, { top: narrow ? 90 : 40, right: 90, bottom: narrow ? 300 : 60, left: narrow ? 30 : 440 });
    }
  }

  function renderRoutes() {
    card.routes.innerHTML = "";
    st.routes.forEach(function (r, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "nav__route"; b.setAttribute("aria-pressed", String(i === st.sel));
      var t = document.createElement("b"); t.textContent = fmt.duration(r.dur);
      var d = document.createElement("span"); d.textContent = fmt.dist(r.dist) + (i === 0 ? " · Más rápida" : " · Alternativa");
      b.appendChild(t); b.appendChild(d);
      b.addEventListener("click", function () { st.sel = i; renderRoutes(); drawRoutes(false); });
      card.routes.appendChild(b);
    });
    var ready = st.routes.length > 0;
    card.go.disabled = !ready; card.sim.disabled = !ready;
    card.root.setAttribute("data-busy", String(st.routing));
  }

  /* ==========================================================
     Instrucciones en español
     ========================================================== */
  var MOD = { "uturn": "da la vuelta", "sharp right": "gira bruscamente a la derecha", "right": "gira a la derecha", "slight right": "gira ligeramente a la derecha", "straight": "sigue recto", "slight left": "gira ligeramente a la izquierda", "left": "gira a la izquierda", "sharp left": "gira bruscamente a la izquierda" };
  var ORD = ["", "primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima", "octava", "novena", "décima"];

  function streetOf(s) { return s.name || s.ref || ""; }

  function stepText(s, last) {
    var t = s.man.type, m = s.man.modifier, name = streetOf(s);
    var en = name ? " en " + name : "";
    switch (t) {
      case "depart": return name ? "Comienza por " + name : "Comienza a conducir";
      case "arrive":
        if (m === "left") return "Has llegado: tu destino está a la izquierda";
        if (m === "right") return "Has llegado: tu destino está a la derecha";
        return "Has llegado a tu destino";
      case "roundabout": case "rotary":
        var ex = s.man.exit;
        return "En la rotonda, toma la " + (ORD[ex] || ex + "ª") + " salida" + (name ? " hacia " + name : "");
      case "roundabout turn": return cap((MOD[m] || "continúa") + " en la rotonda");
      case "exit roundabout": case "exit rotary": return "Sal de la rotonda" + (name ? " hacia " + name : "");
      case "merge": return "Incorpórate" + (name ? " a " + name : "");
      case "on ramp": return "Toma la entrada" + (name ? " hacia " + name : "");
      case "off ramp": return "Toma la salida" + (name ? " hacia " + name : "");
      case "fork": return m && /left/.test(m) ? "En la bifurcación, mantente a la izquierda" : m && /right/.test(m) ? "En la bifurcación, mantente a la derecha" : "En la bifurcación, sigue recto";
      case "end of road": return cap((MOD[m] || "continúa") + " al final de la calle");
      case "new name": case "continue": return (m === "straight" || !m ? "Continúa" : cap(MOD[m] || "continúa")) + (name ? " por " + name : "");
      default: return cap(MOD[m] || "continúa") + en;
    }
  }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  /* Icono de maniobra: ángulo y forma */
  function iconFor(s) {
    var t = s.man.type, m = s.man.modifier || "straight";
    if (t === "arrive") return { shape: "arrive", rot: 0, flip: false };
    if (t === "roundabout" || t === "rotary" || t === "roundabout turn") return { shape: "round", rot: 0, flip: false };
    if (m === "uturn") return { shape: "uturn", rot: 0, flip: false };
    if (m === "straight" || t === "depart" || t === "continue" || t === "new name") return { shape: "straight", rot: 0, flip: false };
    var left = /left/.test(m);
    if (/slight/.test(m)) return { shape: "straight", rot: left ? -40 : 40, flip: false };
    return { shape: "turn", rot: /sharp/.test(m) ? (left ? -30 : 30) : 0, flip: left };
  }
  var SHAPES = {
    straight: '<path d="M12 21V5M6 11l6-6 6 6"/>',
    turn: '<path d="M7 21v-8a4 4 0 0 1 4-4h8M15 4l4 5-4 5"/>',
    uturn: '<path d="M8 21V10a4 4 0 0 1 8 0v5M12.500 12l3.500 4 3.500-4"/>',
    round: '<circle cx="12" cy="14" r="5"/><path d="M12 9V3M8.500 6.500L12 3l3.500 3.500"/>',
    arrive: '<path d="M12 22s7-6.200 7-12a7 7 0 0 0-14 0c0 5.800 7 12 7 12z"/><circle cx="12" cy="10" r="2.600"/>'
  };
  function turnSvg(s) {
    var ic = iconFor(s);
    return '<svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(' + ic.rot + 'deg)' + (ic.flip ? " scaleX(-1)" : "") + '">' + SHAPES[ic.shape] + "</svg>";
  }

  /* ==========================================================
     Navegación guiada
     ========================================================== */
  var guide = { root: $("nav-guide"), icon: $("ng-icon"), dist: $("ng-dist"), instr: $("ng-instr"), then: $("ng-then") };
  var bar = { eta: $("nb-eta"), time: $("nb-time"), dist: $("nb-dist"), voice: $("nb-voice"), stop: $("nb-stop") };

  function startNavigation(simulate) {
    var r = st.routes[st.sel];
    if (!r || !st.dest) return;
    remember(st.dest);
    st.nav = { route: r, idx: 0, s: 0, off: 0, said: {}, lastReroute: 0, arrived: false, nextIdx: 1 };
    st.follow = true; navEl.classList.remove("is-free");
    map.setRoutes([{ pts: r.pts, selected: true }]); if (mini) mini.setRoutes([{ pts: r.pts, selected: true }]);
    setMode("guide");
    if (simulate) startSim(r, typeof simulate === "number" ? simulate : 40);
    else startGps();
    speak("Inicia la ruta. " + stepText(r.steps[0]));
    if (st.pos) { map.setView(null, 17); followCar(); progress(st.pos); }
    if (window.RadioNav) window.RadioNav.show("map");
  }

  function stopNavigation(silent) {
    if (!st.nav && !st.sim) { return; }
    st.nav = null;
    stopSim();
    clearTimeout(recenterTimer);
    cancelSpeech();
    if (!silent) {
      clearDestination();
      recenter();
      startGps();
    } else startGps();
    homeAddr();
  }

  /* Proyección del punto sobre la ruta (coordenadas locales en metros) */
  function project(r, f, from, to) {
    var best = { d: Infinity, i: from, s: 0 }, ll = r.ll, cum = r.cum;
    var kx = Math.cos(f.lat * RAD) * 111320, ky = 110540;
    for (var i = from; i < to; i++) {
      var ax = (ll[i].lon - f.lon) * kx, ay = (ll[i].lat - f.lat) * ky;
      var bx = (ll[i + 1].lon - f.lon) * kx, by = (ll[i + 1].lat - f.lat) * ky;
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      var px = ax + t * dx, py = ay + t * dy, d = Math.sqrt(px * px + py * py);
      if (d < best.d) best = { d: d, i: i, s: cum[i] + t * (cum[i + 1] - cum[i]) };
    }
    return best;
  }

  function progress(f) {
    var nav = st.nav;
    if (!nav || nav.arrived) return;
    var r = nav.route, n = r.ll.length;
    if (n < 2) return;
    var b = project(r, f, Math.max(0, nav.idx - 3), Math.min(n - 1, nav.idx + 150));
    if (b.d > 45) { var g = project(r, f, 0, n - 1); if (g.d < b.d) b = g; }

    if (b.d > 45) {
      nav.off++;
      if (nav.off >= 3 && !st.sim && Date.now() - nav.lastReroute > 8000) reroute();
      return;
    }
    nav.off = 0;
    nav.idx = b.i; nav.s = b.s;

    var so = Math.min(r.dist, b.s * r.ratio);                 // metros recorridos (unidades OSRM)
    var remaining = Math.max(0, r.dist - so);
    var k = nav.nextIdx;
    while (k < r.steps.length - 1 && r.steps[k].at <= so + 1) k++;
    nav.nextIdx = k;
    var step = r.steps[k] || r.steps[r.steps.length - 1];
    var dNext = Math.max(0, step.at - so);

    updateGuide(step, dNext, r.steps[k + 1], remaining, r);
    announce(step, dNext, k, f.speed);

    if (remaining < 30 || (k >= r.steps.length - 1 && dNext < 25)) arrive();
  }

  function updateGuide(step, dNext, after, remaining, r) {
    guide.icon.innerHTML = turnSvg(step);
    guide.dist.textContent = step.man.type === "arrive" && dNext < 25 ? "Llegaste" : fmt.dist(dNext);
    var text = stepText(step);
    guide.instr.textContent = text;
    guide.then.textContent = after && after.at - step.at < 350 && after.man.type !== "arrive" ? "Luego: " + stepText(after).toLowerCase() : "";
    var sec = r.dur * (remaining / (r.dist || 1));
    bar.eta.textContent = fmt.time(new Date(Date.now() + sec * 1000));
    bar.time.textContent = fmt.duration(sec);
    bar.dist.textContent = fmt.dist(remaining);
    homeAddr(text, dNext);
  }

  function spokenDist(m) {
    if (m >= 950) { var km = m / 1000; return (km < 10 ? km.toFixed(1) : String(Math.round(km))).replace(".", ",") + " kilómetros"; }
    return Math.max(50, Math.round(m / 50) * 50) + " metros";
  }
  function announce(step, dNext, k, speed) {
    var nav = st.nav, fast = speed > 70;
    var marks = [[fast ? 800 : 500, "a"], [fast ? 300 : 200, "b"], [60, "c"]];
    for (var i = 0; i < marks.length; i++) {
      var key = k + marks[i][1];
      if (dNext <= marks[i][0] && !nav.said[key]) {
        // Marca todas las anteriores como dichas para no hablar encimado
        for (var j = 0; j <= i; j++) nav.said[k + marks[j][1]] = true;
        var txt = stepText(step);
        if (marks[i][1] === "c") speak(txt);
        else if (step.man.type === "arrive") speak("Llegarás a tu destino dentro de " + spokenDist(dNext));
        else speak("Dentro de " + spokenDist(dNext) + ", " + txt.charAt(0).toLowerCase() + txt.slice(1));
        break;
      }
    }
  }

  function arrive() {
    var nav = st.nav;
    if (!nav || nav.arrived) return;
    nav.arrived = true;
    guide.dist.textContent = "Llegaste";
    guide.instr.textContent = "Has llegado a tu destino";
    guide.then.textContent = "";
    speak("Has llegado a tu destino");
    var name = st.dest ? st.dest.name : "";
    setTimeout(function () {
      if (st.nav && st.nav.arrived) { stopNavigation(false); toast("Llegaste", name); }
    }, 5000);
  }

  function reroute() {
    var nav = st.nav;
    if (!nav || !st.pos || !st.dest) return;
    nav.lastReroute = Date.now();
    speak("Recalculando la ruta");
    guide.instr.textContent = "Recalculando…";
    fetchRoute(st.pos, st.dest, false).then(function (routes) {
      if (!st.nav) return;
      var r = routes[0];
      st.routes = [r]; st.sel = 0;
      st.nav = { route: r, idx: 0, s: 0, off: 0, said: {}, lastReroute: Date.now(), arrived: false, nextIdx: 1 };
      map.setRoutes([{ pts: r.pts, selected: true }]); if (mini) mini.setRoutes([{ pts: r.pts, selected: true }]);
      progress(st.pos);
    }).catch(function () {
      guide.instr.textContent = "No se pudo recalcular la ruta";
    });
  }

  /* ---------- Voz ---------- */
  var voiceObj = null;
  function pickVoice() {
    if (voiceObj || !window.speechSynthesis) return voiceObj;
    var vs = speechSynthesis.getVoices() || [];
    var pref = (navigator.language || "es").toLowerCase();
    voiceObj = vs.filter(function (v) { return v.lang.toLowerCase() === pref; })[0] || vs.filter(function (v) { return /^es/i.test(v.lang); })[0] || null;
    return voiceObj;
  }
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = function () { voiceObj = null; };
  var lastSpoken = "";
  function speak(text) {
    lastSpoken = text;
    navEl.setAttribute("data-said", text);
    if (!sys("voice") || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    if (window.RadioQuick && window.RadioQuick.get().mute) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = /^es/i.test(navigator.language || "") ? navigator.language : "es-ES";
      var v = pickVoice(); if (v) u.voice = v;
      u.onstart = function () { if (S) S.duck(true); };
      u.onend = u.onerror = function () { if (S) S.duck(false); };
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function cancelSpeech() {
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    if (S) S.duck(false);
  }

  /* ==========================================================
     Modos y controles
     ========================================================== */
  function setMode(m) {
    st.mode = m;
    navEl.setAttribute("data-mode", m);
    card.root.hidden = m !== "place";
    guide.root.hidden = m !== "guide";
    $("nav-bar").hidden = m !== "guide";
    if (m === "guide") closePanel();
    bar.voice.setAttribute("aria-pressed", String(!!sys("voice")));
    homeAddr();
  }

  card.go.addEventListener("click", function () { startNavigation(false); });
  card.sim.addEventListener("click", function () { startNavigation(40); });
  card.waze.addEventListener("click", function () { openWaze(st.dest); });
  card.save.addEventListener("click", function () { card.saveRow.hidden = !card.saveRow.hidden; });
  card.saveRow.querySelectorAll("[data-save]").forEach(function (b) {
    b.addEventListener("click", function () { saveAs(b.dataset.save); card.saveRow.hidden = true; });
  });
  $("nc-close").addEventListener("click", clearDestination);
  bar.stop.addEventListener("click", function () { stopNavigation(false); });
  bar.voice.addEventListener("click", function () {
    var on = !sys("voice");
    if (S) S.set({ voice: on });
    if (!on) cancelSpeech();
    bar.voice.setAttribute("aria-pressed", String(on));
  });
  $("nb-waze").addEventListener("click", function () { openWaze(st.dest); });

  $("nav-zin").addEventListener("click", function () { map.setZoom(map.z + 1); userZoomed(); });
  $("nav-zout").addEventListener("click", function () { map.setZoom(map.z - 1); userZoomed(); });
  function userZoomed() { if (st.follow && st.pos) followCar(); }
  $("nav-center").addEventListener("click", recenter);

  // Mantener presionado en el mapa = elegir ese punto
  map.on("longpress", function (e) {
    if (st.mode === "guide") return;
    var pl = { lat: e.lat, lon: e.lon, name: "Punto en el mapa", sub: e.lat.toFixed(5) + ", " + e.lon.toFixed(5) };
    setDestination(pl);
    fetch(PHOTON + "/reverse?lon=" + e.lon.toFixed(6) + "&lat=" + e.lat.toFixed(6)).then(function (r) { return r.json(); }).then(function (d) {
      var f = d.features && d.features[0];
      if (f && st.dest && st.dest.lat === pl.lat) {
        var named = placeFrom(f);
        st.dest.name = named.name; st.dest.sub = named.sub;
        card.name.textContent = named.name; card.sub.textContent = named.sub;
      }
    }).catch(function () {});
  });
  map.on("tap", function () { if (!panel.hidden) { q.blur(); closePanel(); } });

  /* ==========================================================
     Waze
     ========================================================== */
  function wazeUrl(d) {
    if (!d) return "https://waze.com/ul";
    return "https://waze.com/ul?ll=" + d.lat.toFixed(6) + "%2C" + d.lon.toFixed(6) + "&navigate=yes&zoom=17";
  }
  function openWaze(d) { window.open(wazeUrl(d), "_blank", "noopener"); }

  var wz = { root: $("nav-waze"), frame: $("nw-frame"), btn: $("nav-traffic") };
  function wazeEmbedUrl() {
    var c = st.pos || map.center;
    return "https://embed.waze.com/iframe?zoom=" + Math.max(8, Math.min(16, map.z - 1)) + "&lat=" + c.lat.toFixed(5) + "&lon=" + c.lon.toFixed(5) + "&ct=livemap";
  }
  function trafficToggle(on) {
    on = on == null ? wz.root.hidden : on;
    wz.root.hidden = !on;
    wz.btn.setAttribute("aria-pressed", String(on));
    if (on) wz.frame.src = wazeEmbedUrl(); else wz.frame.src = "about:blank";
  }
  wz.btn.addEventListener("click", function () { trafficToggle(); });
  $("nw-close").addEventListener("click", function () { trafficToggle(false); });
  $("nw-open").addEventListener("click", function () { openWaze(st.dest || (st.pos ? st.pos : null)); });

  /* ==========================================================
     Tarjeta de mapa del Inicio
     ========================================================== */
  var homeCard = document.querySelector(".card--map");
  if (homeCard) {
    homeCard.id = "home-card-map";
    homeCard.setAttribute("role", "button");
    homeCard.setAttribute("tabindex", "0");
    homeCard.setAttribute("aria-label", "Abrir el mapa");
    homeCard.addEventListener("click", function () { if (window.RadioNav) window.RadioNav.show("map"); });
    homeCard.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && window.RadioNav) { e.preventDefault(); window.RadioNav.show("map"); } });
    if (data.last) homeCard.classList.add("is-live");
  }
  function homeAddr(text, dNext) {
    var a = document.querySelector(".map__addr");
    if (!a) return;
    if (st.nav && text) a.textContent = fmt.dist(dNext || 0) + " · " + text;
    else if (st.dest && st.mode === "place") a.textContent = "Hacia " + st.dest.name;
    else a.textContent = st.gps === "ok" || data.last ? "Ubicación actual" : "Sin señal GPS";
  }
  if (mini) {
    mini.on("tileerror", function (e) { if (e.errors > 3 && e.loaded < 1 && homeCard) homeCard.classList.remove("is-live"); });
    if (data.last) { mini.setPin("car", { lat: data.last.lat, lon: data.last.lon, cls: "pin-car is-dot", html: "<i></i>" }); }
  }

  /* ==========================================================
     Ajustes del sistema que afectan al mapa
     ========================================================== */
  window.addEventListener("radio:systemchange", function (e) {
    var ch = (e.detail && e.detail.changed) || [];
    if (ch.indexOf("mapTheme") >= 0) applyTheme();
    if (ch.indexOf("tileUrl") >= 0 || ch.indexOf("mapProvider") >= 0) applyTheme();
    if (ch.indexOf("distance") >= 0) { homeSpeed(S && S.speed ? S.speed() : (st.pos ? st.pos.speed : 0)); renderRoutes(); updateDistances(); }
    if (ch.indexOf("voice") >= 0) bar.voice.setAttribute("aria-pressed", String(!!sys("voice")));
  });

  // Al abrir la vista Mapa se recalcula el tamaño y se muestra la posición
  var viewEl = document.querySelector('.view[data-view="map"]');
  if (viewEl) new MutationObserver(function () {
    if (viewEl.classList.contains("is-active")) { map.renderNow(); if (st.follow && st.pos) followCar(); if (watchId == null && !st.sim) startGps(); }
  }).observe(viewEl, { attributes: true, attributeFilter: ["class"] });

  /* ---------- Arranque ---------- */
  setMode("browse");
  renderIdle();
  setCarPinFromLast();
  function setCarPinFromLast() {
    if (data.last) map.setPin("car", { lat: data.last.lat, lon: data.last.lon, cls: "pin-car is-dot", html: "<i></i>" });
  }
  startGps();

  window.RadioMap = {
    setDestination: setDestination,
    stopNavigation: function () { stopNavigation(false); },
    simulate: function (kmh) {
      if (!st.dest) return false;
      if (!st.routes.length) return false;
      startNavigation(kmh || 40);
      return true;
    },
    get: function () {
      return { pos: st.pos, dest: st.dest, mode: st.mode, navigating: !!st.nav, routes: st.routes.length, lastSpoken: lastSpoken, view: map.getView() };
    },
    show: function () { if (window.RadioNav) window.RadioNav.show("map"); },
    _test: { onFix: onFix, map: map, mini: mini }
  };
})();
