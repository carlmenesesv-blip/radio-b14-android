/* ==========================================================
   TOAST — avisos breves en pantalla
   (antes vivía dentro de cast.js; se separó al quitar el emparejamiento con el teléfono)
   API: RadioToast.show({title, text, kind: "ok"|"bad", ms, actions:[{label, fn}]}) → función que lo cierra
   Estilos: cast.css (.toasts / .toast)
   ========================================================== */
(function () {
  "use strict";
  var toastBox = null;
  function toast(o) {
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "toasts";
      toastBox.setAttribute("aria-live", "polite");
      toastBox.setAttribute("role", "status");
      document.body.appendChild(toastBox);
    }
    var t = document.createElement("div");
    t.className = "toast" + (o.kind ? " toast--" + o.kind : "");
    var txt = document.createElement("div");
    txt.className = "toast__txt";
    var strong = document.createElement("strong"); strong.textContent = o.title || "";
    txt.appendChild(strong);
    if (o.text) { var sp = document.createElement("span"); sp.textContent = o.text; txt.appendChild(sp); }
    t.appendChild(txt);
    var timer;
    function close() { clearTimeout(timer); t.classList.remove("is-in"); setTimeout(function () { t.remove(); }, 200); }
    (o.actions || []).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "toast__btn"; b.textContent = a.label;
      b.addEventListener("click", function () { close(); if (a.fn) a.fn(); });
      t.appendChild(b);
    });
    toastBox.appendChild(t);
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
    requestAnimationFrame(function () { t.classList.add("is-in"); });
    timer = setTimeout(close, o.ms || ((o.actions && o.actions.length) ? 12000 : 5000));
    return close;
  }
  window.RadioToast = { show: toast };
})();
