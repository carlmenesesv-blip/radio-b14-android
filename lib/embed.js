'use strict';
// Apps web dentro del radio: vistas nativas (WebContentsView) colocadas encima del hueco de la interfaz.
const { WebContentsView, session, app, shell } = require('electron');

const MAX_VIEWS = 4;
const views = new Map();     // id -> {view, url, title}
let host = null;             // () => BrowserWindow principal
let notify = () => {};
let activeId = null, rect = { x: 0, y: 80, width: 800, height: 400 }, visible = false, fs = false;
let ses = null;

function userAgent() {
  // Sin «Electron/» ni el nombre de la app: muchos sitios (Google) rechazan navegadores incrustados identificados así
  const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return app.userAgentFallback
    .replace(/\sElectron\/\S+/i, '')
    .replace(new RegExp('\\s' + esc(app.getName()) + '\\/\\S+', 'i'), '')
    .replace(/\sRadio B14\/\S+/i, '');
}
function getSession() {
  if (ses) return ses;
  ses = session.fromPartition('persist:apps');
  ses.setUserAgent(userAgent());
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'fullscreen', 'clipboard-sanitized-write', 'geolocation', 'notifications', 'midi', 'pointerLock'].includes(perm) && perm !== 'notifications'));
  return ses;
}
function win() { const w = host && host(); return w && !w.isDestroyed() ? w : null; }
function r(o) { return { x: Math.round(o.x), y: Math.round(o.y), width: Math.max(1, Math.round(o.width)), height: Math.max(1, Math.round(o.height)) }; }

