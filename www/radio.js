/* ==========================================================
   RADIO — emisoras por internet
   · Directorio: radio-browser.info (público, gratuito). Se muestran las
     emisoras del país elegido (Costa Rica por defecto); el buscador puede ampliar a todo el mundo.
   · La lista se guarda en el equipo (12 h) para abrir rápido y sin conexión.
   · Reproducción con <audio>: se reconecta sola si el stream se corta.
   · Una sola fuente de audio: al sonar la radio se pausa la música y el
     Bluetooth; al sonar la música, la radio se pausa (RadioTuner.setPower).
   Sección: RADIO
   API: RadioTuner.get() / setPower(bool) / play(estación) / next() / prev()
   Evento: radio:tunerchange {power, name}
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-inet";
  var CACHE_PREFIX = "radio-inet-cache-";
  var COUNTRIES_KEY = "radio-inet-countries";
  var COUNTRIES_TTL = 7 * 24 * 3600 * 1000;
  var CACHE_TTL = 12 * 3600 * 1000;
  var SERVERS = [
    "https://de1.api.radio-browser.info",
    "https://de2.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
    "https://at1.api.radio-browser.info"
  ];
  var MAX_FAVS = 30;

  var view = document.querySelector('[data-view="radio"]');
  if (!view) return;
  function $(id) { return document.getElementById(id); }

  var el = {
    root: $("radio"), state: $("radio-state"), fav: $("radio-fav"),
    logo: $("radio-logo"), logoImg: $("radio-logo-img"), initial: $("radio-initial"),
    name: $("radio-name"), rds: $("radio-rds"),
    prev: $("radio-prev"), next: $("radio-next"), power: $("radio-power"),
    presets: $("radio-presets"), q: $("radio-q"), cats: $("radio-cats"),
    list: $("radio-stations"), note: $("radio-list-note"),
    country: $("radio-country"), cc: $("radio-cc"), countryName: $("radio-country-name"),
    cPanel: $("radio-countries"), cBack: $("radio-countries-back"), cq: $("radio-cq"), cList: $("radio-country-list"), cNote: $("radio-countries-note")
  };

  var CATS = {
    news: /news|noticia|talk|actualidad|informaci/,
    sports: /sport|deporte|futbol|fútbol|soccer/,
    faith: /christian|cristian|gospel|religi|catol|católic|evang|worship/,
    music: /music|músic|musica|pop|rock|salsa|reggae|merengue|latin|hits|dance|electr|jazz|classic|bachata|reggaeton|cumbia|ranchera|oldies|top ?40|romant|balada|tropical/
  };

  /* ---------- Estado ---------- */
  function load() {
    var d = { station: null, favs: [], power: false, cat: "all", country: "CR" }, s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!s) return d;
    if (s.station && s.station.url) d.station = s.station;
    if (Array.isArray(s.favs)) d.favs = s.favs.filter(function (f) { return f && f.id && f.url; }).slice(0, MAX_FAVS);
    d.power = s.power === true;
    if (s.cat === "all" || CATS[s.cat]) d.cat = s.cat;
    if (/^[A-Z]{2}$/.test(s.country || "")) d.country = s.country;
    return d;
  }
  var state = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  var all = [];           // emisoras del directorio (Costa Rica)
  var extra = null;       // resultado de la búsqueda mundial (reemplaza a la lista mientras hay búsqueda)
  var status = "idle";    // idle | connecting | live | error | paused
  var retries = 0, retryTimer = null, token = 0;

  /* ---------- Utilidades ---------- */
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function esc(t) { return String(t == null ? "" : t); }
  function toast(o) { if (window.RadioToast) window.RadioToast.show(o); }
  var allowHttp = location.protocol !== "https:" || !!window.AndroidBridge;   // la app Android permite http

  function normalize(s) {
    var url = s.url_resolved || s.url || "";
    if (!url || s.hls === 1 || s.hls === true) return null;
    if (!allowHttp && !/^https:/i.test(url)) return null;
    var name = String(s.name || "").replace(/\s+/g, " ").trim();
    if (!name) return null;
    var tags = String(s.tags || "").toLowerCase().split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    var logo = s.favicon || "";
    if (logo && !allowHttp && !/^https:/i.test(logo)) logo = "";
    return {
      id: s.stationuuid || ("u" + url), name: name.slice(0, 60), url: url, logo: logo,
      tags: tags.slice(0, 6), place: String(s.state || s.country || "").trim(),
      codec: String(s.codec || "").toUpperCase(), kbps: s.bitrate | 0
    };
  }
  function dedupe(list) {
    var seen = {}, out = [];
    list.forEach(function (s) { var k = norm(s.name); if (!seen[k]) { seen[k] = 1; out.push(s); } });
    return out;
  }
  // Etiquetas del directorio (en inglés casi siempre) a español; «music» y similares no aportan y se omiten
  var TAGES = { news: "Noticias", talk: "Conversación", sports: "Deportes", sport: "Deportes", christian: "Cristiana", gospel: "Gospel", pop: "Pop", rock: "Rock",
    salsa: "Salsa", reggae: "Reggae", reggaeton: "Reguetón", latin: "Latina", hits: "Éxitos", dance: "Dance", electronic: "Electrónica", jazz: "Jazz", classical: "Clásica",
    oldies: "Clásicos", "top 40": "Top 40", romantic: "Románticas", bachata: "Bachata", cumbia: "Cumbia", merengue: "Merengue", tropical: "Tropical", community: "Comunitaria",
    culture: "Cultura", educational: "Educativa", religious: "Religiosa", catholic: "Católica", variety: "Variedad", spanish: "En español", "world music": "Del mundo" };
  var TAGSKIP = /^(music|radio|fm|am|online|stream|internet|costa rica|cr|http|www)/;
  function subtitle(s) {
    var bits = [];
    var tg = s.tags.filter(function (t) { return !TAGSKIP.test(t); }).map(function (t) { return TAGES[t] || (t.charAt(0).toUpperCase() + t.slice(1)); });
    tg = tg.filter(function (t, i) { return tg.indexOf(t) === i; }).slice(0, 2);
    if (tg.length) bits.push(tg.join(", "));
    if (s.place) bits.push(s.place);
    return bits.join(" · ") || "Radio por internet";
  }
  function inCat(s, cat) {
    if (cat === "all") return true;
    var t = s.tags.join(" ") + " " + norm(s.name);
    if (cat === "music") return CATS.music.test(t) && !CATS.news.test(t) && !CATS.sports.test(t) && !CATS.faith.test(t);
    return CATS[cat].test(t);
  }

  /* ---------- Directorio ---------- */
  function fetchJson(path, timeout) {
    var i = 0;
    function next() {
      if (i >= SERVERS.length) return Promise.reject(new Error("offline"));
      var base = SERVERS[i++], ctl = window.AbortController ? new AbortController() : null;
      var t = setTimeout(function () { if (ctl) ctl.abort(); }, timeout || 9000);
      return fetch(base + path, ctl ? { signal: ctl.signal } : undefined)
        .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error("http"); return r.json(); })
        .catch(function () { clearTimeout(t); return next(); });
    }
    return next();
  }

  function readCache(cc) {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_PREFIX + cc));
      if (c && Array.isArray(c.list) && c.list.length) return c;
    } catch (e) {}
    return null;
  }
  function writeCache(cc, list) { try { localStorage.setItem(CACHE_PREFIX + cc, JSON.stringify({ t: Date.now(), list: list })); } catch (e) {} }

  var regionNames = null;
  try { if (window.Intl && Intl.DisplayNames) regionNames = new Intl.DisplayNames(["es"], { type: "region" }); } catch (e) {}
  function countryName(cc) { try { return (regionNames && regionNames.of(cc)) || cc; } catch (e) { return cc; } }

  function loadStations(force) {
    var cc = state.country, c = readCache(cc);
    all = c ? c.list : [];
    renderList();
    if (c && !force && Date.now() - c.t < CACHE_TTL) { el.note.textContent = ""; return; }
    el.note.textContent = c ? "" : "Cargando emisoras…";
    fetchJson("/json/stations/search?countrycode=" + cc + "&hidebroken=true&order=clickcount&reverse=true&limit=300").then(function (raw) {
      var list = dedupe(raw.map(normalize).filter(Boolean));
      if (!list.length) throw new Error("empty");
      if (cc !== state.country) { writeCache(cc, list); return; }     // cambió de país mientras cargaba
      all = list; writeCache(cc, list); el.note.textContent = ""; renderList();
    }).catch(function () {
      if (cc !== state.country) return;
      el.note.textContent = all.length ? "Sin conexión: se muestra la última lista guardada." : "No hay emisoras para " + countryName(cc) + " o no hay conexión a internet.";
      renderList();
    });
  }

  function worldSearch(q) {
    el.note.textContent = "Buscando en todo el mundo…";
    fetchJson("/json/stations/search?name=" + encodeURIComponent(q) + "&hidebroken=true&order=clickcount&reverse=true&limit=60").then(function (raw) {
      extra = { q: q, list: dedupe(raw.map(normalize).filter(Boolean)) };
      el.note.textContent = extra.list.length ? "" : "Sin resultados para «" + q + "».";
      renderList();
    }).catch(function () { el.note.textContent = "No se pudo buscar. Revisa la conexión a internet."; });
  }

  /* ---------- Reproducción ---------- */
  var audio = new Audio();
  audio.preload = "none";
  audio.setAttribute("playsinline", "");

  function applyVolume() {
    var q = window.RadioQuick ? window.RadioQuick.get() : { volume: 60, mute: false };
    audio.volume = Math.max(0, Math.min(1, (q.volume || 0) / 100));
    audio.muted = !!q.mute;
  }
  window.addEventListener("radio:quickchange", applyVolume);
  applyVolume();

  function setStatus(s) { status = s; renderNow(); }

  function stopStream() {
    clearTimeout(retryTimer); token++;
    audio.pause(); audio.removeAttribute("src");
    try { audio.load(); } catch (e) {}
  }

  function emitChange() {
    window.dispatchEvent(new CustomEvent("radio:tunerchange", { detail: { power: state.power, name: state.station ? state.station.name : "" } }));
  }

  function takeOver() {
    // Un solo origen de audio
    if (window.RadioMusic && window.RadioMusic.pause) window.RadioMusic.pause();
    if (window.RadioBluetooth && window.RadioBluetooth.get && window.RadioBluetooth.get()) window.RadioBluetooth.set(false);
  }

  function connect(isRetry) {
    var st = state.station; if (!st) return;
    var my = ++token;
    clearTimeout(retryTimer);
    if (!isRetry) retries = 0;
    setStatus("connecting");
    audio.src = st.url;
    applyVolume();
    var p = audio.play();
    if (p && p.catch) p.catch(function (err) {
      if (my !== token) return;
      if (err && err.name === "NotAllowedError") {       // el navegador pide un toque antes de sonar
        state.power = false; save(); setStatus("paused"); renderAll(); emitChange();
      } else if (err && err.name !== "AbortError") fail(my);
    });
  }

  function fail(my) {
    if (my !== token) return;
    if (!navigator.onLine) { setStatus("error"); return; }
    if (retries < 3) { retries++; setStatus("connecting"); retryTimer = setTimeout(function () { if (state.power) connect(true); }, 2000 * retries); }
    else {
      setStatus("error");
      toast({ title: "No se pudo reproducir", text: (state.station ? state.station.name + ". " : "") + "Prueba con otra emisora.", kind: "bad" });
    }
  }

  audio.addEventListener("playing", function () { retries = 0; setStatus("live"); });
  audio.addEventListener("waiting", function () { if (state.power && status === "live") setStatus("connecting"); });
  audio.addEventListener("error", function () { if (state.power) fail(token); });
  audio.addEventListener("ended", function () { if (state.power) fail(token); });    // un stream en vivo no debería terminar: se reconecta
  audio.addEventListener("stalled", function () {
    var my = token;
    setTimeout(function () { if (my === token && state.power && audio.readyState < 3 && status !== "error") { retries = Math.min(retries, 2); fail(my); } }, 8000);
  });
  window.addEventListener("online", function () { if (state.power && state.station && status !== "live") connect(); });

  function play(st) {
    if (!st) return;
    state.station = st; state.power = true; save();
    takeOver();
    connect();
    renderAll(); emitChange(); mediaSession();
  }

  function setPower(on) {
    on = !!on;
    if (on === state.power) return;
    if (on) {
      if (!state.station) { if (all.length) play(all[0]); return; }
      play(state.station); return;
    }
    state.power = false; save();
    stopStream(); setStatus("paused");
    renderAll(); emitChange();
  }

  function currentList() { return visible(); }
  function step(dir) {
    var list = currentList();
    if (!list.length) list = all;
    if (!list.length) return;
    var i = -1;
    for (var k = 0; k < list.length; k++) if (state.station && list[k].id === state.station.id) { i = k; break; }
    var n = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    play(list[n]);
  }

  function mediaSession() {
    if (!("mediaSession" in navigator) || !state.station || !window.MediaMetadata) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: state.station.name, artist: "Radio por internet", artwork: state.station.logo ? [{ src: state.station.logo }] : [] });
      navigator.mediaSession.setActionHandler("play", function () { setPower(true); });
      navigator.mediaSession.setActionHandler("pause", function () { setPower(false); });
      navigator.mediaSession.setActionHandler("nexttrack", function () { step(1); });
      navigator.mediaSession.setActionHandler("previoustrack", function () { step(-1); });
      navigator.mediaSession.playbackState = "playing";
    } catch (e) {}
  }

  /* ---------- Favoritos ---------- */
  function isFav(st) { return !!st && state.favs.some(function (f) { return f.id === st.id; }); }
  function toggleFav() {
    var st = state.station; if (!st) return;
    if (isFav(st)) state.favs = state.favs.filter(function (f) { return f.id !== st.id; });
    else if (state.favs.length >= MAX_FAVS) { toast({ title: "Favoritos llenos", text: "Quita alguno para añadir otro.", kind: "bad" }); return; }
    else state.favs.push(st);
    save(); renderNow(); renderPresets(); renderList();
  }

  /* ---------- Interfaz ---------- */
  var STATUS_TXT = { idle: "Sin emisora", connecting: "Conectando…", live: "En vivo", error: "Sin señal", paused: "Pausada" };

  function setLogo(node, img, ini, st) {
    ini.textContent = st ? st.name.trim().charAt(0).toUpperCase() : "♪";
    img.hidden = true; img.removeAttribute("src");
    if (st && st.logo) {
      img.onload = function () { img.hidden = false; ini.hidden = true; };
      img.onerror = function () { img.hidden = true; ini.hidden = false; };
      ini.hidden = false;
      img.src = st.logo;
    } else ini.hidden = false;
  }

  function renderNow() {
    var st = state.station;
    el.root.dataset.power = state.power ? "on" : "off";
    el.root.dataset.state = status;
    el.state.textContent = STATUS_TXT[status] || "";
    el.state.classList.toggle("is-live", status === "live");
    el.name.textContent = st ? st.name : "Elige una emisora";
    el.rds.textContent = st ? subtitle(st) + (st.codec ? " · " + st.codec + (st.kbps ? " " + st.kbps + " kbps" : "") : "") : "Radio por internet";
    var on = state.power;
    el.power.setAttribute("aria-pressed", String(on));
    el.power.setAttribute("aria-label", on ? "Pausar radio" : "Reproducir radio");
    el.fav.disabled = !st;
    var f = isFav(st);
    el.fav.setAttribute("aria-pressed", String(f));
    el.fav.setAttribute("aria-label", f ? "Quitar de favoritos" : "Guardar en favoritos");
    el.fav.querySelector("span").textContent = f ? "Guardada" : "Favorito";
    if (el.logo.dataset.id !== (st ? st.id : "")) { el.logo.dataset.id = st ? st.id : ""; setLogo(el.logo, el.logoImg, el.initial, st); }
  }

  function tile(st, cls, onTap) {
    var b = document.createElement("button");
    b.type = "button"; b.className = cls; b.dataset.id = st.id;
    var on = state.station && state.station.id === st.id;
    b.setAttribute("aria-pressed", String(!!on));
    var lg = document.createElement("span"); lg.className = cls + "-logo"; lg.setAttribute("aria-hidden", "true");
    var ini = document.createElement("span"); ini.textContent = st.name.trim().charAt(0).toUpperCase(); lg.appendChild(ini);
    if (st.logo) {
      var im = document.createElement("img"); im.alt = ""; im.loading = "lazy"; im.decoding = "async";
      im.onload = function () { ini.hidden = true; lg.appendChild(im); };
      im.src = st.logo;
    }
    var tx = document.createElement("span"); tx.className = cls + "-txt";
    var n = document.createElement("span"); n.className = cls + "-name"; n.textContent = st.name;
    tx.appendChild(n);
    if (cls === "radio__station") { var g = document.createElement("span"); g.className = "radio__station-genre"; g.textContent = subtitle(st); tx.appendChild(g); }
    b.appendChild(lg); b.appendChild(tx);
    b.addEventListener("click", function () { onTap(st); });
    return b;
  }

  function renderPresets() {
    el.presets.textContent = "";
    if (!state.favs.length) {
      var p = document.createElement("p"); p.className = "radio__empty";
      p.textContent = "Toca ☆ en la emisora que suena para guardarla aquí.";
      el.presets.appendChild(p); return;
    }
    var fr = document.createDocumentFragment();
    state.favs.forEach(function (s) { fr.appendChild(tile(s, "radio__preset", play)); });
    el.presets.appendChild(fr);
  }

  function visible() {
    var q = norm(el.q.value).trim();
    var base = extra && extra.q === el.q.value.trim() ? extra.list : all;
    return base.filter(function (s) {
      if (state.cat !== "all" && !inCat(s, state.cat)) return false;
      if (!q) return true;
      return norm(s.name).indexOf(q) >= 0 || norm(s.tags.join(" ")).indexOf(q) >= 0 || norm(s.place).indexOf(q) >= 0;
    });
  }

  function renderList() {
    var list = visible(), q = el.q.value.trim();
    el.list.textContent = "";
    var fr = document.createDocumentFragment();
    list.forEach(function (s) { var li = document.createElement("li"); li.appendChild(tile(s, "radio__station", play)); fr.appendChild(li); });
    el.list.appendChild(fr);
    if (!list.length) {
      var li = document.createElement("li"); li.className = "radio__empty";
      if (!all.length) li.textContent = "Cargando emisoras…";
      else if (q.length >= 2) {
        li.textContent = "No hay resultados en " + countryName(state.country) + ". ";
        var b = document.createElement("button"); b.type = "button"; b.className = "btn-pill radio__world";
        b.textContent = "Buscar «" + q + "» en todo el mundo";
        b.addEventListener("click", function () { worldSearch(q); });
        li.appendChild(document.createElement("br")); li.appendChild(b);
      } else li.textContent = "No hay emisoras en esta categoría.";
      el.list.appendChild(li);
    }
  }

  function renderCats() {
    el.cats.querySelectorAll(".radio__cat").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.cat === state.cat)); });
  }

  function renderAll() { renderNow(); renderPresets(); renderCats(); renderList(); }

  /* ---------- Países ---------- */
  var FALLBACK_CC = ["CR", "MX", "CO", "AR", "CL", "PE", "EC", "VE", "UY", "PY", "BO", "PA", "GT", "SV", "HN", "NI", "DO", "CU", "PR", "ES", "US", "BR", "FR", "IT", "DE", "GB", "PT", "CA", "JP", "KR", "CN", "IN", "AU", "NL", "AT", "CH", "IE", "RU", "TR", "ZA", "EG", "MA", "NG", "JM", "HT", "TT"];
  var countries = null;     // [{cc, n, count}]

  function readCountries() {
    try { var c = JSON.parse(localStorage.getItem(COUNTRIES_KEY)); if (c && Array.isArray(c.list) && c.list.length) return c; } catch (e) {}
    return null;
  }
  function prepareCountries(list) {
    return list.map(function (c) { return { cc: c.cc, n: countryName(c.cc), count: c.count || 0 }; })
      .sort(function (a, b) { if (a.cc === "CR") return -1; if (b.cc === "CR") return 1; return a.n.localeCompare(b.n, "es"); });
  }
  function loadCountries() {
    var c = readCountries();
    if (c) countries = prepareCountries(c.list);
    else countries = prepareCountries(FALLBACK_CC.map(function (cc) { return { cc: cc, count: 0 }; }));
    renderCountries();
    if (c && Date.now() - c.t < COUNTRIES_TTL) return;
    fetchJson("/json/countries?order=stationcount&reverse=true").then(function (raw) {
      var list = raw.filter(function (r) { return r && /^[A-Z]{2}$/.test(r.iso_3166_1 || "") && r.stationcount > 0; })
        .map(function (r) { return { cc: r.iso_3166_1, count: r.stationcount }; });
      if (!list.length) return;
      try { localStorage.setItem(COUNTRIES_KEY, JSON.stringify({ t: Date.now(), list: list })); } catch (e) {}
      countries = prepareCountries(list); renderCountries();
    }).catch(function () { el.cNote.textContent = "Sin conexión: se muestran los países más comunes."; });
  }

  function renderCountryButton() {
    el.cc.textContent = state.country;
    el.countryName.textContent = countryName(state.country);
  }
  function renderCountries() {
    if (!countries) return;
    var q = norm(el.cq.value).trim();
    el.cList.textContent = "";
    var fr = document.createDocumentFragment();
    countries.filter(function (c) { return !q || norm(c.n).indexOf(q) >= 0 || c.cc.toLowerCase() === q; }).forEach(function (c) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.className = "radio__country-item"; b.dataset.cc = c.cc; b.setAttribute("aria-pressed", String(c.cc === state.country));
      var cc = document.createElement("span"); cc.className = "radio__cc"; cc.textContent = c.cc;
      var tx = document.createElement("span"); tx.className = "radio__country-txt";
      var n = document.createElement("b"); n.textContent = c.n; tx.appendChild(n);
      if (c.count) { var sm = document.createElement("small"); sm.textContent = c.count + (c.count === 1 ? " emisora" : " emisoras"); tx.appendChild(sm); }
      b.appendChild(cc); b.appendChild(tx); li.appendChild(b); fr.appendChild(li);
    });
    el.cList.appendChild(fr);
    if (!el.cList.children.length) { var e = document.createElement("li"); e.className = "radio__empty"; e.textContent = "No se encontró ese país."; el.cList.appendChild(e); }
  }
  function openCountries() {
    el.cq.value = ""; el.cNote.textContent = "";
    if (!countries) loadCountries(); else { renderCountries(); loadCountries(); }
    el.cPanel.hidden = false;
  }
  function closeCountries() { el.cPanel.hidden = true; if (document.activeElement && el.cPanel.contains(document.activeElement)) document.activeElement.blur(); }
  function setCountry(cc) {
    closeCountries();
    if (cc === state.country) return;
    state.country = cc; save();
    extra = null; el.q.value = "";
    renderCountryButton();
    loadStations(false);
  }

  /* ---------- Eventos ---------- */
  el.power.addEventListener("click", function () { setPower(!state.power); });
  el.prev.addEventListener("click", function () { step(-1); });
  el.next.addEventListener("click", function () { step(1); });
  el.fav.addEventListener("click", toggleFav);
  el.country.addEventListener("click", openCountries);
  el.cBack.addEventListener("click", closeCountries);
  el.cq.addEventListener("input", renderCountries);
  el.cq.addEventListener("keydown", function (e) { if (e.key === "Enter") el.cq.blur(); });
  el.cList.addEventListener("click", function (e) { var b = e.target.closest(".radio__country-item"); if (b) setCountry(b.dataset.cc); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !el.cPanel.hidden) closeCountries(); });
  el.cats.addEventListener("click", function (e) {
    var b = e.target.closest(".radio__cat"); if (!b) return;
    state.cat = b.dataset.cat; save(); renderCats(); renderList();
  });
  var qTimer = null;
  el.q.addEventListener("input", function () { clearTimeout(qTimer); qTimer = setTimeout(renderList, 120); });
  el.q.addEventListener("keydown", function (e) { if (e.key === "Enter") el.q.blur(); });

  /* ---------- API pública (la usan la música y el Bluetooth) ---------- */
  window.RadioTuner = {
    get: function () { return { power: state.power, name: state.station ? state.station.name : "", status: status }; },
    setPower: setPower,
    play: play,
    next: function () { step(1); },
    prev: function () { step(-1); },
    refresh: function () { loadStations(true); }
  };

  /* ---------- Inicio ---------- */
  renderAll();
  renderCountryButton();
  loadStations(false);

  // Al encender: continúa con la última emisora (ajuste «Radio al encender»)
  var resumeOn = state.power && !!state.station;
  if (state.power) { state.power = false; renderNow(); status = "paused"; renderNow(); }
  if (resumeOn) {
    var started = false;
    var go = function () {
      if (started) return; started = true;
      var s = window.RadioSystem ? window.RadioSystem.get() : {};
      if (s.radioResume !== false) setPower(true);
    };
    if (document.documentElement.getAttribute("data-boot") === "off") setTimeout(go, 600);
    else { window.addEventListener("radio:booted", function () { setTimeout(go, 300); }, { once: true }); setTimeout(go, 9500); }
  }
})();
