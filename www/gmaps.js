/* ==========================================================
   GMAPS — Google Maps dentro de AURA (opcional, con clave)
   · Mapa: Maps JavaScript API (con tráfico en vivo y modo oscuro).
   · Búsqueda de lugares: Places API (New) «searchText».
   · Rutas con tráfico: Routes API «computeRoutes» (alternativas, instrucciones en español).
   Se activa con una clave de Google Maps Platform (Ajustes → Asistente y mapas de Google) y
   Mapa = Google. Si falla la clave o no hay internet, map.js vuelve al mapa estándar.
   Expone un adaptador con la misma interfaz que tilemap.js para que map.js no cambie su lógica.
   API: RadioGMaps {enabled(), load(), create(el, o), search(texto, pos), route(from, to)}
   Sección: MAPA
   ========================================================== */
(function () {
  "use strict";
  var PLACES = "https://places.googleapis.com/v1/places:searchText";
  var ROUTES = "https://routes.googleapis.com/directions/v2:computeRoutes";
  var loading = null, failed = false, G = null;

  function sys() { return (window.RadioSystem && window.RadioSystem.get && window.RadioSystem.get()) || {}; }
  function key() { return (window.RadioAI && window.RadioAI.mapsKey && window.RadioAI.mapsKey()) || ""; }
  function enabled() { return !!key() && sys().mapEngine !== "osm" && !failed; }

  function load() {
    if (G) return Promise.resolve(G);
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      if (window.google && window.google.maps && window.google.maps.importLibrary) return res();
      window.__gmReady = function () { res(); };
      window.gm_authFailure = function () { failed = true; if (window.RadioToast) window.RadioToast.show({ title: "La clave de Google Maps no funciona", text: "Se usa el mapa estándar. Revisa la clave y las APIs habilitadas.", kind: "bad", ms: 5000 }); window.dispatchEvent(new CustomEvent("radio:gmaps", { detail: { failed: true } })); };
      var s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key()) + "&v=weekly&loading=async&language=es&region=CR&callback=__gmReady";
      s.async = true; s.onerror = function () { rej(new Error("net")); };
      document.head.appendChild(s);
      setTimeout(function () { rej(new Error("timeout")); }, 15000);
    }).then(function () {
      return Promise.all([google.maps.importLibrary("maps"), google.maps.importLibrary("core")]);
    }).then(function () { G = google.maps; return G; }, function (e) { loading = null; failed = true; throw e; });
    return loading;
  }

  /* ---------- Utilidades ---------- */
  function decode(str) {       // polilínea codificada (precisión 5) → [[lon, lat], …]
    var i = 0, lat = 0, lon = 0, out = [];
    while (i < str.length) {
      var b, sh = 0, r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      lat += (r & 1) ? ~(r >> 1) : (r >> 1);
      sh = 0; r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      lon += (r & 1) ? ~(r >> 1) : (r >> 1);
      out.push([lon / 1e5, lat / 1e5]);
    }
    return out;
  }
  function secs(d) { var m = /([\d.]+)s/.exec(String(d || "")); return m ? parseFloat(m[1]) : 0; }
  var MAN = {
    TURN_LEFT: ["turn", "left"], TURN_RIGHT: ["turn", "right"], TURN_SLIGHT_LEFT: ["turn", "slight left"], TURN_SLIGHT_RIGHT: ["turn", "slight right"],
    TURN_SHARP_LEFT: ["turn", "sharp left"], TURN_SHARP_RIGHT: ["turn", "sharp right"], UTURN_LEFT: ["turn", "uturn"], UTURN_RIGHT: ["turn", "uturn"],
    STRAIGHT: ["continue", "straight"], MERGE: ["merge", "straight"], RAMP_LEFT: ["off ramp", "left"], RAMP_RIGHT: ["off ramp", "right"],
    FORK_LEFT: ["fork", "left"], FORK_RIGHT: ["fork", "right"], ROUNDABOUT_LEFT: ["roundabout turn", "left"], ROUNDABOUT_RIGHT: ["roundabout turn", "right"],
    DEPART: ["depart", "straight"], NAME_CHANGE: ["new name", "straight"], FERRY: ["continue", "straight"], FERRY_TRAIN: ["continue", "straight"]
  };

  /* ---------- Búsqueda (Places API New) ---------- */
  function search(text, pos) {
    var body = { textQuery: text, languageCode: "es", regionCode: "CR", maxResultCount: 7 };
    if (pos) body.locationBias = { circle: { center: { latitude: pos.lat, longitude: pos.lon }, radius: 30000 } };
    return fetch(PLACES, { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.error && j.error.message) || "http"); return j; }); })
      .then(function (j) {
        return (j.places || []).filter(function (p) { return p.location; }).map(function (p) {
          return { lat: p.location.latitude, lon: p.location.longitude, name: (p.displayName && p.displayName.text) || "Lugar", sub: p.formattedAddress || "" };
        });
      });
  }

  /* ---------- Rutas con tráfico (Routes API) ---------- */
  function route(from, to, alts) {
    var body = {
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } },
      travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", computeAlternativeRoutes: alts !== false, languageCode: "es-419", units: "METRIC"
    };
    var mask = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.startLocation";
    return fetch(ROUTES, { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key(), "X-Goog-FieldMask": mask }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (o) {
        if (!o.ok) { var e = new Error((o.j && o.j.error && o.j.error.message) || "service"); throw e; }
        if (!o.j.routes || !o.j.routes.length) { var n = new Error("noroute"); throw n; }
        // Se devuelven en el formato de OSRM que ya entiende map.js
        return o.j.routes.slice(0, 3).map(function (r) {
          var steps = [];
          (r.legs || []).forEach(function (leg) {
            (leg.steps || []).forEach(function (s) {
              var ni = s.navigationInstruction || {}, m = MAN[ni.maneuver] || ["continue", "straight"], loc = s.startLocation && s.startLocation.latLng;
              steps.push({ distance: s.distanceMeters || 0, name: "", ref: "", maneuver: { type: steps.length ? m[0] : "depart", modifier: m[1], text: ni.instructions || "", location: loc ? [loc.longitude, loc.latitude] : null } });
            });
          });
          var pts = decode(r.polyline.encodedPolyline);
          steps.push({ distance: 0, name: "", ref: "", maneuver: { type: "arrive", location: pts[pts.length - 1] } });
          return { geometry: { coordinates: pts }, distance: r.distanceMeters || 0, duration: secs(r.duration), legs: [{ steps: steps }] };
        });
      });
  }

  /* ---------- Adaptador de mapa con la interfaz de tilemap.js ---------- */
  function create(el, o) {
    var self = { root: el, pins: {}, handlers: {}, routes: [], lines: [], traffic: null, dark: !!o.dark, _z: o.zoom || 14, _c: { lat: o.lat, lon: o.lon }, _off: { x: 0, y: 0 } };
    var map = null, overlay = null, layer = null;

    function emit(ev, d) { (self.handlers[ev] || []).forEach(function (f) { try { f(d); } catch (e) {} }); }
    self.on = function (ev, fn) { (self.handlers[ev] = self.handlers[ev] || []).push(fn); return self; };

    function build() {
      if (map) { self._c = self.center; self._z = self.z; }
      el.innerHTML = "";
      map = new G.Map(el, {
        center: { lat: self._c.lat, lng: self._c.lon }, zoom: self._z, mapId: "DEMO_MAP_ID", colorScheme: self.dark ? google.maps.ColorScheme.DARK : google.maps.ColorScheme.LIGHT,
        disableDefaultUI: true, gestureHandling: "greedy", clickableIcons: false, keyboardShortcuts: false, minZoom: 3, maxZoom: 20
      });
      map.addListener("dragstart", function () { emit("userpan"); });
      map.addListener("click", function () { emit("tap"); });
      map.addListener("contextmenu", function (e) { if (e && e.latLng) emit("longpress", { lat: e.latLng.lat(), lon: e.latLng.lng() }); });
      map.addListener("idle", function () { emit("tiles", {}); emit("move", self.getView()); });
      var Ov = function () {}; Ov.prototype = new G.OverlayView();
      Ov.prototype.onAdd = function () { layer = document.createElement("div"); layer.style.cssText = "position:absolute;left:0;top:0;pointer-events:none"; this.getPanes().floatPane.appendChild(layer); Object.keys(self.pins).forEach(function (k) { layer.appendChild(self.pins[k].w); }); };
      Ov.prototype.draw = function () { place(); };
      Ov.prototype.onRemove = function () { if (layer && layer.parentNode) layer.parentNode.removeChild(layer); layer = null; };
      overlay = new Ov(); overlay.setMap(map);
      map.addListener("bounds_changed", place);
      if (self.trafficOn !== false) { self.traffic = new G.TrafficLayer(); self.traffic.setMap(map); }
      drawLines();
    }
    function place() {
      var pr = overlay && overlay.getProjection && overlay.getProjection(); if (!pr) return;
      Object.keys(self.pins).forEach(function (k) {
        var p = self.pins[k], pt = pr.fromLatLngToDivPixel(new G.LatLng(p.o.lat, p.o.lon));
        if (pt) p.w.style.transform = "translate(" + pt.x + "px," + pt.y + "px)";
      });
    }

    Object.defineProperty(self, "z", { get: function () { return map ? map.getZoom() : self._z; }, set: function (v) { self.setZoom(v); } });
    Object.defineProperty(self, "center", { get: function () { var c = map && map.getCenter(); return c ? { lat: c.lat(), lon: c.lng() } : self._c; } });
    Object.defineProperty(self, "offset", { get: function () { return self._off; }, set: function (v) { self._off = v || { x: 0, y: 0 }; } });

    // centra en c dejando el punto c desplazado «offset» píxeles respecto al centro de la pantalla
    function shifted(c, z) {
      var pr = overlay && overlay.getProjection && overlay.getProjection();
      if (!pr || (!self._off.x && !self._off.y)) return c;
      var sc = Math.pow(2, z), wp = map.getProjection(); if (!wp) return c;
      var p = wp.fromLatLngToPoint(new G.LatLng(c.lat, c.lon));
      var q = new G.Point(p.x - self._off.x / sc, p.y - self._off.y / sc), ll = wp.fromPointToLatLng(q);
      return { lat: ll.lat(), lon: ll.lng() };
    }
    self.setView = function (c, z) {
      var zz = z != null ? z : self.z, cc = c || self.center;
      if (z != null) map.setZoom(zz);
      map.setCenter(c ? (function (s) { return { lat: s.lat, lng: s.lon }; })(shifted(cc, zz)) : { lat: cc.lat, lng: cc.lon });
    };
    self.setZoom = function (z) { if (map) map.setZoom(Math.max(3, Math.min(20, z))); };
    self.getView = function () { var c = self.center; return { lat: c.lat, lon: c.lon, zoom: self.z }; };
    self.setTileUrl = function () {};
    self.renderNow = function () { if (map) { G.event.trigger(map, "resize"); place(); } };
    self.fitBounds = function (pts, pad) {
      if (!map || !pts || !pts.length) return;
      var b = new G.LatLngBounds(); pts.forEach(function (p) { b.extend({ lat: p[1], lng: p[0] }); });
      pad = pad || {}; map.fitBounds(b, { top: pad.top || 20, right: pad.right || 20, bottom: pad.bottom || 20, left: pad.left || 20 });
    };

    /* marcadores (mismo HTML y estilos que el mapa estándar) */
    self.setPin = function (id, p) {
      var e = self.pins[id];
      if (!e) {
        var w = document.createElement("div"); w.className = "tm__pin"; var inner = document.createElement("div"); inner.className = "tm__pin-in"; w.appendChild(inner);
        if (layer) layer.appendChild(w);
        e = self.pins[id] = { w: w, inner: inner, o: {} };
      }
      Object.assign(e.o, p);
      e.inner.className = "tm__pin-in " + (e.o.cls || "");
      if (e.o.html != null && e.html !== e.o.html) { e.inner.innerHTML = e.o.html; e.html = e.o.html; }
      e.inner.style.transform = e.o.rot ? "rotate(" + e.o.rot + "deg)" : "";
      place();
    };
    self.removePin = function (id) { var e = self.pins[id]; if (e) { if (e.w.parentNode) e.w.parentNode.removeChild(e.w); delete self.pins[id]; } };

    /* rutas */
    function drawLines() {
      self.lines.forEach(function (l) { l.setMap(null); }); self.lines = [];
      if (!map) return;
      self.routes.forEach(function (r) {
        var path = r.pts.map(function (p) { return { lat: p[1], lng: p[0] }; });
        if (r.selected) self.lines.push(new G.Polyline({ map: map, path: path, strokeColor: "#ffffff", strokeOpacity: 0.95, strokeWeight: 10, zIndex: 2 }));
        self.lines.push(new G.Polyline({ map: map, path: path, strokeColor: r.selected ? "#4285f4" : "#8a94a6", strokeOpacity: r.selected ? 1 : 0.8, strokeWeight: r.selected ? 6 : 5, zIndex: r.selected ? 3 : 1 }));
      });
    }
    self.setRoutes = function (rs) { self.routes = rs || []; drawLines(); };

    self.setTraffic = function (on) { self.trafficOn = !!on; if (!map) return; if (on && !self.traffic) { self.traffic = new G.TrafficLayer(); } if (self.traffic) self.traffic.setMap(on ? map : null); };
    self.setDark = function (d) { if (self.dark === !!d) return; self.dark = !!d; build(); Object.keys(self.pins).forEach(function (k) { if (layer) layer.appendChild(self.pins[k].w); }); };
    self.destroy = function () { if (overlay) overlay.setMap(null); el.innerHTML = ""; map = null; };

    build();
    return self;
  }

  window.RadioGMaps = { enabled: enabled, load: load, create: create, search: search, route: route, failed: function () { return failed; } };
})();