function bounds() {
  const w = win();
  if (fs && w) { const c = w.getContentBounds(); return { x: 0, y: 0, width: c.width, height: c.height }; }
  return r(rect);
}
function apply() {
  const e = views.get(activeId); if (!e) return;
  if (!visible || !e.ready) { e.view.setVisible(false); return; }
  e.view.setBounds(bounds()); e.view.setVisible(true);
}
function emit(id) {
  const e = views.get(id); if (!e || id !== activeId) return;
  const wc = e.view.webContents;
  notify({ id, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), ready: !!e.ready, canBack: wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack() });
}
function markReady(id) {
  const e = views.get(id); if (!e || e.ready) return;
  e.ready = true; clearTimeout(e.readyT);
  if (id === activeId) { apply(); emit(id); }
}
function create(id, url) {
  const w = win(); if (!w) return null;
  if (views.size >= MAX_VIEWS) {
    for (const [k, v] of views) { if (k !== activeId) { destroy(k); break; } }
  }
  const view = new WebContentsView({ webPreferences: { session: getSession(), contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: 'no-user-gesture-required' } });
  view.setBackgroundColor('#000000');
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/i.test(u)) wc.loadURL(u);
    else if (/^(tel|mailto):/i.test(u)) shell.openExternal(u).catch(() => {});
    return { action: 'deny' };
  });
  ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'].forEach((ev) => wc.on(ev, () => emit(id)));
  // La vista se muestra cuando la página ya pintó algo (o a los 6 s); mientras tanto el radio enseña su pantalla de espera
  wc.on('dom-ready', () => setTimeout(() => markReady(id), 500));
  wc.on('did-finish-load', () => markReady(id));
  wc.on('did-fail-load', () => setTimeout(() => markReady(id), 100));
  wc.on('audio-state-changed', (ev) => { notify({ id, audio: true, audible: !!(ev && ev.audible), title: wc.getTitle() }); });
  wc.on('did-fail-load', (_e, code, desc, u, isMain) => {
    if (!isMain || code === -3) return;
    const html = '<meta charset="utf-8"><body style="margin:0;background:#101418;color:#fff;font:28px Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">' +
      '<div><p>No se pudo cargar la página</p><p style="font-size:18px;opacity:.7">' + String(desc).replace(/[<>&]/g, '') + '</p>' +
      '<button style="font-size:22px;padding:14px 28px;border-radius:999px;border:2px solid #4aa3ff;background:none;color:#fff" onclick="location.href=\'' + String(u).replace(/['\\<>]/g, '') + '\'">Reintentar</button></div>';
    wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
  wc.on('enter-html-full-screen', () => { fs = true; apply(); });
  wc.on('leave-html-full-screen', () => { fs = false; apply(); });
  wc.on('before-input-event', (ev, input) => { if (input.type === 'keyDown' && input.key === 'Escape' && fs) { wc.executeJavaScript('document.exitFullscreen&&document.exitFullscreen()').catch(() => {}); } });
  w.contentView.addChildView(view);
  view.setVisible(false);
  const entry = { view, ready: false, readyT: setTimeout(() => markReady(id), 6000) };
  views.set(id, entry);
  wc.loadURL(url).catch(() => {});
  return entry;
}
function destroy(id) {
  const e = views.get(id); if (!e) return;
  views.delete(id);
  const w = win();
  try { if (w) w.contentView.removeChildView(e.view); } catch (x) {}
  try { e.view.webContents.close(); } catch (x) {}
  if (activeId === id) { activeId = null; visible = false; fs = false; }
}

function open(id, url, rc) {
  if (rc) rect = rc;
  for (const [k, v] of views) if (k !== id) v.view.setVisible(false);
  activeId = id;
  if (!views.has(id)) { if (!/^(https?|app):/i.test(url)) return; create(id, url); }
  else {
    const w = win(); if (w) { try { w.contentView.removeChildView(views.get(id).view); w.contentView.addChildView(views.get(id).view); } catch (x) {} }
  }
  visible = !!rc; apply(); emit(id);
}
function show(rc) { if (rc) rect = rc; visible = true; apply(); }
function hide() { visible = false; apply(); }
async function freeze() {
  const e = views.get(activeId); if (!e || !visible) return '';
  let s = '';
  try { const img = await e.view.webContents.capturePage(); s = 'data:image/jpeg;base64,' + img.toJPEG(70).toString('base64'); } catch (x) {}
  visible = false; apply();
  return s;
}
function cmd(c) {
  const e = views.get(activeId); if (!e) return;
  const wc = e.view.webContents;
  if (c === 'reload') wc.reload();
  else if (c === 'back') { const nh = wc.navigationHistory; if (nh ? nh.canGoBack() : wc.canGoBack()) (nh ? nh.goBack() : wc.goBack()); }
}
const PAUSE_JS = "(function(){var m=[].slice.call(document.querySelectorAll('video,audio'));var p=m.filter(function(x){return !x.paused&&!x.ended});p.forEach(function(x){x.pause()});window.__rbPaused=p.length?p:window.__rbPaused;return p.length})()";
const TOGGLE_JS = "(function(){var m=[].slice.call(document.querySelectorAll('video,audio'));var p=m.filter(function(x){return !x.paused&&!x.ended});if(p.length){p.forEach(function(x){x.pause()});window.__rbPaused=p}else if(window.__rbPaused&&window.__rbPaused.length){window.__rbPaused.forEach(function(x){x.play()})}return p.length})()";
function pauseAll() { for (const [, e] of views) { try { e.view.webContents.executeJavaScript(PAUSE_JS).catch(() => {}); } catch (x) {} } }
function toggle() { const e = views.get(activeId) || [...views.values()].find((v) => v.view.webContents.isCurrentlyAudible()); if (e) e.view.webContents.executeJavaScript(TOGGLE_JS).catch(() => {}); else for (const [, v] of views) v.view.webContents.executeJavaScript(TOGGLE_JS).catch(() => {}); }
function nav(u) { const e = views.get(activeId); if (e && /^https?:/i.test(u)) e.view.webContents.loadURL(u).catch(() => {}); }
function close(id) { destroy(id); }
function resize() { if (visible) apply(); }
function init(getWin, onState) { host = getWin; notify = onState; }
function info() { return { active: activeId, count: views.size, visible }; }

module.exports = { init, open, show, hide, freeze, cmd, nav, close, resize, info, create, pauseAll, toggle };
