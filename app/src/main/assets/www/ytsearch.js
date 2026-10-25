/* ==========================================================
   YTSEARCH — búsqueda de videos de YouTube sin clave de API
   Usa instancias públicas de Piped e Invidious (APIs abiertas
   de terceros). Prueba una por una y recuerda la que funciona.
   No hay garantía de disponibilidad: si todas fallan, la
   búsqueda avisa y queda la opción de pegar/compartir enlaces.
   YTSearch.search("texto") -> Promise<[{id,title,artist,thumb,dur}]>
   ========================================================== */
(function (root) {
  "use strict";

  var SOURCES = [
    { t: "piped", u: "https://pipedapi.kavin.rocks" },
    { t: "piped", u: "https://api.piped.private.coffee" },
    { t: "piped", u: "https://pipedapi.adminforge.de" },
    { t: "invidious", u: "https://inv.nadeko.net" },
    { t: "invidious", u: "https://yewtu.be" }
  ];
  var KEY = "radio-ytsearch-ok";
  var good = null;
  try { good = localStorage.getItem(KEY); } catch (e) {}

  function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); }); }

  function get(url) {
    var ctl = root.AbortController ? new AbortController() : null;
    var req = fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
    return Promise.race([req, timeout(6000)]).catch(function (e) { if (ctl) try { ctl.abort(); } catch (x) {} throw e; });
  }

  function idFrom(u) { var m = String(u || "").match(/[?&]v=([\w-]{11})/); return m ? m[1] : ""; }

  function parse(src, d) {
    var out = [];
    if (src.t === "piped") {
      (d && d.items || []).forEach(function (i) {
        var id = idFrom(i.url);
        if (id && (!i.type || i.type === "stream")) out.push({ id: id, title: i.title || "", artist: (i.uploaderName || "").replace(/ - Topic$/, ""), thumb: i.thumbnail || "", dur: i.duration || 0 });
      });
    } else {
      (Array.isArray(d) ? d : []).forEach(function (i) {
        if (i.type === "video" && /^[\w-]{11}$/.test(i.videoId || "")) out.push({ id: i.videoId, title: i.title || "", artist: i.author || "", thumb: "https://i.ytimg.com/vi/" + i.videoId + "/mqdefault.jpg", dur: i.lengthSeconds || 0 });
      });
    }
    return out;
  }

  function query(src, q) {
    var url = src.t === "piped"
      ? src.u + "/search?filter=videos&q=" + encodeURIComponent(q)
      : src.u + "/api/v1/search?type=video&q=" + encodeURIComponent(q);
    return get(url).then(function (d) {
      var r = parse(src, d);
      if (!r.length && !(d && (d.items || Array.isArray(d)))) throw new Error("bad");
      return r;
    });
  }

  function search(q) {
    var list = SOURCES.slice().sort(function (a, b) { return (b.u === good) - (a.u === good); });
    var i = 0;
    function next() {
      if (i >= list.length) return Promise.reject(new Error("No se pudo buscar en YouTube ahora mismo. Pega o comparte el enlace de la canción."));
      var src = list[i++];
      return query(src, q).then(function (r) {
        good = src.u; try { localStorage.setItem(KEY, good); } catch (e) {}
        return r;
      }, next);
    }
    return next();
  }

  root.YTSearch = { search: search };
})(window);
