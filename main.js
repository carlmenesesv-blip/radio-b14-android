'use strict';
/* Radio B14 · Windows (Electron)
   - Pantalla táctil: interfaz del radio. Segunda pantalla: cluster (cluster/display.html).
   - ESP32 por USB (serialport). Apps de Windows. Suspensión al apagar el auto. */
const { app, BrowserWindow, ipcMain, protocol, net, shell, powerSaveBlocker, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');

const config = require('./lib/config');
const apps = require('./lib/apps');
const serial = require('./lib/serial');
const displays = require('./lib/displays');

const SMOKE = process.argv.includes('--smoke');
const WWW = app.isPackaged ? path.join(process.resourcesPath, 'www') : path.join(__dirname, 'www');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();

let main = null, clusterWin = null, backWin = null, blocker = null;

function serve() {
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(WWW, rel));
    if (!file.startsWith(WWW)) return new Response('No permitido', { status: 403 });
    if (!fs.existsSync(file)) return new Response('No encontrado', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function mkWindow(d, url, extra) {
  const b = d.bounds;
  const w = new BrowserWindow(Object.assign({
    x: b.x, y: b.y, width: b.width, height: b.height,
    show: false, backgroundColor: '#000000', autoHideMenuBar: true,
    frame: !config.get().kiosk, fullscreen: false, kiosk: false, skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      allowRunningInsecureContent: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required'
    }
  }, extra || {}));
  w.setMenu(null);
  w.once('ready-to-show', () => { w.show(); if (config.get().kiosk) { w.setBounds(b); w.setFullScreen(true); } });
  w.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:|^tel:|^mailto:/i.test(u)) { openExternal(u); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  w.loadURL(url);
  return w;
}

function openRadio() {
  const d = displays.radio(config.get());
  main = mkWindow(d, 'app://radio/index.html');
  main.on('closed', () => { main = null; app.quit(); });
  main.webContents.on('did-finish-load', () => { if (lastStatus) main.webContents.send('host:status', lastStatus[0], lastStatus[1]); });
  main.on('focus', hideBack);
  return main;
}
function openCluster() {
  const c = config.get();
  const rd = displays.radio(c);
  const d = displays.cluster(c, rd);
  if (!d) return false;
  if (clusterWin && !clusterWin.isDestroyed()) { clusterWin.focus(); return true; }
  clusterWin = mkWindow(d, 'app://radio/cluster/display.html', { skipTaskbar: true });
  clusterWin.on('closed', () => { clusterWin = null; });
  return true;
}

/* Botón flotante «◀ Radio» mientras hay otra app encima */
function showBack() {
  if (!main) return;
  if (!backWin || backWin.isDestroyed()) {
    const d = displays.radio(config.get()).bounds;
    backWin = new BrowserWindow({
      width: 190, height: 64, x: d.x + 16, y: d.y + d.height - 64 - 16,
      frame: false, transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'homebtn-preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    backWin.setAlwaysOnTop(true, 'screen-saver');
    backWin.loadFile(path.join(__dirname, 'homebtn.html'));
    backWin.once('ready-to-show', () => backWin && backWin.showInactive());
    backWin.on('closed', () => { backWin = null; });
  } else backWin.showInactive();
}
function hideBack() { if (backWin && !backWin.isDestroyed()) backWin.hide(); }
function goBack() {
  hideBack();
  if (!main) return;
  if (main.isMinimized()) main.restore();
  main.setAlwaysOnTop(true); main.show(); main.focus(); main.setAlwaysOnTop(false);
}
function leaveRadio() { setTimeout(showBack, 700); }

function openExternal(u) {
  if (!/^(https?|tel|mailto):/i.test(u)) return;
  shell.openExternal(u).catch(() => {});
  leaveRadio();
}

/* Suspensión al apagar el auto (el radio ya guardó todo antes de llamar) */
function suspend() {
  const mode = config.get().suspendMode;
  if (mode === 'sleep') execFile('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], () => {});
  else if (mode === 'hibernate') execFile('shutdown.exe', ['/h'], () => {});
}

let lastStatus = null;
function startSerial() {
  const c = config.get();
  serial.start({ port: c.espPort, baud: c.espBaud },
    (line) => { if (main && !main.isDestroyed()) main.webContents.send('host:line', line); },
    (t, ok) => { lastStatus = [t, ok]; if (main && !main.isDestroyed()) main.webContents.send('host:status', t, ok); });
}

ipcMain.on('host:apps', (e) => { e.returnValue = apps.apps(); });
ipcMain.on('host:icon', (e, pkg) => { e.returnValue = apps.icon(pkg); });
ipcMain.on('host:launch', (_e, pkg) => { apps.launch(pkg).then((ok) => { if (ok) leaveRadio(); }); });
ipcMain.on('host:openUrl', (_e, url) => openExternal(url));
ipcMain.on('host:openCluster', () => { openCluster(); });
ipcMain.on('host:espSend', (_e, line) => { serial.send(line); });
ipcMain.on('host:suspend', suspend);
ipcMain.on('host:quit', () => app.quit());
ipcMain.on('host:back', goBack);
ipcMain.handle('host:getConfig', () => config.get());
ipcMain.handle('host:displays', () => displays.describe());
ipcMain.handle('host:setConfig', (_e, patch) => {
  const changed = config.set(patch);
  if (changed.includes('openAtLogin')) app.setLoginItemSettings({ openAtLogin: !!config.get().openAtLogin });
  if (changed.includes('espPort') || changed.includes('espBaud')) serial.restart({ port: config.get().espPort, baud: config.get().espBaud });
  return config.get();
});

app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.focus(); } });

app.whenReady().then(async () => {
  serve();
  if (SMOKE) return smoke();
  if (config.get().keepAwake) blocker = powerSaveBlocker.start('prevent-display-sleep');
  try { await Promise.race([apps.scan(), new Promise((r) => setTimeout(r, 9000))]); } catch (e) {}
  openRadio();
  startSerial();
  main.webContents.once('did-finish-load', () => { if (config.get().autoCluster) setTimeout(openCluster, 800); });
  screen.on('display-added', () => { if (config.get().autoCluster && !clusterWin) setTimeout(openCluster, 1500); });
  screen.on('display-removed', () => { if (clusterWin && !clusterWin.isDestroyed() && !displays.cluster(config.get(), displays.radio(config.get()))) clusterWin.close(); });
});

app.on('before-quit', () => { serial.stop(); if (blocker !== null) { try { powerSaveBlocker.stop(blocker); } catch (e) {} } });
app.on('window-all-closed', () => app.quit());

/* Comprobación automática (CI): abre la interfaz sin ventana visible y verifica que carga. */
async function smoke() {
  const w = new BrowserWindow({ show: false, width: 1280, height: 480, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  const errors = [];
  w.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) errors.push(msg); });
  w.webContents.on('render-process-gone', () => { console.log('SMOKE FAIL: renderer caído'); app.exit(1); });
  await w.loadURL('app://radio/index.html');
  await new Promise((r) => setTimeout(r, 2500));
  const r = await w.webContents.executeJavaScript(
    '({nav:!!window.RadioNav,esp:!!window.RadioESP&&window.RadioESP.available(),host:!!window.RadioHost,apps:typeof window.AndroidBridge.apps,power:!!window.RadioPower,title:document.title})');
  console.log('SMOKE', JSON.stringify(r), 'errores:', errors.length);
  const ok = r.nav && r.esp && r.host && r.power;
  app.exit(ok ? 0 : 1);
}
