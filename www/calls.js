/* ==========================================================
   CALLS — pestaña Llamadas
   · Teclado numérico, recientes y favoritos (se guardan en este equipo).
   · La llamada la hace el teléfono vinculado por Bluetooth: en Android se entrega a
     AndroidBridge.dial(numero) si existe; si no, se abre el marcador con
     AndroidBridge.openUrl("tel:…"); en un navegador, con un enlace tel:.
   · No se puede probar aquí una llamada real: depende del teléfono y de Android.
   Almacenamiento: "radio-calls". API: RadioCalls.dial(numero[, nombre])
   ========================================================== */
(function () {
  "use strict";
  var view = document.querySelector('[data-view="calls"]');
  if (!view) return;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "radio-calls", MAX = 30;

  var num = $("dial-num"), del = $("dial-del"), call = $("dial-call"), fav = $("dial-fav");
  var saveForm = $("dial-save"), nameIn = $("dial-name");
  var tabs = $("calls-tabs"), list = $("calls-items"), empty = $("calls-empty");
  var cur = "", tab = "recent";
  var data = (function () { try { var d = JSON.parse(localStorage.getItem(KEY)); if (d && d.recent && d.favs) return d; } catch (e) {} return { recent: [], favs: [] }; })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  function clean(n) { return String(n || "").replace(/[^0-9+*#]/g, ""); }
  function pretty(n) {
    var d = String(n);
    if (/^\d{8}$/.test(d)) return d.slice(0, 4) + "-" + d.slice(4);     // formato local de 8 dígitos (Costa Rica)
    return d;
  }
  function isFav(n) { return data.favs.some(function (f) { return f.n === n; }); }

  function paintDial() {
    num.textContent = cur ? pretty(cur) : "Marca un número";
    num.dataset.empty = cur ? "false" : "true";
    del.disabled = !cur; call.disabled = !cur; fav.disabled = !cur;
    fav.setAttribute("aria-label", isFav(cur) ? "Quitar de favoritos" : "Guardar en favoritos");
    fav.setAttribute("aria-pressed", String(isFav(cur)));
    if (!cur) saveForm.hidden = true;
  }
  function add(k) { if (cur.length < 20) { cur += k; paintDial(); } }

  function ago(t) {
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "Ahora";
    if (m < 60) return "Hace " + m + " min";
    var h = Math.round(m / 60);
    if (h < 24) return "Hace " + h + " h";
    return new Date(t).toLocaleDateString("es", { day: "numeric", month: "short" });
  }
  function toast(o) { if (window.RadioToast) window.RadioToast.show(o); }

  function place(n, name) {
    n = clean(n); if (!n) return false;
    data.recent = data.recent.filter(function (r) { return r.n !== n; });
    data.recent.unshift({ n: n, name: name || (data.favs.filter(function (f) { return f.n === n; })[0] || {}).name || "", t: Date.now() });
    data.recent.length = Math.min(data.recent.length, MAX);
    save(); paintList();
    var ok = false, AB = window.AndroidBridge || null;
    try {
      if (AB && typeof AB.dial === "function") ok = AB.dial(n) !== false;
      else if (AB && typeof AB.openUrl === "function") ok = AB.openUrl("tel:" + n, "") !== false;
      else { location.href = "tel:" + n; ok = true; }
    } catch (e) { ok = false; }
    toast(ok ? { title: "Llamando a " + (name || pretty(n)), kind: "ok", ms: 2200 } : { title: "No se pudo iniciar la llamada", kind: "bad" });
    return ok;
  }

  function item(r, isFavList) {
    var li = document.createElement("li"); li.className = "calls__item";
    var who = document.createElement("button"); who.type = "button"; who.className = "calls__who";
    var b = document.createElement("b"); b.textContent = r.name || pretty(r.n);
    var s = document.createElement("small"); s.textContent = (r.name ? pretty(r.n) : "") + (r.t ? (r.name ? " · " : "") + ago(r.t) : "");
    who.appendChild(b); if (s.textContent) who.appendChild(s);
    who.addEventListener("click", function () { cur = r.n; paintDial(); });
    var go = document.createElement("button"); go.type = "button"; go.className = "calls__go"; go.setAttribute("aria-label", "Llamar a " + (r.name || pretty(r.n)));
    go.innerHTML = '<svg class="icon"><use href="#i-call"/></svg>';
    go.addEventListener("click", function () { place(r.n, r.name); });
    li.appendChild(who); li.appendChild(go);
    if (isFavList) {
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "calls__rm"; rm.setAttribute("aria-label", "Quitar " + (r.name || pretty(r.n)));
      rm.innerHTML = '<svg class="icon"><use href="#i-close"/></svg>';
      rm.addEventListener("click", function () { data.favs = data.favs.filter(function (f) { return f.n !== r.n; }); save(); paintList(); paintDial(); });
      li.appendChild(rm);
    }
    return li;
  }
  function paintList() {
    list.textContent = "";
    var items = tab === "recent" ? data.recent : data.favs;
    items.forEach(function (r) { list.appendChild(item(r, tab === "favs")); });
    empty.hidden = items.length > 0;
    empty.textContent = tab === "recent" ? "Aún no hay llamadas hechas desde aquí." : "Marca un número y toca la estrella para guardarlo.";
    tabs.querySelectorAll(".seg__btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.value === tab)); });
  }

  view.querySelectorAll(".dial__k").forEach(function (b) { b.addEventListener("click", function () { add(b.dataset.k); }); });
  // «0» mantenido = «+»
  (function () {
    var z = view.querySelector('.dial__k[data-k="0"]'), t = null, long = false;
    z.addEventListener("pointerdown", function () { long = false; t = setTimeout(function () { long = true; cur = cur.slice(0, -1); add("+"); }, 600); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { z.addEventListener(ev, function () { clearTimeout(t); }); });
    z.addEventListener("click", function (e) { if (long) { e.stopImmediatePropagation(); long = false; } }, true);
  })();
  del.addEventListener("click", function () { cur = cur.slice(0, -1); paintDial(); });
  (function () {
    var t = null;
    del.addEventListener("pointerdown", function () { t = setTimeout(function () { cur = ""; paintDial(); }, 700); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { del.addEventListener(ev, function () { clearTimeout(t); }); });
  })();
  call.addEventListener("click", function () { place(cur); });
  fav.addEventListener("click", function () {
    if (!cur) return;
    if (isFav(cur)) { data.favs = data.favs.filter(function (f) { return f.n !== cur; }); save(); paintList(); paintDial(); return; }
    saveForm.hidden = false; nameIn.value = ""; nameIn.focus();
  });
  saveForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = nameIn.value.trim();
    if (cur && !isFav(cur)) { data.favs.push({ n: cur, name: name }); save(); }
    saveForm.hidden = true; tab = "favs"; paintList(); paintDial();
  });
  tabs.addEventListener("click", function (e) { var b = e.target.closest(".seg__btn"); if (b) { tab = b.dataset.value; paintList(); } });

  // Teclado físico cuando la pestaña está abierta y no se escribe en un campo
  document.addEventListener("keydown", function (e) {
    if (!view.classList.contains("is-active") || /^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName)) return;
    if (/^[0-9*#+]$/.test(e.key)) { add(e.key); e.preventDefault(); }
    else if (e.key === "Backspace") { cur = cur.slice(0, -1); paintDial(); }
    else if (e.key === "Enter" && cur) place(cur);
  });
  new MutationObserver(paintList).observe(view, { attributes: true, attributeFilter: ["class"] });

  window.RadioCalls = { dial: function (n, name) { return place(n, name); }, recent: function () { return data.recent.slice(); }, favs: function () { return data.favs.slice(); } };
  paintDial(); paintList();
})();
