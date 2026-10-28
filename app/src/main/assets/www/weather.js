/* ==========================================================
   WEATHER — tarjeta del tiempo (pequeña, en Inicio)
   Datos: Open-Meteo (gratis, sin cuenta). Usa la ubicación del GPS; si aún no
   hay, la última conocida del mapa; si tampoco, San José (Costa Rica).
   Se guarda la última respuesta para mostrarla sin internet.
   Almacenamiento: "radio-weather". API: RadioWeather.refresh() / get()
   ========================================================== */
(function () {
  "use strict";
  var card = document.getElementById("wx");
  if (!card) return;
  var $ = function (id) { return document.getElementById(id); };
  var el = { ico: $("wx-ico"), temp: $("wx-temp"), unit: $("wx-unit"), desc: $("wx-desc"), mm: $("wx-minmax"), rain: $("wx-rain"),
    city: $("wx-city"), rise: $("wx-rise"), set: $("wx-set"), len: $("wx-len"), hum: $("wx-hum"), wind: $("wx-wind"), days: card.querySelectorAll(".wx__day") };
  var PHOTON = "https://photon.komoot.io", DN = ["D", "L", "M", "M", "J", "V", "S"];
  var KEY = "radio-weather", MAP_KEY = "radio-map", FALLBACK = { lat: 9.9281, lon: -84.0907 };
  var TTL = 20 * 60 * 1000, RETRY = 2 * 60 * 1000;
  var S = window.RadioSystem;

  var data = (function () { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } })();
  var busy = false, lastTry = 0;

  /* Código WMO → texto e icono */
  function cond(code, day) {
    if (code === 0) return ["Despejado", "i-w-clear"];
    if (code === 1 || code === 2) return ["Poco nublado", "i-w-part"];
    if (code === 3) return ["Nublado", "i-w-cloud"];
    if (code === 45 || code === 48) return ["Neblina", "i-w-fog"];
    if (code >= 51 && code <= 57) return ["Llovizna", "i-w-rain"];
    if (code >= 61 && code <= 67) return ["Lluvia", "i-w-rain"];
    if (code >= 71 && code <= 77) return ["Nieve", "i-w-snow"];
    if (code >= 80 && code <= 82) return ["Aguaceros", "i-w-rain"];
    if (code === 85 || code === 86) return ["Nieve", "i-w-snow"];
    if (code >= 95) return ["Tormenta", "i-w-storm"];
    return ["—", "i-w-cloud"];
  }
  function fUnit() { return S && S.get("tempUnit") === "f"; }
  function conv(c) { return fUnit() ? c * 9 / 5 + 32 : c; }
  function r(c) { return String(Math.round(conv(c))); }

  function where() {
    var m = window.RadioMap && window.RadioMap.get && window.RadioMap.get();
    if (m && m.pos && isFinite(m.pos.lat)) return { lat: m.pos.lat, lon: m.pos.lon };
    try { var d = JSON.parse(localStorage.getItem(MAP_KEY)); if (d && d.last && isFinite(d.last.lat)) return { lat: d.last.lat, lon: d.last.lon }; } catch (e) {}
    return FALLBACK;
  }

  function hhmm(iso) { return iso ? String(iso).slice(11, 16) : "--:--"; }
  function span(a, b) {
    if (!a || !b) return "—";
    var m = Math.round((new Date(b) - new Date(a)) / 60000);
    return m > 0 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : "—";
  }
  function render() {
    var u = fUnit() ? "°F" : "°C";
    el.unit.textContent = u;
    if (!data) {
      card.dataset.state = "idle"; el.temp.textContent = "--"; el.desc.textContent = "Sin datos del tiempo"; el.mm.textContent = "—";
      el.rain.textContent = "—"; el.hum.textContent = "—"; el.wind.textContent = "—"; el.rise.textContent = el.set.textContent = "--:--"; el.len.textContent = "—";
      return;
    }
    var c = cond(data.code, data.day);
    card.dataset.state = (Date.now() - data.at > 3 * 3600 * 1000) ? "old" : "ok";
    el.temp.textContent = r(data.temp);
    el.desc.textContent = c[0] + (card.dataset.state === "old" ? " · sin conexión" : "");
    el.ico.querySelector("use").setAttribute("href", "#" + c[1]);
    el.mm.textContent = "Mín " + r(data.min) + "° · Máx " + r(data.max) + "°";
    el.rain.textContent = (data.rain == null ? "—" : Math.round(data.rain)) + "%";
    el.hum.textContent = (data.hum == null ? "—" : Math.round(data.hum)) + "%";
    el.wind.textContent = (data.wind == null ? "—" : Math.round(data.wind)) + " km/h";
    el.rise.textContent = hhmm(data.rise); el.set.textContent = hhmm(data.set); el.len.textContent = span(data.rise, data.set);
    el.city.textContent = data.city || "Mi ubicación";
    var wk = data.week || [];
    Array.prototype.forEach.call(el.days, function (li, i) {
      var d = wk[i]; if (!d) { li.hidden = true; return; }
      li.hidden = false;
      var dt = new Date(d.date + "T12:00:00");
      li.querySelector(".wx__dn").textContent = i === 0 ? "Hoy" : DN[dt.getDay()];
      li.querySelector("use").setAttribute("href", "#" + cond(d.code, 1)[1]);
      li.querySelector(".wx__dh").textContent = r(d.max) + "°";
      li.querySelector(".wx__dl").textContent = r(d.min) + "°";
    });
    card.setAttribute("aria-label", "El tiempo en " + (data.city || "tu ubicación") + ": " + r(data.temp) + " " + u + ", " + c[0]);
  }

  // Nombre del lugar (Photon, el mismo servicio del mapa); si falla se queda el último o «Mi ubicación»
  function city(p) {
    if (data && data.city && data.lat != null && Math.abs(data.lat - p.lat) < 0.05 && Math.abs(data.lon - p.lon) < 0.05) return Promise.resolve(data.city);
    return fetch(PHOTON + "/reverse?lang=default&lon=" + p.lon.toFixed(4) + "&lat=" + p.lat.toFixed(4)).then(function (x) { return x.json(); }).then(function (j) {
      var pr = j && j.features && j.features[0] && j.features[0].properties || {};
      return pr.city || pr.county || pr.district || pr.locality || pr.state || pr.name || (data && data.city) || "";
    }).catch(function () { return (data && data.city) || ""; });
  }

  function refresh(force) {
    if (busy || !navigator.onLine && !force) return;
    if (!force && data && data.week && Date.now() - data.at < TTL) return;
    if (Date.now() - lastTry < RETRY && !force) return;
    lastTry = Date.now(); busy = true;
    var p = where();
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + p.lat.toFixed(3) + "&longitude=" + p.lon.toFixed(3) +
      "&current=temperature_2m,weather_code,is_day,relative_humidity_2m,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=7";
    fetch(url).then(function (res) { if (!res.ok) throw new Error("http"); return res.json(); }).then(function (j) {
      var cu = j.current, d = j.daily, week = [];
      for (var i = 0; i < (d.time || []).length; i++) week.push({ date: d.time[i], code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i] });
      data = { at: Date.now(), temp: cu.temperature_2m, code: cu.weather_code, day: cu.is_day, hum: cu.relative_humidity_2m, wind: cu.wind_speed_10m,
        min: d.temperature_2m_min[0], max: d.temperature_2m_max[0], rain: d.precipitation_probability_max[0],
        rise: d.sunrise && d.sunrise[0], set: d.sunset && d.sunset[0], week: week, city: data && data.city, lat: p.lat, lon: p.lon };
      city(p).then(function (n) { if (n) data.city = n; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} render(); });
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
      render();
    }).catch(function () { render(); }).then(function () { busy = false; });
  }

  card.style.cursor = "pointer";
  card.addEventListener("click", function () { refresh(true); });
  window.addEventListener("online", function () { refresh(false); });
  window.addEventListener("radio:systemchange", function (e) { var ch = (e.detail && e.detail.changed) || []; if (ch.indexOf("tempUnit") >= 0) render(); });
  setInterval(function () { refresh(false); }, 5 * 60 * 1000);

  window.RadioWeather = { refresh: function () { refresh(true); }, get: function () { return data ? Object.assign({}, data) : null; } };
  render();
  // Se espera un poco para que el GPS dé la primera posición
  setTimeout(function () { refresh(false); }, 4000);
})();
