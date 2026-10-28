/* ==========================================================
   TILEMAP — motor de mapa por teselas (sin dependencias)
   Proyección Web Mercator, arrastrar, pellizcar, rueda,
   rutas (SVG) y marcadores. Lo usan la vista Mapa y la
   tarjeta de mapa del Inicio (map.js).

   new TileMap(el, {lat, lon, zoom, interactive, tileUrl})
     .setView({lat,lon}, zoom)   .setZoom(z, x, y)   .fitBounds(pts, pad)
     .setRoutes([{pts:[[lon,lat],…], selected:true}])
     .setPin(id, {lat, lon, cls, rot, html})   .removePin(id)
     .toScreen(lat, lon)   .fromScreen(x, y)
     .on("tap" | "longpress" | "userpan" | "move" | "tiles" | "tileerror", fn)
   ========================================================== */
(function (root) {
  "use strict";

  var TS = 256;
  var SVGNS = "http://www.w3.org/2000/svg";

  function worldSize(z) { return TS * Math.pow(2, z); }
  function project(lat, lon, z) {
    var s = worldSize(z), sin = Math.sin(lat * Math.PI / 180);
    sin = Math.max(-0.9999, Math.min(0.9999, sin));
    return { x: (lon + 180) / 360 * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
  }
  function unproject(x, y, z) {
    var s = worldSize(z), n = Math.PI - 2 * Math.PI * y / s;
    return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon: x / s * 360 - 180 };
  }
  function haversine(a, b) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function TileMap(el, opt) {
    opt = opt || {};
    var self = this;
    this.root = el;
    this.interactive = opt.interactive !== false;
    this.minZ = opt.minZ || 3;
    this.maxZ = opt.maxZ || 19;
    this.tileUrl = opt.tileUrl || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    this.z = opt.zoom || 14;
    this.center = { lat: opt.lat == null ? 0 : opt.lat, lon: opt.lon == null ? 0 : opt.lon };
    this.offset = { x: 0, y: 0 };
    this.tiles = {};
    this.pins = {};
    this.routes = [];
    this.routeEls = [];
    this.handlers = {};
    this.errors = 0;
    this.loaded = 0;
    this._raf = 0;
    this._tl = { x: 0, y: 0 };

    el.classList.add("tm");
    this.tilesEl = document.createElement("div"); this.tilesEl.className = "tm__tiles";
    this.svg = document.createElementNS(SVGNS, "svg"); this.svg.setAttribute("class", "tm__svg"); this.svg.setAttribute("aria-hidden", "true");
    this.pinsEl = document.createElement("div"); this.pinsEl.className = "tm__pins";
    el.appendChild(this.tilesEl); el.appendChild(this.svg); el.appendChild(this.pinsEl);

    if (window.ResizeObserver) new ResizeObserver(function () { self.render(); }).observe(el);
    else window.addEventListener("resize", function () { self.render(); });
    if (this.interactive) this._bind();
    this.render();
  }

  var P = TileMap.prototype;

  P.on = function (ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; };
  P.emit = function (ev, data) { (this.handlers[ev] || []).forEach(function (f) { f(data); }); };

  P.setTileUrl = function (u) {
    u = u || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    if (u === this.tileUrl) return;
    this.tileUrl = u;
    this.errors = 0;
    for (var k in this.tiles) { this.tiles[k].remove(); }
    this.tiles = {};
    this.render();
  };

  P.clampZoom = function (z) { return Math.max(this.minZ, Math.min(this.maxZ, Math.round(z))); };

  P.setView = function (c, z) {
    if (c) this.center = { lat: Math.max(-85, Math.min(85, c.lat)), lon: c.lon };
    if (z != null) this.z = this.clampZoom(z);
    this.render();
    this.emit("move", this.getView());
  };
  P.getView = function () { return { lat: this.center.lat, lon: this.center.lon, zoom: this.z }; };
  P.setOffset = function (x, y) { this.offset = { x: x || 0, y: y || 0 }; this.render(); };

  /* Zoom manteniendo fijo el punto (x, y) de la pantalla */
  P.setZoom = function (z, sx, sy) {
    z = this.clampZoom(z);
    if (z === this.z) return;
    var w = this.root.clientWidth, h = this.root.clientHeight;
    if (sx == null) { sx = w / 2 + this.offset.x; sy = h / 2 + this.offset.y; }
    var ll = this.fromScreen(sx, sy);
    this.z = z;
    var p = project(ll.lat, ll.lon, z);
    this.center = unproject(p.x - (sx - (w / 2 + this.offset.x)), p.y - (sy - (h / 2 + this.offset.y)), z);
    this.render();
    this.emit("move", this.getView());
  };

  P.toScreen = function (lat, lon) {
    var p = project(lat, lon, this.z);
    return { x: p.x - this._tl.x, y: p.y - this._tl.y };
  };
  P.fromScreen = function (x, y) {
    var w = this.root.clientWidth, h = this.root.clientHeight;
    var c = project(this.center.lat, this.center.lon, this.z);
    return unproject(c.x + (x - (w / 2 + this.offset.x)), c.y + (y - (h / 2 + this.offset.y)), this.z);
  };

  /* Ajusta el mapa para ver todos los puntos [[lon,lat],…] dentro de los márgenes */
  P.fitBounds = function (pts, pad) {
    pad = Object.assign({ top: 20, right: 20, bottom: 20, left: 20 }, pad || {});
    var w = this.root.clientWidth, h = this.root.clientHeight;
    if (!pts || !pts.length || !w || !h) return;
    var minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    pts.forEach(function (p) {
      if (p[1] < minLat) minLat = p[1]; if (p[1] > maxLat) maxLat = p[1];
      if (p[0] < minLon) minLon = p[0]; if (p[0] > maxLon) maxLon = p[0];
    });
    var aw = Math.max(40, w - pad.left - pad.right), ah = Math.max(40, h - pad.top - pad.bottom);
    var z = this.maxZ;
    for (; z > this.minZ; z--) {
      var a = project(maxLat, minLon, z), b = project(minLat, maxLon, z);
      if (b.x - a.x <= aw && b.y - a.y <= ah) break;
    }
    var m = project((minLat + maxLat) / 2, (minLon + maxLon) / 2, z);
    var cx = pad.left + aw / 2, cy = pad.top + ah / 2;
    this.offset = { x: 0, y: 0 };
    this.z = z;
    this.center = unproject(m.x - (cx - w / 2), m.y - (cy - h / 2), z);
    this.render();
    this.emit("move", this.getView());
  };

  /* ---------- Rutas ---------- */
  P.setRoutes = function (routes) { this.routes = routes || []; this.render(); };

  /* ---------- Marcadores ---------- */
  P.setPin = function (id, o) {
    var p = this.pins[id];
    if (!p) {
      var w = document.createElement("div"); w.className = "tm__pin";
      var inner = document.createElement("div"); inner.className = "tm__pin-in";
      w.appendChild(inner);
      this.pinsEl.appendChild(w);
      p = this.pins[id] = { w: w, inner: inner, o: {} };
    }
    Object.assign(p.o, o);
    p.inner.className = "tm__pin-in " + (p.o.cls || "");
    if (p.o.html != null && p.html !== p.o.html) { p.inner.innerHTML = p.o.html; p.html = p.o.html; }
    p.inner.style.transform = p.o.rot ? "rotate(" + p.o.rot + "deg)" : "";
    this._place(p);
  };
  P.removePin = function (id) { var p = this.pins[id]; if (p) { p.w.remove(); delete this.pins[id]; } };
  P._place = function (p) {
    if (p.o.lat == null) return;
    var s = this.toScreen(p.o.lat, p.o.lon);
    p.w.style.transform = "translate3d(" + s.x.toFixed(1) + "px," + s.y.toFixed(1) + "px,0)";
  };

  /* ---------- Dibujo ---------- */
  P.render = function () {
    var self = this;
    if (this._raf) return;
    this._raf = requestAnimationFrame(function () { self._raf = 0; self._draw(); });
  };
  P.renderNow = function () { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } this._draw(); };

  P._draw = function () {
    var w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h) return;
    var z = this.z, c = project(this.center.lat, this.center.lon, z);
    var tlx = c.x - (w / 2 + this.offset.x), tly = c.y - (h / 2 + this.offset.y);
    this._tl = { x: tlx, y: tly };

    var n = Math.pow(2, z);
    var x0 = Math.floor(tlx / TS), x1 = Math.floor((tlx + w - 1) / TS);
    var y0 = Math.max(0, Math.floor(tly / TS)), y1 = Math.min(n - 1, Math.floor((tly + h - 1) / TS));
    var need = {}, x, y, key;
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
      key = z + "/" + x + "/" + y;
      need[key] = 1;
      var t = this.tiles[key] || this._makeTile(key, z, x, y, n);
      t.style.transform = "translate3d(" + Math.round(x * TS - tlx) + "px," + Math.round(y * TS - tly) + "px,0)";
    }
    for (key in this.tiles) if (!need[key]) { this.tiles[key].remove(); delete this.tiles[key]; }

    this._drawRoutes(w, h, tlx, tly);
    for (var id in this.pins) this._place(this.pins[id]);
  };

  P._makeTile = function (key, z, x, y, n) {
    var self = this;
    var img = new Image(TS, TS);
    img.className = "tm__tile";
    img.alt = ""; img.draggable = false; img.decoding = "async";
    var xw = ((x % n) + n) % n;
    img.onload = function () { img.classList.add("is-in"); self.loaded++; self.emit("tiles", { loaded: self.loaded, errors: self.errors }); };
    img.onerror = function () { self.errors++; img.classList.add("is-bad"); self.emit("tileerror", { loaded: self.loaded, errors: self.errors }); };
    img.src = this.tileUrl.replace("{z}", z).replace("{x}", xw).replace("{y}", y).replace("{s}", "abc"[(xw + y) % 3]).replace("{r}", "");
    this.tilesEl.appendChild(img);
    this.tiles[key] = img;
    return img;
  };

  P._drawRoutes = function (w, h, tlx, tly) {
    var svg = this.svg, z = this.z, routes = this.routes, i, j;
    svg.setAttribute("width", w); svg.setAttribute("height", h);
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    while (this.routeEls.length < routes.length * 2) {
      var pth = document.createElementNS(SVGNS, "path");
      svg.appendChild(pth); this.routeEls.push(pth);
    }
    for (i = this.routeEls.length - 1; i >= routes.length * 2; i--) { this.routeEls[i].remove(); this.routeEls.pop(); }
    // Las alternativas primero y la elegida encima
    var order = routes.map(function (r, k) { return k; }).sort(function (a, b) { return (routes[a].selected ? 1 : 0) - (routes[b].selected ? 1 : 0); });
    order.forEach(function (ri, slot) {
      var r = routes[ri], d = "", lx = -1e9, ly = -1e9, pts = r.pts || [];
      for (j = 0; j < pts.length; j++) {
        var p = project(pts[j][1], pts[j][0], z), px = p.x - tlx, py = p.y - tly;
        if (j === 0 || j === pts.length - 1 || Math.abs(px - lx) + Math.abs(py - ly) > 2) {
          d += (d ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1);
          lx = px; ly = py;
        }
      }
      var casing = this.routeEls[slot * 2], line = this.routeEls[slot * 2 + 1];
      casing.setAttribute("d", d); line.setAttribute("d", d);
      casing.setAttribute("class", "tm__route-casing" + (r.selected ? " is-sel" : " is-alt"));
      line.setAttribute("class", "tm__route" + (r.selected ? " is-sel" : " is-alt"));
    }, this);
  };

  /* ---------- Interacción ---------- */
  P._bind = function () {
    var self = this, el = this.root, ptrs = {}, count = 0;
    var drag = null, pinch = null, lp = null, lastWheel = 0;
    el.style.touchAction = "none";

    function pos(e) { var r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function dist() { var k = Object.keys(ptrs); if (k.length < 2) return 0; var a = ptrs[k[0]], b = ptrs[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y); }
    function mid() { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

    el.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("[data-tm-ignore]")) return;
      var p = pos(e);
      ptrs[e.pointerId] = p; count++;
      try { el.setPointerCapture(e.pointerId); } catch (er) {}
      if (count === 1) {
        var c = project(self.center.lat, self.center.lon, self.z);
        drag = { sx: p.x, sy: p.y, cx: c.x, cy: c.y, moved: false, t: Date.now() };
        clearTimeout(lp);
        lp = setTimeout(function () {
          if (drag && !drag.moved) { drag.long = true; var ll = self.fromScreen(drag.sx, drag.sy); self.emit("longpress", { lat: ll.lat, lon: ll.lon, x: drag.sx, y: drag.sy }); }
        }, 650);
      } else if (count === 2) {
        clearTimeout(lp);
        pinch = { d0: dist(), m: mid() };
        if (drag) drag.moved = true;
      }
    });

    el.addEventListener("pointermove", function (e) {
      if (!ptrs[e.pointerId]) return;
      var p = pos(e); ptrs[e.pointerId] = p;
      if (count === 1 && drag) {
        var dx = p.x - drag.sx, dy = p.y - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) > 7) { drag.moved = true; clearTimeout(lp); self.emit("userpan"); }
        if (drag.moved) {
          self.center = unproject(drag.cx - dx, drag.cy - dy, self.z);
          self.center.lat = Math.max(-85, Math.min(85, self.center.lat));
          self.render();
        }
      } else if (count === 2 && pinch) {
        pinch.d = dist(); pinch.m = mid();
      }
    });

    function up(e) {
      if (!ptrs[e.pointerId]) return;
      var wasCount = count;
      delete ptrs[e.pointerId]; count = Math.max(0, count - 1);
      try { el.releasePointerCapture(e.pointerId); } catch (er) {}
      if (wasCount === 2 && pinch && pinch.d) {
        var ratio = pinch.d / pinch.d0;
        if (ratio > 1.3) self.setZoom(self.z + (ratio > 2.4 ? 2 : 1), pinch.m.x, pinch.m.y);
        else if (ratio < 0.75) self.setZoom(self.z - (ratio < 0.4 ? 2 : 1), pinch.m.x, pinch.m.y);
        self.emit("userpan");
        pinch = null;
      }
      if (count === 0) {
        clearTimeout(lp);
        if (drag && !drag.moved && !drag.long && e.type === "pointerup" && Date.now() - drag.t < 600) {
          var ll = self.fromScreen(drag.sx, drag.sy);
          self.emit("tap", { lat: ll.lat, lon: ll.lon, x: drag.sx, y: drag.sy });
        }
        drag = null; pinch = null;
      }
    }
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);

    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      var now = Date.now();
      if (now - lastWheel < 160) return;
      lastWheel = now;
      var p = pos(e);
      self.setZoom(self.z + (e.deltaY < 0 ? 1 : -1), p.x, p.y);
      self.emit("userpan");
    }, { passive: false });

    el.addEventListener("dblclick", function (e) {
      var p = pos(e);
      self.setZoom(self.z + 1, p.x, p.y);
      self.emit("userpan");
    });
  };

  TileMap.project = project;
  TileMap.unproject = unproject;
  TileMap.haversine = haversine;
  root.TileMap = TileMap;
})(window);
