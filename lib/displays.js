'use strict';
// Reparte las pantallas: la táctil para el radio y la otra para el cluster.
const { screen } = require('electron');

function all() { return screen.getAllDisplays(); }
function byId(id) { return all().find((d) => String(d.id) === String(id)) || null; }

function radio(cfg) {
  const d = cfg.radioDisplay != null ? byId(cfg.radioDisplay) : null;
  if (d) return d;
  return all().find((x) => x.touchSupport === 'available') || screen.getPrimaryDisplay();
}
function cluster(cfg, radioD) {
  if (cfg.clusterDisplay === 'none') return null;
  if (cfg.clusterDisplay) { const d = byId(cfg.clusterDisplay); if (d && d.id !== radioD.id) return d; }
  return all().find((x) => x.id !== radioD.id) || null;
}
function describe() {
  return all().map((d) => ({ id: String(d.id), w: d.size.width, h: d.size.height, touch: d.touchSupport === 'available', primary: d.id === screen.getPrimaryDisplay().id }));
}
module.exports = { radio, cluster, describe };
