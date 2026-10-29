/* ==========================================================
   HA — cliente de Home Assistant (casa inteligente)
   Lee los estados (/api/states), ejecuta servicios (luces, apagadores, escenas, cerraduras,
   cortinas/portones, alarma) y trae imágenes de cámaras (/api/camera_proxy).
   Sin configurar funciona en «modo demostración» con datos de ejemplo.
   En la app de Windows las llamadas pasan por RadioHost.haFetch (sin límites de CORS);
   en un navegador, Home Assistant debe permitir este origen (cors_allowed_origins).
   API: RadioHA {configured, demo, config, setConfig, test, refresh, all, domain, get, name, area, toggle,
        call, setBrightness, snapshot, alarm, hidden, toggleHidden, scenes, lightsOn, onChange, findByName}
   Evento: radio:ha {ok, demo, error}
   Sección: CASA
   ========================================================== */
(function () {
  "use strict";
  var KEY = "radio-ha";
  var DOMAINS = ["light", "switch", "cover", "lock", "fan", "input_boolean", "scene", "script", "camera", "alarm_control_panel", "climate"];
  var cfg = load(), states = [], areas = {}, ok = false, err = "", timer = null, subs = [], lastAt = 0;

  function load() {
    var d = {};
    try { d = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
    return { url: d.url || "", token: d.token || "", hidden: Array.isArray(d.hidden) ? d.hidden : [], demo: d.demo === true };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }
  function base() {
    var u = String(cfg.url || "").trim().replace(/\/+$/, "");
    if (u && !/^https?:\/\//i.test(u)) u = "http://" + u;
    return u;
  }
  function configured() { return !!(base() && cfg.token); }
  function isDemo() { return !configured(); }

  /* ---------- Transporte ---------- */
  function req(path, o) {
    o = o || {};
    var url = base() + path;
    var headers = { Authorization: "Bearer " + cfg.token };
    if (o.body) headers["Content-Type"] = "application/json";
    if (window.RadioHost && typeof window.RadioHost.haFetch === "function") {
      return Promise.resolve(window.RadioHost.haFetch(url, { method: o.method || "GET", headers: headers, body: o.body || null, as: o.as || "json" }));
    }
    return fetch(url, { method: o.method || "GET", headers: headers, body: o.body || undefined, cache: "no-store" }).then(function (r) {
      if (o.as === "image") return r.blob().then(function (b) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res({ ok: r.ok, status: r.status, data: fr.result }); }; fr.readAsDataURL(b); }); });
      if (o.as === "text") return r.text().then(function (t) { return { ok: r.ok, status: r.status, data: t }; });
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, data: j }; }, function () { return { ok: r.ok, status: r.status, data: null }; });
    });
  }

  /* ---------- Demostración ---------- */
  var DEMO = null;
  function demoData() {
    function e(id, state, name, area, extra) { return { entity_id: id, state: state, attributes: Object.assign({ friendly_name: name }, extra || {}), _area: area }; }
    return [
      e("light.sala", "on", "Sala", "Sala", { brightness: 200 }), e("light.cocina", "off", "Cocina", "Cocina", { brightness: 255 }),
      e("light.cuarto", "off", "Cuarto principal", "Cuarto", { brightness: 150 }), e("light.jardin", "on", "Jardín", "Exterior", { brightness: 255 }),
      e("light.garaje", "off", "Garaje", "Exterior", { brightness: 255 }), e("switch.bomba", "off", "Bomba de agua", "Exterior"),
      e("switch.cafetera", "off", "Cafetera", "Cocina"), e("fan.sala", "off", "Ventilador sala", "Sala"),
      e("cover.porton", "closed", "Portón del garaje", "Exterior"), e("lock.puerta", "locked", "Puerta principal", "Sala"),
      e("alarm_control_panel.casa", "armed_home", "Alarma", ""),
      e("scene.llegue", "scening", "Llegué a casa", ""), e("scene.salgo", "scening", "Salgo de casa", ""), e("scene.noche", "scening", "Buenas noches", ""), e("scene.cine", "scening", "Cine", ""),
      e("camera.entrada", "idle", "Entrada", "Exterior"), e("camera.garaje", "idle", "Garaje", "Exterior"), e("camera.patio", "idle", "Patio", "Exterior"), e("camera.sala", "idle", "Sala", "Sala")
    ];
  }

  /* ---------- Estados ---------- */
  function ingest(list) {
    states = (list || []).filter(function (s) { return s && DOMAINS.indexOf(String(s.entity_id).split(".")[0]) >= 0; });
    states.forEach(function (s) { if (areas[s.entity_id] != null) s._area = areas[s.entity_id]; });
  }
  function emit() { var d = { ok: ok, demo: isDemo(), error: err }; subs.forEach(function (f) { try { f(d); } catch (e) {} }); window.dispatchEvent(new CustomEvent("radio:ha", { detail: d })); }

  function refresh() {
    if (isDemo()) { if (!DEMO) DEMO = demoData(); states = DEMO; ok = true; err = ""; lastAt = Date.now(); emit(); return Promise.resolve(true); }
    return req("/api/states").then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.data)) { ok = false; err = r && r.status === 401 ? "Token no válido" : "No se pudo conectar" + (r && r.status ? " (" + r.status + ")" : ""); emit(); return false; }
      ingest(r.data); ok = true; err = ""; lastAt = Date.now();
      if (!Object.keys(areas).length) loadAreas();
      emit(); return true;
    }, function (e) { ok = false; err = "No se pudo conectar"; emit(); return false; });
  }
  function loadAreas() {
    var tpl = "{% set ns = namespace(r={}) %}{% for s in states if s.domain in " + JSON.stringify(DOMAINS).replace(/"/g, "'") + " %}{% set a = area_name(s.entity_id) %}{% if a %}{% set ns.r = ns.r | combine({s.entity_id: a}) %}{% endif %}{% endfor %}{{ ns.r | tojson }}";
    req("/api/template", { method: "POST", body: JSON.stringify({ template: tpl }), as: "text" }).then(function (r) {
      if (!r || !r.ok) return;
      try { var m = JSON.parse(r.data); areas = m || {}; states.forEach(function (s) { if (areas[s.entity_id] != null) s._area = areas[s.entity_id]; }); emit(); } catch (e) {}
    }, function () {});
  }
  function poll(fast) { clearTimeout(timer); timer = setTimeout(function () { refresh().then(function () { poll(fast); }); }, document.documentElement.getAttribute("data-view") === "casa" ? 4000 : 20000); }

  function test(url, token) {
    var old = { url: cfg.url, token: cfg.token };
    cfg.url = url; cfg.token = token;
    return req("/api/").then(function (r) {
      cfg.url = old.url; cfg.token = old.token;
      if (r && r.ok) return { ok: true, msg: (r.data && r.data.message) || "Conectado" };
      return { ok: false, msg: r && r.status === 401 ? "El token no es válido" : "No se pudo conectar" + (r && r.status ? " (" + r.status + ")" : "") };
    }, function () { cfg.url = old.url; cfg.token = old.token; return { ok: false, msg: "No se pudo conectar. Revisa la dirección y la red." }; });
  }

  /* ---------- Consultas ---------- */
  function visible(s) { return cfg.hidden.indexOf(s.entity_id) < 0; }
  function get(id) { for (var i = 0; i < states.length; i++) if (states[i].entity_id === id) return states[i]; return null; }
  function domain(d, includeHidden) { return states.filter(function (s) { return s.entity_id.indexOf(d + ".") === 0 && (includeHidden || visible(s)); }); }
  function name(s) { return (s && s.attributes && s.attributes.friendly_name) || (s && s.entity_id) || ""; }
  function area(s) { return (s && s._area) || ""; }
  function isOn(s) { return !!s && ["on", "open", "unlocked", "opening", "playing", "heat", "cool", "auto"].indexOf(s.state) >= 0; }
  function lightsOn() { return domain("light").filter(isOn).length; }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
  function findByName(q, doms) {
    q = norm(q); if (!q) return null;
    var best = null, score = 0;
    states.forEach(function (s) {
      if (doms && doms.indexOf(s.entity_id.split(".")[0]) < 0) return;
      var n = norm(name(s)), a = norm(area(s)), sc = 0;
      if (n === q) sc = 100; else if (n && q.indexOf(n) >= 0) sc = 60 + n.length; else if (n && n.indexOf(q) >= 0) sc = 40 + q.length;
      else { var w = q.split(" "), hit = w.filter(function (x) { return x.length > 2 && (n.indexOf(x) >= 0 || a.indexOf(x) >= 0); }).length; if (hit) sc = hit * 10; }
      if (sc > score) { score = sc; best = s; }
    });
    return score >= 20 ? best : null;
  }

  /* ---------- Acciones ---------- */
  function call(dom, svc, data) {
    if (isDemo()) { demoCall(dom, svc, data || {}); return Promise.resolve(true); }
    return req("/api/services/" + dom + "/" + svc, { method: "POST", body: JSON.stringify(data || {}) }).then(function (r) { setTimeout(refresh, 400); return !!(r && r.ok); }, function () { return false; });
  }
  function demoCall(dom, svc, data) {
    var ids = [].concat(data.entity_id || []);
    ids.forEach(function (id) {
      var s = get(id); if (!s) return;
      if (svc === "turn_on") { s.state = "on"; if (data.brightness_pct != null) s.attributes.brightness = Math.round(data.brightness_pct * 2.55); }
      else if (svc === "turn_off") s.state = "off";
      else if (svc === "toggle") s.state = s.state === "on" ? "off" : "on";
      else if (svc === "lock") s.state = "locked"; else if (svc === "unlock") s.state = "unlocked";
      else if (svc === "open_cover") s.state = "open"; else if (svc === "close_cover") s.state = "closed";
      else if (svc.indexOf("alarm_arm_home") === 0) s.state = "armed_home"; else if (svc.indexOf("alarm_arm_away") === 0) s.state = "armed_away"; else if (svc === "alarm_disarm") s.state = "disarmed";
    });
    if (dom === "scene" || dom === "script") sceneDemo(ids[0]);
    setTimeout(function () { emit(); }, 30);
  }
  function sceneDemo(id) {
    var S = function (i, st) { var s = get(i); if (s) s.state = st; };
    if (id === "scene.noche") { domain("light", true).forEach(function (s) { s.state = "off"; }); S("lock.puerta", "locked"); S("cover.porton", "closed"); S("alarm_control_panel.casa", "armed_home"); }
    else if (id === "scene.llegue") { S("light.sala", "on"); S("light.jardin", "on"); S("alarm_control_panel.casa", "disarmed"); S("cover.porton", "open"); }
    else if (id === "scene.salgo") { domain("light", true).forEach(function (s) { s.state = "off"; }); S("lock.puerta", "locked"); S("alarm_control_panel.casa", "armed_away"); }
    else if (id === "scene.cine") { domain("light", true).forEach(function (s) { s.state = "off"; }); S("light.sala", "on"); get("light.sala").attributes.brightness = 40; }
  }
  function toggle(id) {
    var s = get(id); if (!s) return Promise.resolve(false);
    var d = id.split(".")[0];
    if (d === "lock") return call("lock", s.state === "locked" ? "unlock" : "lock", { entity_id: id });
    if (d === "cover") return call("cover", isOn(s) ? "close_cover" : "open_cover", { entity_id: id });
    if (d === "scene" || d === "script") return call(d, "turn_on", { entity_id: id });
    return call(d, "toggle", { entity_id: id });
  }
  function setBrightness(id, pct) { return call("light", "turn_on", { entity_id: id, brightness_pct: Math.max(1, Math.min(100, Math.round(pct))) }); }
  function alarm(id, action, code) {
    var svc = { home: "alarm_arm_home", away: "alarm_arm_away", night: "alarm_arm_night", disarm: "alarm_disarm" }[action]; if (!svc) return Promise.resolve(false);
    var d = { entity_id: id }; if (code) d.code = String(code);
    return call("alarm_control_panel", svc, d);
  }
  function allLights(on) { var ids = domain("light").map(function (s) { return s.entity_id; }); if (!ids.length) return Promise.resolve(false); return call("light", on ? "turn_on" : "turn_off", { entity_id: ids }); }

  /* ---------- Cámaras ---------- */
  var demoTick = 0;
  function demoFrame(s) {
    var c = document.createElement("canvas"); c.width = 480; c.height = 270; var g = c.getContext("2d");
    var seed = 0; for (var i = 0; i < s.entity_id.length; i++) seed += s.entity_id.charCodeAt(i);
    var h1 = (seed * 37) % 360;
    var gr = g.createLinearGradient(0, 0, 480, 270); gr.addColorStop(0, "hsl(" + h1 + ",18%,16%)"); gr.addColorStop(1, "hsl(" + (h1 + 40) + ",22%,30%)");
    g.fillStyle = gr; g.fillRect(0, 0, 480, 270);
    g.fillStyle = "rgba(255,255,255,.05)"; for (var k = 0; k < 6; k++) g.fillRect(30 + k * 70 + ((demoTick * 3 + k * 20) % 30), 160, 40, 90);
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, 0, 480, 36);
    g.fillStyle = "#fff"; g.font = "500 18px system-ui"; g.fillText(name(s), 14, 24);
    g.fillStyle = "#ff5a4f"; g.beginPath(); g.arc(452, 18, 6, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,.7)"; g.font = "13px system-ui"; g.fillText("DEMO · " + new Date().toLocaleTimeString("es-CR", { hour12: false }), 14, 258);
    demoTick++;
    return c.toDataURL("image/jpeg", 0.7);
  }
  function snapshot(id) {
    var s = get(id); if (!s) return Promise.resolve("");
    if (isDemo()) return Promise.resolve(demoFrame(s));
    return req("/api/camera_proxy/" + id, { as: "image" }).then(function (r) { return r && r.ok && typeof r.data === "string" ? r.data : ""; }, function () { return ""; });
  }

  /* ---------- Configuración ---------- */
  function setConfig(p) {
    if (p.url != null) cfg.url = String(p.url).trim();
    if (p.token != null) cfg.token = String(p.token).trim();
    states = []; areas = {}; DEMO = null; ok = false; save(); refresh(); poll();
  }
  function toggleHidden(id) { var i = cfg.hidden.indexOf(id); if (i >= 0) cfg.hidden.splice(i, 1); else cfg.hidden.push(id); save(); emit(); }
  function clearHidden() { cfg.hidden = []; save(); emit(); }

  window.addEventListener("radio:systemchange", function () {});
  new MutationObserver(function () { if (document.documentElement.getAttribute("data-view") === "casa" && Date.now() - lastAt > 3000) refresh(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-view"] });

  window.RadioHA = {
    configured: configured, demo: isDemo,
    config: function () { return { url: cfg.url, hasToken: !!cfg.token, hidden: cfg.hidden.slice() }; },
    setConfig: setConfig, test: test, refresh: refresh,
    all: function () { return states.filter(visible); }, domain: domain, get: get, name: name, area: area, isOn: isOn,
    toggle: toggle, call: call, setBrightness: setBrightness, alarm: alarm, allLights: allLights, snapshot: snapshot,
    scenes: function () { return domain("scene").concat(domain("script")); },
    lightsOn: lightsOn, findByName: findByName,
    hidden: function (id) { return cfg.hidden.indexOf(id) >= 0; }, toggleHidden: toggleHidden, clearHidden: clearHidden,
    status: function () { return { ok: ok, demo: isDemo(), error: err, count: states.length }; },
    onChange: function (f) { subs.push(f); }
  };
  refresh(); poll();
})();
