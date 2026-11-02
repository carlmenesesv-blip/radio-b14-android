'use strict';
/* AURA · Windows — YouTube sin pantalla verde ni trabas.
   YouTube suele servir VP9 o AV1. Las gráficas Intel UHD de laptops no los decodifican bien por hardware:
   salen pantallas verdes o el video se traba. Aquí le decimos a la página que este navegador no soporta
   VP9/AV1, y YouTube entrega H.264 (hasta 1080p), que la gráfica Intel decodifica por hardware sin problema.
   Se ejecuta en el mundo principal de la página, antes de que cargue su código. */
const { webFrame } = require('electron');

const CODE = `(function () {
  try {
    if (!/(^|\\.)(youtube\\.com|youtube-nocookie\\.com|youtu\\.be)$/i.test(location.hostname)) return;
    var bad = /vp0?9|av01|av1/i;
    if (window.MediaSource && MediaSource.isTypeSupported) {
      var ims = MediaSource.isTypeSupported.bind(MediaSource);
      MediaSource.isTypeSupported = function (t) { return bad.test(String(t)) ? false : ims(t); };
    }
    var cpt = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (t) { return bad.test(String(t)) ? "" : cpt.call(this, t); };
    var mc = navigator.mediaCapabilities;
    if (mc && mc.decodingInfo) {
      var di = mc.decodingInfo.bind(mc);
      mc.decodingInfo = function (c) {
        if (bad.test(JSON.stringify(c || {}))) return Promise.resolve({ supported: false, smooth: false, powerEfficient: false });
        return di(c);
      };
    }
  } catch (e) {}
})();`;

try { webFrame.executeJavaScript(CODE); } catch (e) { /* sin acceso: la página se carga normal */ }
