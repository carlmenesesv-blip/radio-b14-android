'use strict';
// Configuración de la app (se guarda en la carpeta de datos del usuario).
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  radioDisplay: null,      // id de la pantalla táctil (null = la táctil o la principal)
  clusterDisplay: null,    // id de la pantalla del cluster (null = la primera que no sea la del radio, "none" = ninguna)
  autoCluster: true,       // abrir el cluster solo al iniciar si hay segunda pantalla
  openAtLogin: false,      // iniciar con Windows
  suspendMode: 'none',     // al apagar el auto, después de guardar: 'none' | 'sleep' | 'hibernate'
  espPort: 'auto',         // 'auto' o 'COM5'
  espBaud: 115200,
  keepAwake: true,         // no dejar que Windows apague la pantalla
  kiosk: true              // pantalla completa sin bordes
};

let file = null;
let cfg = null;

function path_() { if (!file) file = path.join(app.getPath('userData'), 'config.json'); return file; }
function load() {
  if (cfg) return cfg;
  let d = {};
  try { d = JSON.parse(fs.readFileSync(path_(), 'utf8')); } catch (e) {}
  cfg = Object.assign({}, DEFAULTS, d && typeof d === 'object' ? d : {});
  return cfg;
}
function save() { try { fs.mkdirSync(path.dirname(path_()), { recursive: true }); fs.writeFileSync(path_(), JSON.stringify(cfg, null, 2)); } catch (e) {} }
function get() { return Object.assign({}, load()); }
function set(patch) {
  load();
  const changed = [];
  Object.keys(patch || {}).forEach((k) => {
    if (!(k in DEFAULTS)) return;
    const v = patch[k];
    if (typeof v !== typeof DEFAULTS[k] && !(DEFAULTS[k] === null && (v === null || typeof v === 'number' || typeof v === 'string')) && !(k === 'clusterDisplay' && typeof v === 'string')) return;
    if (cfg[k] !== v) { cfg[k] = v; changed.push(k); }
  });
  if (changed.length) save();
  return changed;
}
module.exports = { get, set, DEFAULTS };
