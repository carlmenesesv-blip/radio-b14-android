'use strict';
// Lista de apps de Windows (accesos del Menú Inicio) con sus iconos, para el cajón de Apps del radio.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, shell } = require('electron');

let list = [];            // [{pkg, name}]
const icons = {};         // pkg -> dataURL

function walk(dir, out, depth) {
  if (depth > 4) return;
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) walk(p, out, depth + 1);
    else if (/\.(lnk|url)$/i.test(it.name)) out.push(p);
  }
}

async function scan() {
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ];
  const files = [];
  roots.forEach((r) => walk(r, files, 0));
  const seen = new Set();
  const out = [];
  for (const f of files) {
    const name = path.basename(f).replace(/\.(lnk|url)$/i, '');
    if (/^(uninstall|desinstalar|readme|léeme|leeme|help|ayuda)\b/i.test(name)) continue;
    if (/radio b14/i.test(name)) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ pkg: f, name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  list = out;
  // iconos (con tope de tiempo para no retrasar el arranque)
  const t0 = Date.now();
  for (const a of list) {
    if (Date.now() - t0 > 7000) break;
    try {
      const img = await app.getFileIcon(a.pkg, { size: 'large' });
      if (!img.isEmpty()) icons[a.pkg] = img.toDataURL();
    } catch (e) {}
  }
  return list;
}

function apps() { return list; }
function icon(pkg) { return icons[pkg] || ''; }
function launch(pkg) {
  if (!list.some((a) => a.pkg === pkg)) return Promise.resolve(false);
  return shell.openPath(pkg).then((err) => !err, () => false);
}
module.exports = { scan, apps, icon, launch };
