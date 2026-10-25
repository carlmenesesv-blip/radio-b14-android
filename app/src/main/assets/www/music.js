/* ==========================================================
   MUSIC — reproductor del sistema con plataformas de música
   Todo se abre dentro de la tarjeta del reproductor.

   Control completo (API oficial de cada plataforma):
     YouTube / YouTube Music  → YouTube IFrame Player API
     Spotify                  → Spotify iFrame API
     SoundCloud               → SoundCloud Widget API
     Archivos / USB / audio   → HTML5 Audio + Media Session
   Reproductor incrustado (sus controles están dentro del iframe):
     Apple Music, Deezer, Tidal
   No disponible: Amazon Music (no ofrece reproductor incrustable).

   Notas: YouTube, la cámara y los iframes piden que la app se sirva
   por http(s) (no file://). Spotify reproduce canciones completas
   solo si hay sesión iniciada dentro del reproductor.

   Todo se añade desde la ventana "Añadir música": buscar (iTunes sin
   clave, YouTube con clave de API propia), pegar un enlace o elegir
   archivos.

   API: RadioMusic.play(url) / toggle() / pause() / next() / prev()
        RadioMusic.get() / open() / add()    Evento: radio:musicchange
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-music";
  var MAX_ITEMS = 50;
  var Q = window.RadioQuick;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    root: $("mp"), host: $("mp-host"), badge: $("mp-badge"), note: $("mp-note"),
    title: $("mp-title"), artist: $("mp-artist"),
    cur: $("mp-cur"), dur: $("mp-dur"), seek: $("mp-seek"),
    prev: $("mp-prev"), play: $("mp-play"), next: $("mp-next"),
    form: $("mp-form"), url: $("mp-url"), paste: $("mp-paste"), msg: $("mp-msg"), err: $("mp-err"),
    list: $("mp-list"), clear: $("mp-clear"), file: $("mp-file"),
    hmCover: $("hm-cover"), hmTitle: $("hm-title"), hmArtist: $("hm-artist"), hmBar: $("hm-bar"),
    hmPrev: $("hm-prev"), hmPlay: $("hm-play"), hmNext: $("hm-next"), hmIco: $("hm-play-ico")
  };
  if (!el.root) return;

  /* ---------- Plataformas ---------- */
  var PLATFORMS = [
    { id: "spotify",    name: "Spotify",       h: 145, mono: "S", ph: "https://open.spotify.com/track/…",       hint: "Canción, álbum, lista o podcast de open.spotify.com." },
    { id: "youtube",    name: "YouTube",       h: 0,   mono: "Y", ph: "https://www.youtube.com/watch?v=…",      hint: "Video o lista de youtube.com y youtu.be." },
    { id: "ytmusic",    name: "YouTube Music", h: 12,  mono: "M", ph: "https://music.youtube.com/watch?v=…",    hint: "Canción o lista de music.youtube.com." },
    { id: "apple",      name: "Apple Music",   h: 350, mono: "A", ph: "https://music.apple.com/…",              hint: "Canción, álbum o lista de music.apple.com." },
    { id: "deezer",     name: "Deezer",        h: 280, mono: "D", ph: "https://www.deezer.com/track/…",         hint: "Canción, álbum o lista de deezer.com." },
    { id: "soundcloud", name: "SoundCloud",    h: 25,  mono: "C", ph: "https://soundcloud.com/…",               hint: "Pista o lista de soundcloud.com." },
    { id: "tidal",      name: "Tidal",         h: 200, mono: "T", ph: "https://tidal.com/track/…",              hint: "Canción, álbum o lista de tidal.com." },
    { id: "local",      name: "USB / Archivos",h: 215, mono: null, ph: "https://…/audio.mp3",                  hint: "Elige archivos de audio del equipo o USB, o pega la dirección de un audio (mp3, aac, ogg…)." }
  ];
  var BY_ID = {};
  PLATFORMS.forEach(function (p) { BY_ID[p.id] = p; });
  BY_ID.web = { id: "web", name: "Enlace de audio", h: 215, mono: "♪" };
  BY_ID.itunes = { id: "itunes", name: "iTunes · vista previa", h: 350, mono: "♪" };
  var NOTES = {
    spotify: "Inicia sesión en Spotify dentro del reproductor para escuchar canciones completas.",
    apple: "Los controles de reproducción están dentro del reproductor de Apple Music.",
    deezer: "Los controles de reproducción están dentro del reproductor de Deezer.",
    tidal: "Los controles de reproducción están dentro del reproductor de Tidal."
  };

  /* ---------- Estado ---------- */
  var saved = loadSaved();
  var items = saved.items;            // lista (los archivos locales viven solo en la sesión)
  var current = null;                 // item cargado en el reproductor
  var adapter = null;
  var ps = { playing: false, pos: 0, dur: 0 };
  var seeking = false;
  var radioWasOn = null;
  var token = 0;

  function loadSaved() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    s = s || {};
    var list = Array.isArray(s.items) ? s.items.filter(function (i) { return i && i.key && i.provider && BY_ID[i.provider] && i.ref; }) : [];
    return { items: list.slice(0, MAX_ITEMS), src: s.src === "youtube" || s.src === "itunes" ? s.src : "", last: s.last || "" };
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        items: items.filter(function (i) { return !i.local; }),
        src: searchSrc,
        last: current && !current.local ? current.key : ""
      }));
    } catch (e) {}
  }

  /* ---------- Utilidades ---------- */
  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function perr(text) { el.err.textContent = text || ""; }
  function fmsg(text, kind) { var n = $("ms-filemsg"); n.textContent = text || ""; if (kind) n.dataset.kind = kind; else delete n.dataset.kind; }
  function msg(text, kind) { el.msg.textContent = text || ""; if (kind) el.msg.dataset.kind = kind; else delete el.msg.dataset.kind; }
  function findItem(key) { for (var i = 0; i < items.length; i++) if (items[i].key === key) return items[i]; return null; }
  function ytThumb(id) { return "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg"; }

  var scripts = {};
  function loadScript(src) {
    if (scripts[src]) return scripts[src];
    scripts[src] = new Promise(function (res, rej) {
      var s = document.createElement("script");
      var t = setTimeout(function () { delete scripts[src]; rej(new Error("timeout")); }, 12000);
      s.src = src; s.async = true;
      s.onload = function () { clearTimeout(t); res(); };
      s.onerror = function () { clearTimeout(t); delete scripts[src]; s.remove(); rej(new Error("load")); };
      document.head.appendChild(s);
    });
    return scripts[src];
  }

  /* ==========================================================
     Detección de enlaces
     ========================================================== */
  function parseLink(raw) {
    var text = String(raw || "").trim();
    if (!text) return { error: "Pega un enlace para reproducir." };

    var m = text.match(/^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]+)$/);
    if (m) return spotifyItem(m[1], m[2], text);

    var u;
    try { u = new URL(/^[a-z]+:\/\//i.test(text) ? text : "https://" + text); } catch (e) { return { error: "Ese enlace no es válido." }; }
    if (!/^https?:$/.test(u.protocol)) return { error: "Solo se aceptan enlaces http o https." };
    var host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    var path = u.pathname;

    if (host === "open.spotify.com") {
      m = path.match(/\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
      return m ? spotifyItem(m[1], m[2], u.href) : { error: "Ese enlace de Spotify no es de una canción, álbum o lista." };
    }

    if (host === "youtube.com" || host === "music.youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
      var prov = host === "music.youtube.com" ? "ytmusic" : "youtube";
      var vid = "";
      if (host === "youtu.be") vid = path.slice(1).split("/")[0];
      else if (/^\/(shorts|embed|live|v)\//.test(path)) vid = path.split("/")[2];
      else vid = u.searchParams.get("v") || "";
      var list = u.searchParams.get("list") || "";
      if (vid && /^[\w-]{11}$/.test(vid)) {
        return { key: prov + ":video:" + vid, provider: prov, kind: "video", ref: vid, url: u.href, thumb: ytThumb(vid) };
      }
      if (list && /^[\w-]{10,}$/.test(list)) {
        return { key: prov + ":playlist:" + list, provider: prov, kind: "playlist", ref: list, url: u.href };
      }
      return { error: "No encontré un video o lista en ese enlace de YouTube." };
    }

    if (host === "soundcloud.com" || host === "on.soundcloud.com") {
      if (host === "soundcloud.com" && path.split("/").filter(Boolean).length < 2) return { error: "Pega el enlace de una pista o lista de SoundCloud, no de un perfil." };
      var isSet = /\/sets\//.test(path);
      return { key: "soundcloud:" + (isSet ? "set" : "track") + ":" + u.origin + u.pathname, provider: "soundcloud", kind: isSet ? "set" : "track", ref: u.href, url: u.href };
    }

    if (host === "music.apple.com" || host === "embed.music.apple.com") {
      if (path.split("/").filter(Boolean).length < 3) return { error: "Pega el enlace de una canción, álbum o lista de Apple Music." };
      return { key: "apple:" + path + u.search, provider: "apple", kind: /[?&]i=/.test(u.search) ? "song" : "album", ref: "https://embed.music.apple.com" + path + u.search, url: u.href };
    }

    if (host === "deezer.com" || host === "widget.deezer.com") {
      m = path.match(/\/(track|album|playlist|episode|show|artist)\/(\d+)/);
      if (!m) return { error: "Pega el enlace de una canción, álbum o lista de Deezer (los enlaces cortos de Deezer no funcionan)." };
      return { key: "deezer:" + m[1] + ":" + m[2], provider: "deezer", kind: m[1], ref: m[1] + "/" + m[2], url: u.href };
    }

    if (host === "tidal.com" || host === "listen.tidal.com" || host === "embed.tidal.com") {
      m = path.match(/\/(track|album|playlist|video)s?\/([\w-]+)/);
      if (!m) return { error: "Pega el enlace de una canción, álbum o lista de Tidal." };
      return { key: "tidal:" + m[1] + ":" + m[2], provider: "tidal", kind: m[1], ref: m[1] + "s/" + m[2], url: u.href };
    }

    if (/(^|\.)music\.amazon\./.test(host) || host === "amazon.com" || host === "amzn.to") {
      return { error: "Amazon Music no permite abrirse dentro de otro reproductor, así que no se puede usar aquí." };
    }

    if (/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(\?|#|$)/i.test(path + u.search)) {
      var name = decodeURIComponent(path.split("/").pop() || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      return { key: "web:" + u.href, provider: "web", kind: "audio", ref: u.href, url: u.href, title: name || "Audio", artist: u.hostname };
    }

    return { error: "No reconozco ese enlace. Funciona con Spotify, YouTube, YouTube Music, Apple Music, Deezer, SoundCloud, Tidal o un audio directo." };
  }

  function spotifyItem(type, id, url) {
    return { key: "spotify:" + type + ":" + id, provider: "spotify", kind: type, ref: "spotify:" + type + ":" + id, url: url };
  }

  function fallbackTitle(it) {
    var p = BY_ID[it.provider];
    if (it.provider === "apple") {
      var seg = it.ref.split("?")[0].split("/").filter(Boolean);
      var slug = seg.length >= 5 ? seg[seg.length - 2] : "";
      if (slug && !/^\d+$/.test(slug)) return decodeURIComponent(slug).replace(/-/g, " ");
    }
    var kinds = { video: "Video", playlist: "Lista", set: "Lista", track: "Pista", song: "Canción", album: "Álbum", episode: "Episodio", show: "Podcast", artist: "Artista", audio: "Audio" };
    return p.name + " · " + (kinds[it.kind] || "Enlace");
  }

  /* Título, autor y portada por oEmbed (si la plataforma lo permite desde el navegador) */
  var OEMBED = {
    youtube:    function (it) { return "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(it.kind === "video" ? "https://www.youtube.com/watch?v=" + it.ref : "https://www.youtube.com/playlist?list=" + it.ref); },
    spotify:    function (it) { return "https://open.spotify.com/oembed?url=" + encodeURIComponent("https://open.spotify.com/" + it.kind + "/" + it.ref.split(":")[2]); },
    soundcloud: function (it) { return "https://soundcloud.com/oembed?format=json&url=" + encodeURIComponent(it.ref); }
  };
  OEMBED.ytmusic = OEMBED.youtube;
  function fetchMeta(it) {
    var f = OEMBED[it.provider];
    if (!f || !window.fetch) return Promise.resolve(null);
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    return fetch(f(it), ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { clearTimeout(t); return j ? { title: j.title || "", artist: j.author_name || "", thumb: j.thumbnail_url || "" } : null; })
      .catch(function () { clearTimeout(t); return null; });
  }

  /* ==========================================================
     Adaptadores — cada uno recibe (item, host, cb) y devuelve la API
     cb: ready(), state({playing,pos,dur}), meta({title,artist,thumb}), ended(), error(texto)
     API: play, pause, seek(seg), next()->bool, prev()->bool, setVolume(0-100, mute), destroy, caps
     ========================================================== */

  /* ----- YouTube / YouTube Music ----- */
  var ytP = null;
  function ytReady() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (ytP) return ytP;
    ytP = new Promise(function (res, rej) {
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) prev(); res(); };
      loadScript("https://www.youtube.com/iframe_api").catch(function (e) { ytP = null; rej(e); });
    });
    return ytP;
  }
  var YT_ERR = {
    2: "YouTube no reconoce ese video.",
    5: "YouTube no pudo reproducir este video.",
    100: "Ese video ya no está disponible.",
    101: "El dueño de este video no permite reproducirlo fuera de YouTube.",
    150: "El dueño de este video no permite reproducirlo fuera de YouTube.",
    153: "YouTube bloqueó la reproducción: abre la app desde http(s) y no desde un archivo local."
  };
  function YouTubeAdapter(item, host, cb) {
    var player = null, timer = null, mounted = true, ready = false, volume = null;
    var isList = item.kind === "playlist", lastVid = "";
    var div = document.createElement("div");
    host.appendChild(div);

    ytReady().then(function () {
      if (!mounted) return;
      var vars = { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, iv_load_policy: 3 };
      if (/^https?:$/.test(location.protocol)) vars.origin = location.origin;
      var cfg = { width: "100%", height: "100%", playerVars: vars, events: { onReady: onReady, onStateChange: onState, onError: onError } };
      if (isList) { vars.listType = "playlist"; vars.list = item.ref; } else cfg.videoId = item.ref;
      player = new window.YT.Player(div, cfg);
    }).catch(function () { cb.error("No se pudo cargar el reproductor de YouTube. Revisa la conexión."); });

    function onReady() {
      ready = true;
      if (volume) apply(volume.v, volume.m);
      cb.ready();
      timer = setInterval(poll, 400);
    }
    function poll() {
      if (!player || !ready) return;
      try {
        var st = player.getPlayerState();
        cb.state({ playing: st === 1 || st === 3, pos: player.getCurrentTime() || 0, dur: player.getDuration() || 0 });
        var vd = player.getVideoData ? player.getVideoData() : null;
        if (vd && vd.video_id && vd.video_id !== lastVid && vd.title) {
          lastVid = vd.video_id;
          cb.meta({ title: vd.title, artist: vd.author || "", thumb: ytThumb(vd.video_id) });
        }
      } catch (e) {}
    }
    function onState(e) {
      if (e.data === 0) {
        if (!isList) { cb.ended(); return; }
        try { if (player.getPlaylistIndex() >= player.getPlaylist().length - 1) cb.ended(); } catch (er) {}
      }
      poll();
    }
    function onError(e) { cb.error(YT_ERR[e.data] || "YouTube no pudo reproducir esto."); }
    function apply(v, m) { try { player.setVolume(v); if (m) player.mute(); else player.unMute(); } catch (e) {} }

    return {
      caps: { seek: true, volume: true },
      play: function () { if (ready) player.playVideo(); },
      pause: function () { if (ready) player.pauseVideo(); },
      seek: function (s) { if (ready) { player.seekTo(s, true); poll(); } },
      next: function () { if (isList && ready) { player.nextVideo(); return true; } return false; },
      prev: function () { if (isList && ready) { player.previousVideo(); return true; } return false; },
      setVolume: function (v, m) { volume = { v: v, m: m }; if (ready) apply(v, m); },
      destroy: function () { mounted = false; clearInterval(timer); try { if (player) player.destroy(); } catch (e) {} div.remove(); }
    };
  }

  /* ----- Spotify ----- */
  var spP = null;
  function spReady() {
    if (spP) return spP;
    spP = new Promise(function (res, rej) {
      window.onSpotifyIframeApiReady = function (api) { res(api); };
      loadScript("https://open.spotify.com/embed/iframe-api/v1").catch(function (e) { spP = null; rej(e); });
    });
    return spP;
  }
  function SpotifyAdapter(item, host, cb) {
    var ctl = null, mounted = true, endedSent = false;
    var div = document.createElement("div");
    host.appendChild(div);

    spReady().then(function (api) {
      if (!mounted) return;
      api.createController(div, { uri: item.ref, width: "100%", height: "100%" }, function (c) {
        if (!mounted) { try { c.destroy(); } catch (e) {} return; }
        ctl = c;
        c.addListener("ready", function () { cb.ready(); try { c.play(); } catch (e) {} });
        c.addListener("playback_update", function (e) {
          var d = e.data || {};
          var pos = (d.position || 0) / 1000, dur = (d.duration || 0) / 1000;
          cb.state({ playing: !d.isPaused, pos: pos, dur: dur });
          if (!d.isPaused) endedSent = false;
          else if (dur > 1 && pos >= dur - 0.6 && !endedSent && item.kind !== "playlist" && item.kind !== "album" && item.kind !== "show") { endedSent = true; cb.ended(); }
        });
      });
    }).catch(function () { cb.error("No se pudo cargar el reproductor de Spotify. Revisa la conexión."); });

    return {
      caps: { seek: true, volume: false },
      play: function () { if (ctl) ctl.resume ? ctl.resume() : ctl.play(); },
      pause: function () { if (ctl) ctl.pause(); },
      seek: function (s) { if (ctl) ctl.seek(s); },
      next: function () { return false; },
      prev: function () { return false; },
      setVolume: function () {},
      destroy: function () { mounted = false; try { if (ctl) ctl.destroy(); } catch (e) {} div.remove(); }
    };
  }

  /* ----- SoundCloud ----- */
  function SoundCloudAdapter(item, host, cb) {
    var w = null, mounted = true, ready = false, isSet = item.kind === "set", volume = null;
    var s = { playing: false, pos: 0, dur: 0 };
    var iframe = document.createElement("iframe");
    iframe.allow = "autoplay";
    iframe.title = "SoundCloud";
    iframe.src = "https://w.soundcloud.com/player/?url=" + encodeURIComponent(item.ref) + "&auto_play=true&hide_related=true&show_comments=false&show_teaser=false&visual=true";
    host.appendChild(iframe);

    loadScript("https://w.soundcloud.com/player/api.js").then(function () {
      if (!mounted) return;
      w = window.SC.Widget(iframe);
      var E = window.SC.Widget.Events;
      w.bind(E.READY, function () { ready = true; if (volume) apply(volume.v, volume.m); cb.ready(); w.play(); readSound(); });
      w.bind(E.PLAY, function () { s.playing = true; cb.state(s); readSound(); });
      w.bind(E.PAUSE, function () { s.playing = false; cb.state(s); });
      w.bind(E.FINISH, function () { s.playing = false; cb.state(s); if (!isSet) cb.ended(); });
      w.bind(E.PLAY_PROGRESS, function (e) { s.pos = (e.currentPosition || 0) / 1000; cb.state(s); });
    }).catch(function () { cb.error("No se pudo cargar el reproductor de SoundCloud. Revisa la conexión."); });

    function readSound() {
      if (!w) return;
      w.getDuration(function (d) { s.dur = (d || 0) / 1000; cb.state(s); });
      w.getCurrentSound(function (snd) {
        if (snd) cb.meta({ title: snd.title || "", artist: (snd.user && snd.user.username) || "", thumb: snd.artwork_url || "" });
      });
    }
    function apply(v, m) { try { w.setVolume(m ? 0 : v); } catch (e) {} }

    return {
      caps: { seek: true, volume: true },
      play: function () { if (ready) w.play(); },
      pause: function () { if (ready) w.pause(); },
      seek: function (sec) { if (ready) { w.seekTo(sec * 1000); s.pos = sec; cb.state(s); } },
      next: function () { if (isSet && ready) { w.next(); return true; } return false; },
      prev: function () { if (isSet && ready) { w.prev(); return true; } return false; },
      setVolume: function (v, m) { volume = { v: v, m: m }; if (ready) apply(v, m); },
      destroy: function () { mounted = false; try { if (w) { w.unbind(window.SC.Widget.Events.PLAY_PROGRESS); } } catch (e) {} iframe.remove(); }
    };
  }

  /* ----- Reproductor incrustado (Apple Music, Deezer, Tidal) ----- */
  function EmbedAdapter(item, host, cb) {
    var iframe = document.createElement("iframe");
    var theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    var src = item.ref;
    iframe.allow = "autoplay *; encrypted-media *; fullscreen *; clipboard-write";
    iframe.title = BY_ID[item.provider].name;
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    if (item.provider === "deezer") src = "https://widget.deezer.com/widget/" + theme + "/" + item.ref + "?autoplay=true&radius=true&tracklist=true";
    else if (item.provider === "tidal") src = "https://embed.tidal.com/" + item.ref;
    else if (item.provider === "apple") iframe.setAttribute("sandbox", "allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation");
    iframe.src = src;
    host.appendChild(iframe);
    setTimeout(cb.ready, 0);
    return {
      caps: { seek: false, volume: false, embed: true },
      play: function () {}, pause: function () {}, seek: function () {},
      next: function () { return false; }, prev: function () { return false; },
      setVolume: function () {},
      destroy: function () { iframe.remove(); }
    };
  }

  /* ----- Archivos y audio directo (HTML5) ----- */
  var NOTE_SVG = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
  function AudioAdapter(item, host, cb) {
    var a = new Audio();
    var art = document.createElement("div");
    art.className = "mp__art"; art.innerHTML = NOTE_SVG;
    host.appendChild(art);
    a.preload = "auto"; a.src = item.ref;
    function emit() { cb.state({ playing: !a.paused && !a.ended, pos: a.currentTime || 0, dur: isFinite(a.duration) ? a.duration : 0 }); }
    a.addEventListener("loadedmetadata", function () { cb.ready(); emit(); });
    ["timeupdate", "durationchange", "play", "pause", "playing", "seeked"].forEach(function (ev) { a.addEventListener(ev, emit); });
    a.addEventListener("ended", function () { emit(); cb.ended(); });
    a.addEventListener("error", function () { cb.error("No se pudo reproducir este archivo o enlace de audio."); });
    var p = a.play(); if (p && p.catch) p.catch(function (e) { if (e && e.name === "NotAllowedError") emit(); });

    return {
      caps: { seek: true, volume: true },
      play: function () { var r = a.play(); if (r && r.catch) r.catch(function () {}); },
      pause: function () { a.pause(); },
      seek: function (s) { a.currentTime = s; },
      next: function () { return false; }, prev: function () { return false; },
      setVolume: function (v, m) { a.volume = Math.max(0, Math.min(1, v / 100)); a.muted = !!m; },
      destroy: function () { a.pause(); a.removeAttribute("src"); a.load(); art.remove(); }
    };
  }

  function makeAdapter(it, cb) {
    switch (it.provider) {
      case "youtube": case "ytmusic": return YouTubeAdapter(it, el.host, cb);
      case "spotify": return SpotifyAdapter(it, el.host, cb);
      case "soundcloud": return SoundCloudAdapter(it, el.host, cb);
      case "apple": case "deezer": case "tidal": return EmbedAdapter(it, el.host, cb);
      default: return AudioAdapter(it, el.host, cb);
    }
  }

  /* ==========================================================
     Reproductor
     ========================================================== */
  function teardown() {
    token++;
    if (adapter) { try { adapter.destroy(); } catch (e) {} adapter = null; }
    el.host.innerHTML = "";
    ps = { playing: false, pos: 0, dur: 0 };
  }

  function load(it) {
    teardown();
    perr("");
    current = it;
    var my = token;
    var cb = {
      ready: function () { if (my !== token) return; el.root.dataset.state = "ready"; render(); },
      state: function (st) {
        if (my !== token) return;
        var wasPlaying = ps.playing;
        ps = { playing: !!st.playing, pos: st.pos || 0, dur: st.dur || 0 };
        if (ps.playing && !wasPlaying) onPlayStart();
        render(true);
      },
      meta: function (m) {
        if (my !== token || !current) return;
        if (m.title) current.title = m.title;
        if (m.artist || m.title) current.artist = m.artist || current.artist || "";
        if (m.thumb) current.thumb = m.thumb;
        var listed = findItem(current.key);
        if (listed && listed !== current) { listed.title = current.title; listed.artist = current.artist; if (current.thumb) listed.thumb = current.thumb; }
        save(); renderList(); render();
      },
      ended: function () { if (my !== token) return; ps.playing = false; goNext(true); },
      error: function (text) {
        if (my !== token) return;
        teardown(); current = it;
        el.root.dataset.state = "idle";
        perr(text);
        render();
      }
    };
    el.root.dataset.state = "loading";
    el.root.dataset.provider = it.provider;
    adapter = makeAdapter(it, cb);
    applyVolume();
    render();
    save(); renderList();
    // Título y portada (si la plataforma los entrega) mientras carga
    if (!it.title || !it.thumb) fetchMeta(it).then(function (m) { if (m && my === token) cb.meta(m); });
  }

  function onPlayStart() {
    // Un solo origen de audio: la radio se pausa si la música empieza
    if (window.RadioTuner && window.RadioTuner.get().power) window.RadioTuner.setPower(false);
    radioWasOn = false;
  }

  function toggle() {
    if (!current) { if (items.length) openItem(items[0]); else msg("Elige una plataforma y pega un enlace.", ""); return; }
    if (!adapter) { load(current); return; }
    if (adapter.caps.embed) return;
    if (ps.playing) adapter.pause(); else adapter.play();
  }
  function pause() { if (adapter && !adapter.caps.embed && ps.playing) adapter.pause(); }

  function queueIndex() { return current ? items.findIndex(function (i) { return i.key === current.key; }) : -1; }
  function goNext(auto) {
    if (adapter && adapter.next()) return;
    var i = queueIndex();
    if (i >= 0 && i + 1 < items.length) openItem(items[i + 1]);
    else if (!auto && items.length && i < 0) openItem(items[0]);
    else { ps.playing = false; render(); }
  }
  function goPrev() {
    if (adapter && adapter.caps.seek && ps.pos > 3) { adapter.seek(0); return; }
    if (adapter && adapter.prev()) return;
    var i = queueIndex();
    if (i > 0) openItem(items[i - 1]);
    else if (adapter && adapter.caps.seek) adapter.seek(0);
  }

  function openItem(it) { load(it); }

  /* Añade a la lista (sin duplicar) y reproduce */
  function addAndPlay(it) {
    var existing = findItem(it.key);
    if (existing) { if (it.local) Object.assign(existing, it); it = existing; }
    else {
      if (!it.title) it.title = fallbackTitle(it);
      if (!it.artist) it.artist = "";
      items.unshift(it);
      if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
    }
    load(it);
  }

  function submitLink(raw) {
    var r = parseLink(raw);
    if (r.error) { msg(r.error, "error"); return false; }
    msg("");
    addAndPlay(r);
    el.url.value = "";
    sheetClose();
    return true;
  }

  /* ---------- Archivos locales ---------- */
  function addFiles(files) {
    var list = Array.prototype.filter.call(files || [], function (f) { return /^audio\//.test(f.type) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i.test(f.name); });
    if (!list.length) { fmsg("Esos archivos no son de audio.", "error"); return; }
    fmsg("");
    var added = list.map(function (f) {
      var key = "local:" + f.name + ":" + f.size + ":" + f.lastModified;
      var it = findItem(key);
      if (it) return it;
      it = { key: key, provider: "web", kind: "audio", local: true, ref: URL.createObjectURL(f),
             title: f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Audio", artist: "Archivo local" };
      return it;
    });
    // Se insertan en orden para que "Siguiente" recorra los archivos elegidos
    for (var i = added.length - 1; i >= 0; i--) if (items.indexOf(added[i]) < 0) items.unshift(added[i]);
    if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
    load(added[0]);
    sheetClose();
  }

  /* ---------- Volumen del sistema ---------- */
  function applyVolume() {
    if (!adapter || !Q) return;
    var q = Q.get();
    adapter.setVolume(q.volume, q.mute);
  }
  window.addEventListener("radio:quickchange", applyVolume);
  window.addEventListener("radio:lockchange", function () {
    if (!ms.root.classList.contains("is-open")) return;
    var cur = ms.tabs.querySelector('.seg__btn[aria-pressed="true"]');
    setTab(cur ? cur.dataset.tab : "bluetooth");
  });

  /* La radio y la música no suenan a la vez */
  window.addEventListener("radio:tunerchange", function (e) {
    var on = !!(e.detail && e.detail.power);
    if (radioWasOn === false && on && ps.playing) pause();
    radioWasOn = on;
  });

  /* ==========================================================
     Interfaz
     ========================================================== */
  function render(light) {
    var it = current;
    var embed = !!(adapter && adapter.caps.embed);
    var canSeek = !!(adapter && adapter.caps.seek && ps.dur > 0);

    el.root.dataset.ctl = !it ? "none" : embed ? "embed" : "full";
    el.badge.textContent = it ? BY_ID[it.provider].name : "Sin reproducción";
    el.note.textContent = it && NOTES[it.provider] ? NOTES[it.provider] : "";
    el.title.textContent = it ? (it.title || fallbackTitle(it)) : "—";
    el.artist.textContent = it ? (it.artist || "") : "";

    el.play.setAttribute("aria-pressed", String(ps.playing));
    el.play.setAttribute("aria-label", ps.playing ? "Pausar" : "Reproducir");
    el.play.disabled = !it;
    el.prev.disabled = !it;
    el.next.disabled = !it;

    if (!seeking) {
      el.seek.disabled = !canSeek;
      var v = canSeek ? Math.round((ps.pos / ps.dur) * 1000) : 0;
      el.seek.value = String(v);
      el.seek.style.setProperty("--val", v / 10 + "%");
      el.cur.textContent = fmt(ps.pos);
    }
    el.dur.textContent = ps.dur > 0 ? fmt(ps.dur) : "0:00";

    renderHome(it, embed, canSeek);
    updateSession();

    if (!light) {
      var rows = el.list.querySelectorAll(".mp__row");
      rows.forEach(function (r) { if (it && r.dataset.key === it.key) r.setAttribute("aria-current", "true"); else r.removeAttribute("aria-current"); });
    }
    window.dispatchEvent(new CustomEvent("radio:musicchange", { detail: { playing: ps.playing, title: it ? it.title || "" : "", artist: it ? it.artist || "" : "", provider: it ? it.provider : "" } }));
  }

  function renderHome(it, embed, canSeek) {
    if (!el.hmTitle) return;
    el.hmTitle.textContent = it ? (it.title || fallbackTitle(it)) : "Sin música";
    el.hmArtist.textContent = it ? (it.artist || BY_ID[it.provider].name) : "Abre Música";
    el.hmBar.style.width = (canSeek ? Math.min(100, (ps.pos / ps.dur) * 100) : 0) + "%";
    el.hmIco.querySelector("use").setAttribute("href", ps.playing ? "#i-pause" : "#i-play");
    el.hmPlay.setAttribute("aria-label", ps.playing ? "Pausar" : "Reproducir");
    el.hmPlay.disabled = embed;
    el.hmPlay.style.opacity = embed ? "0.4" : "";
    if (it && it.thumb) {
      el.hmCover.style.backgroundImage = "url(\"" + it.thumb.replace(/"/g, "%22") + "\")";
      el.hmCover.style.backgroundSize = "cover"; el.hmCover.style.backgroundPosition = "center";
      el.hmCover.style.setProperty("--cover-icon", "0");
    } else {
      el.hmCover.style.backgroundImage = ""; el.hmCover.style.backgroundSize = ""; el.hmCover.style.backgroundPosition = "";
      el.hmCover.style.removeProperty("--cover-icon");
    }
  }

  function makeThumb(it) {
    var d = document.createElement("span");
    d.className = "mp__thumb"; d.style.setProperty("--h", BY_ID[it.provider].h);
    if (it.thumb && !it.local) {
      var img = document.createElement("img");
      img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer"; img.src = it.thumb;
      img.onerror = function () { img.remove(); d.textContent = BY_ID[it.provider].mono || "♪"; };
      d.appendChild(img);
    } else d.textContent = BY_ID[it.provider].mono || "♪";
    return d;
  }

  function renderList() {
    el.list.innerHTML = "";
    items.forEach(function (it) {
      var li = document.createElement("li");
      li.className = "mp__row"; li.dataset.key = it.key;
      if (current && current.key === it.key) li.setAttribute("aria-current", "true");

      var open = document.createElement("button");
      open.type = "button"; open.className = "mp__open";
      var txt = document.createElement("span"); txt.className = "mp__rtxt";
      var t = document.createElement("div"); t.className = "mp__rtitle"; t.textContent = it.title || fallbackTitle(it);
      var s = document.createElement("div"); s.className = "mp__rsub";
      s.textContent = BY_ID[it.provider].name + (it.artist ? " · " + it.artist : "");
      txt.appendChild(t); txt.appendChild(s);
      open.appendChild(makeThumb(it)); open.appendChild(txt);
      open.addEventListener("click", function () { openItem(it); });

      var del = document.createElement("button");
      del.type = "button"; del.className = "mp__del";
      del.setAttribute("aria-label", "Quitar " + (it.title || "elemento") + " de la lista");
      del.innerHTML = '<svg class="icon"><use href="#i-trash"/></svg>';
      del.addEventListener("click", function () { removeItem(it); });

      li.appendChild(open); li.appendChild(del);
      el.list.appendChild(li);
    });
  }

  function removeItem(it) {
    var i = items.indexOf(it);
    if (i < 0) return;
    items.splice(i, 1);
    if (it.local) { try { URL.revokeObjectURL(it.ref); } catch (e) {} }
    if (current && current.key === it.key) { teardown(); current = null; el.root.dataset.state = "idle"; el.root.dataset.provider = ""; }
    save(); renderList(); render();
  }

  /* ---------- Media Session (teclas multimedia, pantalla de bloqueo) ---------- */
  var sessionSet = false;
  function updateSession() {
    if (!("mediaSession" in navigator)) return;
    try {
      if (!sessionSet) {
        sessionSet = true;
        var ms = navigator.mediaSession;
        ms.setActionHandler("play", toggle);
        ms.setActionHandler("pause", toggle);
        ms.setActionHandler("previoustrack", goPrev);
        ms.setActionHandler("nexttrack", function () { goNext(false); });
      }
      if (current) {
        var art = current.thumb && !current.local ? [{ src: current.thumb }] : [];
        navigator.mediaSession.metadata = new window.MediaMetadata({ title: current.title || "", artist: current.artist || BY_ID[current.provider].name, artwork: art });
      }
      navigator.mediaSession.playbackState = ps.playing ? "playing" : "paused";
    } catch (e) {}
  }

  /* ---------- Eventos de la interfaz ---------- */
  el.form.addEventListener("submit", function (e) { e.preventDefault(); submitLink(el.url.value); });
  el.paste.addEventListener("click", function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) { msg("Este navegador no permite pegar automáticamente. Mantén presionado el campo y pega.", ""); el.url.focus(); return; }
    navigator.clipboard.readText().then(function (t) { el.url.value = (t || "").trim(); if (el.url.value) submitLink(el.url.value); else msg("El portapapeles está vacío.", ""); })
      .catch(function () { msg("No se pudo leer el portapapeles. Mantén presionado el campo y pega.", ""); el.url.focus(); });
  });
  el.file.addEventListener("change", function () { addFiles(el.file.files); el.file.value = ""; });
  el.clear.addEventListener("click", function () {
    items.filter(function (i) { return i.local; }).forEach(function (i) { try { URL.revokeObjectURL(i.ref); } catch (e) {} });
    items = []; teardown(); current = null; el.root.dataset.state = "idle"; el.root.dataset.provider = "";
    save(); renderList(); render(); msg("");
  });

  el.play.addEventListener("click", toggle);
  el.prev.addEventListener("click", goPrev);
  el.next.addEventListener("click", function () { goNext(false); });

  el.seek.addEventListener("input", function () {
    seeking = true;
    var v = Number(el.seek.value);
    el.seek.style.setProperty("--val", v / 10 + "%");
    el.cur.textContent = fmt((v / 1000) * ps.dur);
  });
  el.seek.addEventListener("change", function () {
    var v = Number(el.seek.value);
    seeking = false;
    if (adapter && ps.dur > 0) { adapter.seek((v / 1000) * ps.dur); ps.pos = (v / 1000) * ps.dur; }
    render(true);
  });

  /* Tarjeta Media de Home */
  if (el.hmPlay) {
    el.hmPlay.addEventListener("click", function () { if (!current) openMusicView(); else toggle(); });
    el.hmPrev.addEventListener("click", function () { if (!current) openMusicView(); else goPrev(); });
    el.hmNext.addEventListener("click", function () { if (!current) openMusicView(); else goNext(false); });
    var top = el.hmTitle.closest(".media__top");
    if (top) {
      top.style.cursor = "pointer";
      top.addEventListener("click", openMusicView);
    }
  }
  function openMusicView() { if (window.RadioNav) window.RadioNav.show("media"); }

  /* ==========================================================
     Ventana "Añadir música": buscar, pegar enlace o elegir archivos
     ========================================================== */
  var ms = {
    root: $("msheet"), tabs: $("ms-tabs"), src: $("ms-src"), form: $("ms-form"), q: $("ms-q"),
    msg: $("ms-msg"), note: $("ms-note"), results: $("ms-results"),
    key: $("ms-key"), keyInput: $("ms-keyinput"), keySave: $("ms-keysave"), pick: $("ms-pick")
  };
  var YT_KEY = "radio-music-ytkey";
  var ytKey = "";
  try { ytKey = localStorage.getItem(YT_KEY) || ""; } catch (e) {}
  var searchSrc = saved.src || "youtube";
  var sheetFocus = null, searchToken = 0, changingKey = false;

  var NOTE_SRC = {
    itunes: "Reproduce vistas previas de 30 segundos del catálogo de iTunes. No necesita clave.",
    youtube: "Canciones completas desde YouTube, sin clave. Si no responde, pega o comparte el enlace desde el teléfono."
  };

  function smsg(text, kind) { ms.msg.textContent = text || ""; if (kind) ms.msg.dataset.kind = kind; else delete ms.msg.dataset.kind; }

  function isLocked() { return !!(window.RadioSystem && window.RadioSystem.locked()); }
  function setTab(name) {
    var lockedNow = isLocked();
    if (lockedNow && (name === "search" || name === "link")) name = "bluetooth";
    var lockMsg = document.getElementById("ms-lock");
    if (lockMsg) lockMsg.hidden = !lockedNow;
    ms.tabs.querySelectorAll(".seg__btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tab === name)); });
    ms.root.querySelectorAll(".ms-pane").forEach(function (p) { p.hidden = p.dataset.pane !== name; });
  }

  function renderSrc() {
    ms.src.querySelectorAll(".seg__btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.src === searchSrc)); });
    ms.key.hidden = !(searchSrc === "youtube" && changingKey);
    ms.note.textContent = NOTE_SRC[searchSrc] + (searchSrc === "youtube" && ytKey && !changingKey ? "" : "");
    ms.q.disabled = false;
  }

  function sheetOpen(tab) {
    if (ms.root.classList.contains("is-open")) { setTab(tab || "bluetooth"); return; }
    sheetFocus = document.activeElement;
    ms.root.classList.add("is-open");
    ms.root.setAttribute("aria-hidden", "false");
    tab = tab || "bluetooth";
    setTab(tab);
    renderSrc();
    var target = (tab === "link") ? el.url : (tab === "search") ? ms.q : null;
    if (target && !isLocked()) setTimeout(function () { if (ms.root.classList.contains("is-open")) target.focus({ preventScroll: true }); }, 30);
  }
  function sheetClose() {
    if (!ms.root.classList.contains("is-open")) return;
    searchToken++;
    ms.root.classList.remove("is-open");
    ms.root.setAttribute("aria-hidden", "true");
    if (sheetFocus && sheetFocus.focus) sheetFocus.focus({ preventScroll: true });
  }

  /* ----- Búsqueda ----- */
  function decodeHtml(t) { var x = document.createElement("textarea"); x.innerHTML = t || ""; return x.value; }

  function jsonp(url) {
    return new Promise(function (res, rej) {
      var cb = "__radioJsonp" + Date.now();
      var s = document.createElement("script");
      var t = setTimeout(function () { clean(); rej(new Error("timeout")); }, 8000);
      function clean() { clearTimeout(t); delete window[cb]; s.remove(); }
      window[cb] = function (d) { clean(); res(d); };
      s.onerror = function () { clean(); rej(new Error("load")); };
      s.src = url + "&callback=" + cb;
      document.head.appendChild(s);
    });
  }

  function searchItunes(q) {
    var url = "https://itunes.apple.com/search?media=music&entity=song&limit=25&term=" + encodeURIComponent(q);
    var first = window.fetch ? fetch(url).then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); }) : Promise.reject(new Error("nofetch"));
    return first.catch(function () { return jsonp(url); }).then(function (d) {
      return (d.results || []).filter(function (r) { return r.previewUrl; }).map(function (r) {
        return {
          key: "itunes:" + r.trackId, provider: "itunes", kind: "preview", ref: r.previewUrl, url: r.trackViewUrl || "",
          title: r.trackName || "Sin título", artist: r.artistName || "", album: r.collectionName || "",
          thumb: (r.artworkUrl100 || "").replace("100x100", "300x300")
        };
      });
    }, function () { throw new Error("No se pudo buscar en iTunes. Revisa la conexión."); });
  }

  function searchYouTube(q) {
    if (!ytKey) {
      if (!window.YTSearch) return Promise.reject(new Error("La búsqueda de YouTube no está disponible."));
      return window.YTSearch.search(q).then(function (list) {
        return list.map(function (r) {
          return { key: "youtube:video:" + r.id, provider: "youtube", kind: "video", ref: r.id, url: "https://www.youtube.com/watch?v=" + r.id, title: r.title, artist: r.artist, thumb: r.thumb || ytThumb(r.id) };
        });
      });
    }
    var url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=20&q=" +
      encodeURIComponent(q) + "&key=" + encodeURIComponent(ytKey);
    return fetch(url).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (o) {
      if (!o.ok) {
        var reason = o.j && o.j.error && o.j.error.errors && o.j.error.errors[0] && o.j.error.errors[0].reason;
        if (reason === "quotaExceeded") throw new Error("Se agotó la cuota diaria de tu clave de YouTube.");
        throw Object.assign(new Error("YouTube rechazó la clave. Revísala o pega otra."), { needKey: true });
      }
      return (o.j.items || []).filter(function (i) { return i.id && i.id.videoId; }).map(function (i) {
        var id = i.id.videoId, sn = i.snippet || {};
        return {
          key: "youtube:video:" + id, provider: "youtube", kind: "video", ref: id, url: "https://www.youtube.com/watch?v=" + id,
          title: decodeHtml(sn.title), artist: decodeHtml(sn.channelTitle), thumb: (sn.thumbnails && sn.thumbnails.medium && sn.thumbnails.medium.url) || ytThumb(id)
        };
      });
    }).catch(function (e) {
      if (e instanceof TypeError) throw new Error("No se pudo buscar en YouTube. Revisa la conexión.");
      throw e;
    });
  }

  function renderResults(list) {
    ms.results.innerHTML = "";
    list.forEach(function (it) {
      var li = document.createElement("li");
      li.className = "mp__row";
      var open = document.createElement("button");
      open.type = "button"; open.className = "mp__open";
      var txt = document.createElement("span"); txt.className = "mp__rtxt";
      var t = document.createElement("div"); t.className = "mp__rtitle"; t.textContent = it.title;
      var s = document.createElement("div"); s.className = "mp__rsub";
      s.textContent = [it.artist, it.album].filter(Boolean).join(" · ");
      txt.appendChild(t); txt.appendChild(s);
      open.appendChild(makeThumb(it)); open.appendChild(txt);
      open.addEventListener("click", function () { addAndPlay(Object.assign({}, it)); sheetClose(); });
      li.appendChild(open);
      ms.results.appendChild(li);
    });
  }

  function runSearch(q) {
    q = (q || "").trim();
    if (!q) { smsg("Escribe qué quieres escuchar.", ""); return; }
    var my = ++searchToken;
    ms.results.innerHTML = "";
    smsg("Buscando…", "");
    (searchSrc === "youtube" ? searchYouTube(q) : searchItunes(q)).then(function (list) {
      if (my !== searchToken) return;
      renderResults(list);
      smsg(list.length ? "" : "Sin resultados para «" + q + "».", "");
    }).catch(function (e) {
      if (my !== searchToken) return;
      if (e && e.needKey) { changingKey = true; renderSrc(); ms.keyInput.focus({ preventScroll: true }); }
      smsg(e && e.message ? e.message : "No se pudo buscar. Revisa la conexión.", "error");
    });
  }

  /* ----- Eventos de la ventana ----- */
  document.querySelectorAll("[data-ms-open]").forEach(function (b) { b.addEventListener("click", function () { sheetOpen(b.dataset.msOpen || "bluetooth"); }); });
  ms.root.querySelectorAll("[data-ms-close]").forEach(function (b) { b.addEventListener("click", sheetClose); });
  ms.tabs.addEventListener("click", function (e) {
    var b = e.target.closest(".seg__btn"); if (!b) return;
    setTab(b.dataset.tab);
    if (isLocked()) return;
    if (b.dataset.tab === "link") el.url.focus({ preventScroll: true });
    else if (b.dataset.tab === "search") ms.q.focus({ preventScroll: true });
  });
  ms.src.addEventListener("click", function (e) {
    var b = e.target.closest(".seg__btn"); if (!b) return;
    searchSrc = b.dataset.src; changingKey = false; save(); renderSrc();
    ms.results.innerHTML = ""; smsg("", ""); searchToken++;
    if (ms.q.value.trim()) runSearch(ms.q.value);
  });
  ms.form.addEventListener("submit", function (e) { e.preventDefault(); runSearch(ms.q.value); });
  ms.keySave.addEventListener("click", function () {
    var k = ms.keyInput.value.trim();
    if (!k) { smsg("Pega tu clave de API para buscar en YouTube.", "error"); return; }
    ytKey = k; changingKey = false;
    try { localStorage.setItem(YT_KEY, ytKey); } catch (e) {}
    ms.keyInput.value = ""; renderSrc(); smsg("Clave guardada.", "");
    if (ms.q.value.trim()) runSearch(ms.q.value);
  });
  ms.pick.addEventListener("click", function () { el.file.click(); });

  document.addEventListener("keydown", function (e) {
    if (!ms.root.classList.contains("is-open")) return;
    if (e.key === "Escape") { e.preventDefault(); sheetClose(); return; }
    if (e.key === "Tab") {
      var f = Array.prototype.filter.call(ms.root.querySelectorAll("button, input, a[href]"), function (n) {
        return !n.disabled && n.offsetParent !== null && !n.closest("[hidden]");
      });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Inicio ---------- */
  var last = saved.last ? findItem(saved.last) : null;
  if (last) current = last;       // queda listo; se carga al pulsar reproducir
  renderList();
  el.root.dataset.state = "idle";
  renderSrc();
  render();

  var lastCastKey = "";
  window.RadioMusic = {
    play: submitLink, toggle: toggle, pause: pause,
    /* Desde el teléfono: acepta {url,title,artist,thumb,preview} y lo reproduce */
    cast: function (m) {
      var r = m && m.preview ? { key: "itunes:" + (m.track || m.preview), provider: "itunes", kind: "preview", ref: m.preview, url: m.url || "" } : parseLink(m && m.url);
      if (!r || r.error) return { ok: false, error: (r && r.error) || "Enlace no válido." };
      if (m.title) r.title = String(m.title).slice(0, 140);
      if (m.artist) r.artist = String(m.artist).slice(0, 140);
      if (m.thumb && /^https?:/.test(m.thumb)) r.thumb = m.thumb;
      if (m.queue && lastCastKey && findItem(lastCastKey)) {
        /* Varias canciones seguidas: se encolan en orden, después de la anterior */
        if (!findItem(r.key)) {
          if (!r.title) r.title = fallbackTitle(r);
          if (!r.artist) r.artist = "";
          items.splice(items.indexOf(findItem(lastCastKey)) + 1, 0, r);
          if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
        }
        lastCastKey = r.key;
        save(); renderList(); render();
        return { ok: true };
      }
      lastCastKey = r.key;
      addAndPlay(r);
      return { ok: true };
    },
    next: function () { goNext(false); }, prev: goPrev,
    open: openMusicView,
    add: sheetOpen,
    get: function () { return { playing: ps.playing, pos: ps.pos, dur: ps.dur, item: current ? Object.assign({}, current) : null, items: items.length }; }
  };
})();
