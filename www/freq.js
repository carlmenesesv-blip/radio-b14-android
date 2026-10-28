/* ==========================================================
   FREQ — apps más usadas (se ordena sola según tus costumbres)
   · Cada vez que se abre una app (evento radio:applaunch) se suma un uso
     que pierde peso con el tiempo (vida media de 14 días) y se anota a qué
     hora del día fue.
   · La puntuación mezcla lo usado en general con lo usado a esta hora, así
     por la mañana sube la app del trabajo y de noche la música.
   Almacenamiento: "radio-usage". API: RadioFreq.top(n) · reset()
   ========================================================== */
(function () {
  "use strict";
  var card = document.getElementById("freq");
  var grid = document.getElementById("freq-grid");
  if (!card || !grid) return;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "radio-usage", HALF = 14 * 24 * 3600 * 1000, MAXN = 4;
  var data = load();

  function load() {
    try { var d = JSON.parse(localStorage.getItem(KEY)); if (d && d.apps) return d; } catch (e) {}
    return { apps: {} };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function decay(dt) { return Math.pow(0.5, dt / HALF); }
  function hourOf(ts) { return new Date(ts).getHours(); }
  // Franja de 3 horas alrededor de la hora actual, para que 8:55 y 9:05 cuenten parecido
  function band(h) { return [(h + 23) % 24, h, (h + 1) % 24]; }

  function record(d) {
    if (!d || !d.id) return;
    var now = Date.now(), r = data.apps[d.id] || { s: 0, t: now, h: [], name: d.name };
    var k = decay(now - r.t);
    r.s = r.s * k + 1;
    r.h = (r.h && r.h.length === 24 ? r.h : new Array(24).fill(0)).map(function (v) { return v * k; });
    r.h[hourOf(now)] += 1;
    r.t = now; r.name = d.name || r.name;
    data.apps[d.id] = r;
    save(); render();
  }

  function score(r, now) {
    var k = decay(now - r.t), h = band(hourOf(now));
    var hv = r.h && r.h.length === 24 ? (r.h[h[0]] * 0.5 + r.h[h[1]] + r.h[h[2]] * 0.5) * k : 0;
    return r.s * k + 1.5 * hv;
  }

  function top(n) {
    var A = window.RadioApps; if (!A) return [];
    var list = A.list(), now = Date.now();
    var byId = {}; list.forEach(function (a) { byId[a.id] = a; });
    var out = [];
    Object.keys(data.apps).forEach(function (id) {
      var a = byId[id]; if (!a) return;           // la app ya no está instalada
      out.push({ app: a, score: score(data.apps[id], now), n: data.apps[id].s });
    });
    out.sort(function (x, y) { return y.score - x.score; });
    return out.slice(0, n || MAXN);
  }

  function render() {
    var A = window.RadioApps; if (!A) return;
    var items = top(MAXN).map(function (x) { return x.app; });
    var learned = items.length > 0;
    if (!learned) items = A.list().slice(0, MAXN);          // mientras no haya costumbres: las primeras apps
    grid.textContent = "";
    card.dataset.empty = learned ? "false" : "true";
    items.forEach(function (app) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "freq__app"; b.setAttribute("role", "listitem");
      b.appendChild(A.icon(app, "lg"));
      var n = document.createElement("span"); n.className = "freq__name"; n.textContent = app.name; b.appendChild(n);
      b.addEventListener("click", function () { A.open(app.id); });
      grid.appendChild(b);
    });
    card.hidden = !items.length;
  }

  window.addEventListener("radio:applaunch", function (e) { record(e.detail); });
  window.addEventListener("radio:appschanged", render);
  // Se vuelve a ordenar cada 10 min (cambia la hora del día)
  setInterval(render, 10 * 60 * 1000);

  window.RadioFreq = { top: function (n) { return top(n).map(function (x) { return x.app; }); }, reset: function () { data = { apps: {} }; save(); render(); }, record: record };
  render();
})();
