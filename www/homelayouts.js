/* ==========================================================
   HOME LAYOUTS — lógica de los tres estilos del inicio
   Saludo y reloj grande, accesos rápidos, tarjeta de la casa (Home Assistant) y selector
   de estilo (botón «Estilo» en la barra o Ajustes → Tarjetas del inicio).
   API: RadioHome {layout(), set(nombre), cycle()}
   Sección: HOME
   ========================================================== */
(function () {
  "use strict";
  var LAYOUTS = ["calma", "cockpit", "widgets"], NAMES = { calma: "Calma", cockpit: "Cockpit", widgets: "Widgets" };
  var home = document.getElementById("home"); if (!home) return;
  function $(id) { return document.getElementById(id); }
  function sys() { return (window.RadioSystem && window.RadioSystem.get && window.RadioSystem.get()) || {}; }

  function apply() {
    var l = sys().homeLayout; if (LAYOUTS.indexOf(l) < 0) l = "calma";
    if (home.getAttribute("data-layout") !== l) { home.removeAttribute("data-layout"); void home.offsetWidth; home.setAttribute("data-layout", l); }
    var n = $("home-style-n"); if (n) n.textContent = NAMES[l];
    clock(); casa();
  }
  function set(l) { if (LAYOUTS.indexOf(l) >= 0 && window.RadioSystem) window.RadioSystem.set({ homeLayout: l }); }
  function cycle() { var i = LAYOUTS.indexOf(sys().homeLayout); set(LAYOUTS[(i + 1) % LAYOUTS.length]); }

  function clock() {
    var d = new Date(), h = d.getHours();
    var hi = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
    var c = $("hg-clock"), g = $("hg-hi"), t = $("hg-date");
    if (c) c.textContent = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    if (g) g.textContent = hi;
    if (t) { try { var ds = d.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long" }); t.textContent = ds.charAt(0).toUpperCase() + ds.slice(1); } catch (e) {} }
  }

  function casa() {
    var H = window.RadioHA, card = $("hcasa"); if (!H || !card) return;
    var live = H.demo() || H.configured();
    card.dataset.on = String(!!live && (H.demo() || H.status().ok));
    var n = $("hc-n"), t = $("hc-t"), sc = $("hc-sc"), al = $("hc-al");
    if (!live) { n.textContent = "—"; t.textContent = "Conecta tu Home Assistant en Ajustes"; sc.textContent = ""; al.hidden = true; return; }
    var on = H.lightsOn();
    n.textContent = on; t.textContent = on === 1 ? "luz encendida" : "luces encendidas";
    var scenes = H.scenes().slice(0, 3), sig = scenes.map(function (s) { return s.entity_id; }).join("|");
    if (sc.dataset.sig !== sig) {
      sc.dataset.sig = sig; sc.textContent = "";
      scenes.forEach(function (s) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = H.name(s);
        b.addEventListener("click", function () { H.toggle(s.entity_id); if (window.RadioToast) window.RadioToast.show({ title: H.name(s), text: "Escena activada", kind: "ok", ms: 1800 }); });
        sc.appendChild(b);
      });
    }
    var a = H.domain("alarm_control_panel")[0];
    if (a) { var m = { armed_home: "Alarma armada en casa", armed_away: "Alarma armada", armed_night: "Alarma armada de noche", disarmed: "Alarma desarmada", triggered: "¡Alarma disparada!" }; al.textContent = m[a.state] || "Alarma: " + a.state; al.hidden = false; } else al.hidden = true;
  }

  home.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-go]");
    if (b && window.RadioNav) window.RadioNav.show(b.getAttribute("data-go"));
  });
  var st = $("home-style"); if (st) st.addEventListener("click", cycle);
  window.addEventListener("radio:systemchange", function (e) { var c = (e.detail && e.detail.changed) || []; if (!c.length || c.indexOf("homeLayout") >= 0) apply(); });
  if (window.RadioHA) window.RadioHA.onChange(casa);
  setInterval(clock, 15000);
  setTimeout(apply, 0); setTimeout(casa, 1200);
  window.RadioHome = { layout: function () { return home.getAttribute("data-layout"); }, set: set, cycle: cycle, layouts: LAYOUTS.slice() };
})();
