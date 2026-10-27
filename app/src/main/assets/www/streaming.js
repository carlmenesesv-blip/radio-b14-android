/* ==========================================================
   STREAMING — accesos a las apps de música (Spotify, YouTube Music…)
   Abre la app oficial instalada en Android; si no está, la web.
   Sección: MÚSICA · usa RadioApps.openService
   ========================================================== */
(function () {
  "use strict";
  var row = document.getElementById("stream-row");
  if (!row) return;
  var AB = window.AndroidBridge || null;
  var SERVICES = [
    { id: "spotify", name: "Spotify", url: "https://open.spotify.com/", scheme: "spotify:", pkg: "com.spotify.music", c: "#1db954" },
    { id: "ytmusic", name: "YouTube Music", url: "https://music.youtube.com/", scheme: "", pkg: "com.google.android.apps.youtube.music", c: "#ff0033" },
    { id: "youtube", name: "YouTube", url: "https://www.youtube.com/", scheme: "", pkg: "com.google.android.youtube", c: "#e62117" },
    { id: "apple", name: "Apple Music", url: "https://music.apple.com/", scheme: "", pkg: "com.apple.android.music", c: "#fa243c" },
    { id: "deezer", name: "Deezer", url: "https://www.deezer.com/", scheme: "", pkg: "deezer.android.app", c: "#8b5cf6" },
    { id: "amazon", name: "Amazon Music", url: "https://music.amazon.com/", scheme: "", pkg: "com.amazon.mp3", c: "#0ea5e9" },
    { id: "tidal", name: "Tidal", url: "https://listen.tidal.com/", scheme: "", pkg: "com.aspiro.tidal", c: "#27272a" },
    { id: "soundcloud", name: "SoundCloud", url: "https://soundcloud.com/", scheme: "", pkg: "com.soundcloud.android", c: "#ff5500" }
  ];

  function installed(pkg) { try { return !!AB && AB.isInstalled(pkg); } catch (e) { return false; } }

  function build() {
    row.textContent = "";
    // En Android, las instaladas primero
    var list = SERVICES.slice();
    if (AB) list.sort(function (a, b) { return (installed(b.pkg) ? 1 : 0) - (installed(a.pkg) ? 1 : 0); });
    list.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "stream__app"; b.dataset.id = s.id;
      var ico = document.createElement("span"); ico.className = "stream__ico"; ico.style.background = s.c; ico.textContent = s.name.charAt(0);
      var n = document.createElement("span"); n.textContent = s.name;
      b.appendChild(ico); b.appendChild(n);
      b.addEventListener("click", function () {
        if (window.RadioApps && window.RadioApps.openService) window.RadioApps.openService(s);
      });
      row.appendChild(b);
      if (AB && installed(s.pkg)) {   // icono real de la app instalada
        try {
          var d = AB.icon(s.pkg);
          if (d) { var im = new Image(); im.alt = ""; im.src = d; ico.textContent = ""; ico.style.background = "transparent"; ico.appendChild(im); }
        } catch (e) {}
      }
    });
  }
  build();
  window.addEventListener("radio:appschanged", build);
})();
