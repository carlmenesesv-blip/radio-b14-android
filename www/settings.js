/* ==========================================================
   SETTINGS — apariencia: fondo, desenfoque, texto y acento
   - Se carga en <head> para aplicar los valores guardados
     antes de pintar (evita parpadeos).
   - La interfaz de la sección se enlaza cuando el DOM está listo.
   ========================================================== */
(function () {
  "use strict";

  var KEY = "radio-settings";
  var WP_KEY = "radio-wallpaper";
  var root = document.documentElement;

  var DEFAULTS = { wallpaper: "theme", solid: "#1c1c20", textScale: 1, accent: null };

  var SOLIDS = [
    ["Negro", "#000000"], ["Grafito", "#1c1c20"], ["Azul noche", "#0b1424"], ["Verde bosque", "#0c1a14"],
    ["Vino", "#1c0a10"], ["Gris claro", "#e3e3e6"], ["Blanco", "#f5f5f7"], ["Arena", "#ece4d6"]
  ];
  var ACCENTS = [
    ["Rojo", "#ff3b30"], ["Naranja", "#ff9f0a"], ["Amarillo", "#ffd60a"], ["Verde", "#30d158"],
    ["Turquesa", "#40c8e0"], ["Azul", "#0a84ff"], ["Violeta", "#bf5af2"], ["Rosa", "#ff375f"]
  ];

  var settings = load();
  var image = readImage();
  var tab = settings.wallpaper;

  apply();

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  /* ---------- Almacenamiento ---------- */
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    return Object.assign({}, DEFAULTS, s || {});
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
  }
  function readImage() {
    try { return localStorage.getItem(WP_KEY) || null; } catch (e) { return null; }
  }

  /* ---------- Utilidades de color ---------- */
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function contrast(hex) {
    var n = parseInt(hex.slice(1), 16);
    var lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? "#0a0a0c" : "#ffffff";
  }

  /* ---------- Aplicar al documento ---------- */
  function apply() {
    root.style.setProperty("--blur", "0px");   // sin desenfoque en todo el sistema
    root.style.setProperty("--text-scale", String(settings.textScale));

    if (settings.accent) {
      root.style.setProperty("--accent", settings.accent);
      root.style.setProperty("--accent-soft", rgba(settings.accent, 0.18));
      root.style.setProperty("--accent-fg", contrast(settings.accent));
      root.setAttribute("data-accent", "custom");
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-soft");
      root.style.removeProperty("--accent-fg");
      root.removeAttribute("data-accent");
    }

    var mode = settings.wallpaper;
    if (mode === "image" && !image) mode = "theme";
    root.setAttribute("data-wallpaper", mode);

    if (mode === "solid") root.style.setProperty("--bg", settings.solid);
    else root.style.removeProperty("--bg");

    if (mode === "image") root.style.setProperty("--wallpaper-image", 'url("' + image + '")');
    else root.style.removeProperty("--wallpaper-image");
  }

  /* ---------- Interfaz ---------- */
  function init() {
    var wpSeg = document.getElementById("set-wallpaper");
    if (!wpSeg) return;

    var panels = {
      solid: document.getElementById("set-panel-solid"),
      image: document.getElementById("set-panel-image")
    };
    var solidBox = document.getElementById("set-solid");
    var solidCustom = document.getElementById("set-solid-custom");
    var preview = document.getElementById("set-wp-preview");
    var msgEl = document.getElementById("set-wp-msg");
    var fileIn = document.getElementById("set-wp-file");
    var chooseBtn = document.getElementById("set-wp-choose");
    var removeBtn = document.getElementById("set-wp-remove");
    var scaleSeg = document.getElementById("set-textscale");
    var accentBox = document.getElementById("set-accent");
    var accentCustom = document.getElementById("set-accent-custom");
    var resetBtn = document.getElementById("set-reset");

    /* --- Muestras de color --- */
    function buildSwatches(box, list, onPick, withDefault) {
      if (withDefault) {
        var d = document.createElement("button");
        d.type = "button";
        d.className = "swatch swatch--default";
        d.dataset.color = "";
        d.setAttribute("aria-label", "Predeterminado");
        d.addEventListener("click", function () { onPick(null); });
        box.appendChild(d);
      }
      list.forEach(function (item) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "swatch";
        b.style.setProperty("--c", item[1]);
        b.dataset.color = item[1];
        b.setAttribute("aria-label", item[0]);
        b.addEventListener("click", function () { onPick(item[1]); });
        box.appendChild(b);
      });
    }

    function pickSolid(color) {
      settings.solid = color;
      settings.wallpaper = "solid";
      tab = "solid";
      commit();
    }
    function pickAccent(color) {
      settings.accent = color;
      commit();
    }

    buildSwatches(solidBox, SOLIDS, pickSolid, false);
    buildSwatches(accentBox, ACCENTS, pickAccent, true);

    /* --- Render de la interfaz --- */
    function render() {
      wpSeg.querySelectorAll(".seg__btn").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.value === tab));
      });
      panels.solid.hidden = tab !== "solid";
      panels.image.hidden = tab !== "image";

      solidBox.querySelectorAll(".swatch").forEach(function (b) {
        b.setAttribute("aria-pressed", String(settings.wallpaper === "solid" && b.dataset.color === settings.solid));
      });
      solidCustom.value = settings.solid;

      if (image) {
        preview.style.backgroundImage = 'url("' + image + '")';
        preview.removeAttribute("data-empty");
      } else {
        preview.style.backgroundImage = "";
        preview.setAttribute("data-empty", "");
      }
      removeBtn.disabled = !image;

      scaleSeg.querySelectorAll(".seg__btn").forEach(function (b) {
        b.setAttribute("aria-pressed", String(Number(b.dataset.value) === settings.textScale));
      });

      accentBox.querySelectorAll(".swatch").forEach(function (b) {
        b.setAttribute("aria-pressed", String((b.dataset.color || null) === settings.accent));
      });
      accentCustom.value = settings.accent || "#ff3b30";
    }

    function commit() {
      save();
      apply();
      render();
    }
    function msg(text) { msgEl.textContent = text || ""; }

    /* --- Tipo de fondo --- */
    wpSeg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg__btn");
      if (!b) return;
      tab = b.dataset.value;
      if (tab === "theme") settings.wallpaper = "theme";
      else if (tab === "solid") settings.wallpaper = "solid";
      else settings.wallpaper = image ? "image" : "theme";
      msg("");
      commit();
    });

    solidCustom.addEventListener("input", function () { pickSolid(solidCustom.value); });

    /* --- Imagen de fondo --- */
    chooseBtn.addEventListener("click", function () { fileIn.click(); });
    fileIn.addEventListener("change", function () {
      var file = fileIn.files && fileIn.files[0];
      fileIn.value = "";
      if (file) processFile(file);
    });
    removeBtn.addEventListener("click", function () {
      try { localStorage.removeItem(WP_KEY); } catch (e) {}
      image = null;
      settings.wallpaper = "theme";
      msg("");
      commit();
    });

    function shrink(img, max, quality) {
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", quality);
    }

    function processFile(file) {
      msg("Procesando imagen…");
      var reader = new FileReader();
      reader.onerror = function () { msg("No se pudo leer el archivo."); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { msg("El archivo no es una imagen válida."); };
        img.onload = function () {
          var attempts = [[1920, 0.82], [1280, 0.7], [960, 0.6]];
          for (var i = 0; i < attempts.length; i++) {
            var url = shrink(img, attempts[i][0], attempts[i][1]);
            try {
              localStorage.setItem(WP_KEY, url);
              image = url;
              settings.wallpaper = "image";
              tab = "image";
              msg("Fondo aplicado.");
              commit();
              return;
            } catch (e) { /* cuota llena: reintenta más pequeña */ }
          }
          msg("La imagen es demasiado grande para guardarse.");
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }

    /* --- Tamaño de texto --- */
    scaleSeg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg__btn");
      if (!b) return;
      settings.textScale = Number(b.dataset.value);
      commit();
    });

    /* --- Acento --- */
    accentCustom.addEventListener("input", function () { pickAccent(accentCustom.value); });

    /* --- Restablecer (dos toques para confirmar) --- */
    var armed = false, timer = null;
    function disarm() {
      armed = false;
      resetBtn.textContent = "Restablecer apariencia";
      resetBtn.removeAttribute("data-armed");
    }
    resetBtn.addEventListener("click", function () {
      if (!armed) {
        armed = true;
        resetBtn.textContent = "Toca de nuevo para confirmar";
        resetBtn.setAttribute("data-armed", "");
        timer = setTimeout(disarm, 3000);
        return;
      }
      clearTimeout(timer);
      disarm();
      settings = Object.assign({}, DEFAULTS);
      image = null;
      tab = "theme";
      try { localStorage.removeItem(WP_KEY); } catch (e) {}
      msg("");
      commit();
    });

    render();
  }

  window.RadioSettings = {
    get: function () { return Object.assign({}, settings); }
  };
})();
