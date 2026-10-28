/* ==========================================================
   BLUETOOTH — escuchar el celular por el receptor Bluetooth del auto
   Una página web no puede ser receptor Bluetooth: ese audio lo
   recibe el receptor externo (entrada de audio del auto). Aquí solo se guía el
   emparejamiento y se pone el sistema en «modo Bluetooth»
   (pausa música y radio para que no se encimen).
   window.RadioBluetooth.get() / set(bool)
   ========================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var Q = window.RadioQuick, S = window.RadioSystem;
  function $(id) { return document.getElementById(id); }

  var live = $("bt-live"), listen = $("bt-listen"), on = $("bt-on"), status = $("bt-status"), nameEl = $("bt-name"), settings = $("bt-settings");
  if (!live || !listen) return;

  var active = false;

  function btOn() { return !Q || Q.get().bluetooth !== false; }

  function render() {
    var name = S ? String(S.get("btName") || "").trim() : "";
    nameEl.textContent = name ? "«" + name + "»" : "el receptor";
    var ok = btOn();
    status.dataset.state = ok ? "ok" : "bad";
    status.textContent = ok ? "Receptor activado: ya puedes vincular tu celular." : "El receptor Bluetooth está apagado.";
    on.hidden = ok;
    settings.hidden = !/Android/i.test(navigator.userAgent || "");
    live.hidden = !active;
    var card = $("btcard"); if (card) card.dataset.active = active ? "on" : "off";
    root.setAttribute("data-bt", active ? "on" : "off");
  }

  function set(v) {
    v = !!v;
    if (v && !btOn()) { render(); return false; }
    active = v;
    if (v) {
      if (window.RadioMusic) window.RadioMusic.pause();
      if (window.RadioTuner && window.RadioTuner.get().power) window.RadioTuner.setPower(false);
    }
    render();
    window.dispatchEvent(new CustomEvent("radio:btchange", { detail: { active: active } }));
    return true;
  }

  listen.addEventListener("click", function () {
    if (!set(true)) return;
    var close = document.querySelector("#msheet [data-ms-close]");
    if (close) close.click();
  });
  on.addEventListener("click", function () { if (Q) Q.set({ bluetooth: true }); });
  $("bt-stop").addEventListener("click", function () { set(false); });

  // Si el sistema vuelve a sonar por su cuenta, se sale del modo Bluetooth
  window.addEventListener("radio:musicchange", function (e) { if (active && e.detail && e.detail.playing) set(false); });
  window.addEventListener("radio:tunerchange", function (e) { if (active && e.detail && e.detail.power) set(false); });
  window.addEventListener("radio:quickchange", function () { if (active && !btOn()) set(false); else render(); });
  window.addEventListener("radio:systemchange", render);

  render();
  window.RadioBluetooth = { get: function () { return active; }, set: set };
})();
