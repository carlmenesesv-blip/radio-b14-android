/* ==========================================================
   OSK — teclado en pantalla (español) para uso 100 % táctil
   · Aparece al tocar cualquier campo de texto del sistema.
   · Muestra el texto que se escribe sobre las teclas, así nunca queda tapado.
   · Mayúsculas, símbolos, teclado numérico, acentos con pulsación larga,
     teclas útiles para direcciones web (/ .com) y correos (@).
   · Ajuste «Teclado en pantalla»: Auto · Siempre · Nunca.
   Sección: ENTRADA
   API: RadioKeyboard.open(input) · close() · isOpen()
   ========================================================== */
(function () {
  "use strict";

  var ACCENTS = { a: "áà", e: "éè", i: "í", o: "ó", u: "úü", n: "ñ", "?": "¿", "!": "¡", ".": "…", "-": "–—" };
  var TEXT_TYPES = { "": 1, text: 1, search: 1, url: 1, email: 1, tel: 1, number: 1, password: 1 };

  var root, mirrorTxt, mirrorLbl, keysBox, popup;
  var target = null, shift = 0 /* 0 apagado · 1 una vez · 2 fijo */, layer = "abc";
  var repeatT = null, holdT = null, closeT = null, consumed = false, lastShiftTap = 0;

  function sys() { return window.RadioSystem && window.RadioSystem.get ? window.RadioSystem.get() : {}; }
  function enabled() {
    var m = sys().oskMode || "auto";
    if (m === "off") return false;
    if (m === "on") return true;
    return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");   // en celulares ya hay teclado propio
  }
  function eligible(el) {
    if (!el || el.disabled || el.readOnly || el.closest("#osk")) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName !== "INPUT") return false;
    return !!TEXT_TYPES[(el.getAttribute("type") || "").toLowerCase()];
  }
  function kind(el) {
    var t = (el.getAttribute("type") || "").toLowerCase(), m = el.dataset.oskIm || (el.getAttribute("inputmode") || "").toLowerCase();
    if (t === "number" || m === "numeric" || m === "decimal") return { k: "num", dot: t === "number" || m === "decimal" };
    if (t === "tel" || m === "tel") return { k: "num", plus: true };
    if (t === "url" || m === "url") return { k: "url" };
    if (t === "email" || m === "email") return { k: "email" };
    return { k: "text" };
  }

  /* ---------- Construcción ---------- */
  function build() {
    root = document.createElement("div");
    root.id = "osk"; root.className = "osk"; root.hidden = true;
    root.setAttribute("role", "group"); root.setAttribute("aria-label", "Teclado en pantalla");
    root.innerHTML =
      '<div class="osk__top"><div class="osk__mirror" aria-live="off"><span class="osk__lbl"></span><span class="osk__txt"></span><i class="osk__caret"></i></div>' +
      '<button type="button" class="osk__hide" data-act="hide" aria-label="Ocultar teclado"><svg class="icon" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button></div>' +
      '<div class="osk__keys"></div><div class="osk__pop" hidden></div>';
    document.body.appendChild(root);
    mirrorTxt = root.querySelector(".osk__txt"); mirrorLbl = root.querySelector(".osk__lbl");
    keysBox = root.querySelector(".osk__keys"); popup = root.querySelector(".osk__pop");

    // Evita que tocar una tecla le quite el foco al campo
    root.addEventListener("mousedown", function (e) { e.preventDefault(); });
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", cancelHold);
    root.addEventListener("pointerleave", function (e) { if (e.target.closest && e.target.closest(".osk__key")) cancelHold(); }, true);
    root.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  var ROWS = {
    abc: ["qwertyuiop", "asdfghjklñ", "zxcvbnm"],
    sym: ["1234567890", "@#$%&-+()/", "*\"':;!?_"]
  };

  function key(label, act, cls, val) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "osk__key" + (cls ? " " + cls : ""); b.tabIndex = -1;
    b.dataset.act = act || "ch"; if (val != null) b.dataset.v = val;
    if (label && label.charAt(0) === "<") b.innerHTML = label; else b.textContent = label;
    return b;
  }
  function row(cls) { var r = document.createElement("div"); r.className = "osk__row" + (cls ? " " + cls : ""); return r; }
  var ICON = {
    shift: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 4l8 9h-5v6H9v-6H4z"/></svg>',
    back: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 6h11v12H9l-6-6z"/><path d="M13 10l4 4M17 10l-4 4"/></svg>',
    enter: '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg>'
  };

  function render() {
    var kd = target ? kind(target) : { k: "text" };
    keysBox.textContent = "";
    var enterLbl = target && target.getAttribute("enterkeyhint") === "search" ? "Buscar" : (target && target.form ? "Listo" : "Ir");

    if (kd.k === "num" && layer !== "sym") {
      keysBox.classList.add("is-num");
      function put(el, c, r, span) { el.style.gridColumn = c; el.style.gridRow = span ? r + " / span " + span : r; keysBox.appendChild(el); }
      "123456789".split("").forEach(function (c, i) { put(key(c, "ch", "", c), (i % 3) + 1, Math.floor(i / 3) + 1); });
      var extra = kd.dot ? "." : (kd.plus ? "+" : "");
      put(extra ? key(extra, "ch", "osk__key--fn", extra) : key("", "none", "osk__key--ghost"), 1, 4);
      put(key("0", "ch", "", "0"), 2, 4);
      put(key(ICON.back, "back", "osk__key--fn"), 3, 4);
      put(key(enterLbl, "enter", "osk__key--go"), 4, 1, 4);
      return;
    }
    keysBox.classList.remove("is-num");

    var rows = layer === "sym" ? ROWS.sym : ROWS.abc;
    var r1 = row(), r2 = row(), r3 = row(), r4 = row("osk__row--bottom");
    rows[0].split("").forEach(function (c) { r1.appendChild(key(cased(c), "ch", "", c)); });
    rows[1].split("").forEach(function (c) { r2.appendChild(key(cased(c), "ch", "", c)); });
    if (layer === "abc") r3.appendChild(key(ICON.shift, "shift", "osk__key--fn osk__key--w15" + (shift ? " is-on" : "") + (shift === 2 ? " is-lock" : "")));
    else r3.appendChild(key("", "none", "osk__key--ghost osk__key--w15"));
    rows[2].split("").forEach(function (c) { r3.appendChild(key(cased(c), "ch", "", c)); });
    r3.appendChild(key(ICON.back, "back", "osk__key--fn osk__key--w15"));

    r4.appendChild(key(layer === "sym" ? "abc" : "123", "layer", "osk__key--fn osk__key--w15"));
    if (kd.k === "email") r4.appendChild(key("@", "ch", "osk__key--fn", "@"));
    else r4.appendChild(key(kd.k === "url" ? "/" : ",", "ch", "osk__key--fn", kd.k === "url" ? "/" : ","));
    r4.appendChild(key(" ", "ch", "osk__key--space", " "));
    r4.appendChild(key(".", "ch", "osk__key--fn", "."));
    if (kd.k === "url") r4.appendChild(key(".com", "ch", "osk__key--fn osk__key--w15", ".com"));
    if (kd.k === "email") r4.appendChild(key(".com", "ch", "osk__key--fn osk__key--w15", ".com"));
    r4.appendChild(key(enterLbl, "enter", "osk__key--go osk__key--w2"));
    [r1, r2, r3, r4].forEach(function (r) { keysBox.appendChild(r); });
  }
  function cased(c) { return shift && layer === "abc" ? c.toUpperCase() : c; }

  /* ---------- Edición ---------- */
  function emit(el, name) { el.dispatchEvent(new Event(name, { bubbles: true })); }
  function insert(text) {
    var el = target; if (!el) return;
    if (el.maxLength > 0 && el.value.length + text.length > el.maxLength) return;
    try {
      var s = el.selectionStart, e = el.selectionEnd;
      if (s == null) throw 0;
      el.setRangeText(text, s, e, "end");
    } catch (x) { el.value += text; }
    emit(el, "input"); sync();
  }
  function backspace() {
    var el = target; if (!el) return;
    try {
      var s = el.selectionStart, e = el.selectionEnd;
      if (s == null) throw 0;
      if (s === e) { if (s === 0) return; el.setRangeText("", s - 1, e, "end"); }
      else el.setRangeText("", s, e, "end");
    } catch (x) { el.value = el.value.slice(0, -1); }
    emit(el, "input"); sync();
  }
  function enter() {
    var el = target; if (!el) return;
    var f = el.form;
    if (f && el.tagName !== "TEXTAREA") {
      if (f.requestSubmit) { try { f.requestSubmit(); } catch (x) { f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); } }
      else f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      close(true); return;
    }
    if (el.tagName === "TEXTAREA") { insert("\n"); return; }
    ["keydown", "keypress", "keyup"].forEach(function (t) {
      el.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    });
    emit(el, "change");
    close(true);
  }
  function typeChar(v) {
    var out = shift && layer === "abc" && v.length === 1 ? v.toUpperCase() : v;
    insert(out);
    if (shift === 1) { shift = 0; render(); }
  }
  function sync() {
    if (!target) return;
    var v = target.value || "";
    mirrorTxt.textContent = target.type === "password" ? new Array(v.length + 1).join("•") : v;
    root.classList.toggle("is-empty", !v);
    mirrorLbl.textContent = (target.getAttribute("aria-label") || target.getAttribute("placeholder") || "");
    mirrorTxt.scrollLeft = mirrorTxt.scrollWidth;
  }

  /* ---------- Pulsaciones ---------- */
  function keyOf(e) { return e.target.closest && e.target.closest(".osk__key, .osk__hide, .osk__alt"); }

  function onDown(e) {
    var k = keyOf(e); if (!k) return;
    e.preventDefault(); consumed = false; cancelHold();
    var act = k.dataset.act;
    if (act === "back") {
      backspace();
      holdT = setTimeout(function () { repeatT = setInterval(backspace, 60); }, 420);
      consumed = true; return;
    }
    if (act === "ch" && ACCENTS[k.dataset.v]) {
      holdT = setTimeout(function () { showAccents(k); consumed = true; }, 450);
    }
  }
  function onUp(e) {
    var k = keyOf(e); cancelHold();
    if (!k) return;
    e.preventDefault();
    var act = k.dataset.act;
    if (k.classList.contains("osk__alt")) { insert(k.dataset.v); hideAccents(); if (shift === 1) { shift = 0; render(); } return; }
    if (!popup.hidden) hideAccents();
    if (consumed) { consumed = false; return; }
    if (act === "ch") typeChar(k.dataset.v);
    else if (act === "shift") {
      var now = Date.now();
      shift = (now - lastShiftTap < 400) ? 2 : (shift ? 0 : 1); lastShiftTap = now; render();
    }
    else if (act === "layer") { layer = layer === "sym" ? "abc" : "sym"; render(); }
    else if (act === "enter") enter();
    else if (act === "hide") close(true);
  }
  function cancelHold() { clearTimeout(holdT); clearInterval(repeatT); holdT = repeatT = null; }

  function showAccents(k) {
    var list = ACCENTS[k.dataset.v]; if (!list) return;
    popup.textContent = "";
    var base = k.dataset.v, up = shift && layer === "abc";
    list.split("").forEach(function (c) { var b = key(up ? c.toUpperCase() : c, "alt", "osk__alt"); b.dataset.v = up ? c.toUpperCase() : c; popup.appendChild(b); });
    popup.hidden = false;
    var kr = k.getBoundingClientRect(), rr = root.getBoundingClientRect(), pw = popup.offsetWidth;
    popup.style.left = Math.max(4, Math.min(rr.width - pw - 4, kr.left - rr.left + kr.width / 2 - pw / 2)) + "px";
    popup.style.top = (kr.top - rr.top - popup.offsetHeight - 6) + "px";
  }
  function hideAccents() { popup.hidden = true; popup.textContent = ""; }

  /* ---------- Abrir / cerrar ---------- */
  function setH() {
    var h = root.hidden ? 0 : Math.ceil(root.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--osk-h", h + "px");
    document.documentElement.toggleAttribute("data-osk", h > 0);
  }
  function open(el) {
    if (!root) build();
    clearTimeout(closeT);
    if (target && target !== el) restore(target);
    target = el;
    if (el.dataset.oskIm == null) el.dataset.oskIm = el.getAttribute("inputmode") || "";
    el.setAttribute("inputmode", "none");           // evita el teclado nativo de Windows/Android
    var kd = kind(el);
    layer = "abc"; shift = (kd.k === "text" && !el.value && el.getAttribute("autocapitalize") === "characters") ? 2 : 0;
    attach();
    render(); sync();
    root.hidden = false;
    requestAnimationFrame(function () {
      root.classList.add("is-in"); setH();
      try { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
    });
    setTimeout(setH, 250);
  }
  function restore(el) {
    if (el.dataset.oskIm != null) {
      if (el.dataset.oskIm) el.setAttribute("inputmode", el.dataset.oskIm); else el.removeAttribute("inputmode");
      delete el.dataset.oskIm;
    }
  }
  function close(blur) {
    if (!root || root.hidden) return;
    cancelHold(); hideAccents();
    var el = target; target = null;
    root.classList.remove("is-in"); root.hidden = true; setH();
    if (el) { restore(el); if (blur) el.blur(); }
  }
  function attach() {
    var host = document.fullscreenElement || document.body;
    if (root.parentNode !== host) host.appendChild(root);
  }

  document.addEventListener("fullscreenchange", function () { if (root && root.parentNode) { attach(); setH(); } });

  document.addEventListener("focusin", function (e) {
    var el = e.target;
    if (!enabled() || !eligible(el)) return;
    open(el);
  });
  document.addEventListener("click", function (e) {
    var el = e.target;
    if (enabled() && eligible(el) && (!root || root.hidden)) open(el);
  });
  document.addEventListener("focusout", function (e) {
    if (!root || root.hidden) return;
    clearTimeout(closeT);
    closeT = setTimeout(function () {
      var a = document.activeElement;
      if (a && (eligible(a) || (a.closest && a.closest("#osk")))) return;
      close(false);
    }, 120);
  });
  document.addEventListener("input", function (e) { if (e.target === target) sync(); });
  window.addEventListener("resize", function () { if (root && !root.hidden) setH(); });
  window.addEventListener("radio:systemchange", function () { if (!enabled()) close(true); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && root && !root.hidden) { e.stopImmediatePropagation(); close(true); } }, true);

  window.RadioKeyboard = { open: function (el) { if (eligible(el)) open(el); }, close: function () { close(true); }, isOpen: function () { return !!root && !root.hidden; } };
})();
