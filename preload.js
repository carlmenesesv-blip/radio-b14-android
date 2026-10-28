'use strict';
// Puente entre la interfaz del radio y Windows. Imita la parte de AndroidBridge que usa la interfaz
// (apps, abrir cluster, ESP32 por USB) para no tocar los módulos web, y añade RadioHost.
const { contextBridge, ipcRenderer } = require('electron');

const bridge = {
  apps: () => JSON.stringify(ipcRenderer.sendSync('host:apps') || []),
  icon: (pkg) => ipcRenderer.sendSync('host:icon', String(pkg)) || '',
  launch: (pkg) => { ipcRenderer.send('host:launch', String(pkg), stageRect()); return true; },
  openUrl: (url) => { ipcRenderer.send('host:openUrl', String(url)); return true; },
  dial: (n) => { ipcRenderer.send('host:openUrl', 'tel:' + String(n)); return true; },
  openCluster: () => { ipcRenderer.send('host:openCluster'); },
  platform: 'windows',
  sys: () => JSON.stringify(ipcRenderer.sendSync('host:sysGet') || {}),
  setVolume: (v) => ipcRenderer.send('host:sysVol', +v),
  setMute: (m) => ipcRenderer.send('host:sysMute', !!m),
  setBrightness: (b) => ipcRenderer.send('host:sysBright', +b),
  openSettings: (k) => ipcRenderer.send('host:openSettings', String(k)),
  espSend: (line) => { ipcRenderer.send('host:espSend', String(line)); }
};
function stageRect() {
  try { const v = document.querySelector('.view.is-active'); const b = v.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) }; } catch (e) { return null; }
}
const host = {
  platform: 'windows',
  embedOpen: (id, url, rect) => ipcRenderer.send('host:embedOpen', String(id), String(url), rect),
  embedShow: (rect) => ipcRenderer.send('host:embedShow', rect),
  embedHide: () => ipcRenderer.send('host:embedHide'),
  embedFreeze: () => ipcRenderer.invoke('host:embedFreeze'),
  embedCmd: (c) => ipcRenderer.send('host:embedCmd', String(c)),
  embedNav: (u) => ipcRenderer.send('host:embedNav', String(u)),
  embedClose: (id) => ipcRenderer.send('host:embedClose', String(id)),
  openExternal: (u) => ipcRenderer.send('host:openUrl', String(u)),
  suspend: () => ipcRenderer.send('host:suspend'),
  quit: () => ipcRenderer.send('host:quit'),
  getConfig: () => ipcRenderer.invoke('host:getConfig'),
  setConfig: (p) => ipcRenderer.invoke('host:setConfig', p),
  displays: () => ipcRenderer.invoke('host:displays')
};
contextBridge.exposeInMainWorld('AndroidBridge', bridge);
contextBridge.exposeInMainWorld('RadioHost', host);

// Líneas del ESP32 y estado de la conexión: se entregan a las funciones globales de esp.js
ipcRenderer.on('host:line', (_e, t) => { try { require('electron').webFrame.executeJavaScript('window.__b14Line&&window.__b14Line(' + JSON.stringify(String(t)) + ')'); } catch (e) {} });
ipcRenderer.on('host:status', (_e, t, ok) => { try { require('electron').webFrame.executeJavaScript('window.__b14Status&&window.__b14Status(' + JSON.stringify(String(t)) + ',' + (ok ? 'true' : 'false') + ')'); } catch (e) {} });
ipcRenderer.on('host:embed', (_e, st) => { try { require('electron').webFrame.executeJavaScript('window.__b14Embed&&window.__b14Embed(' + JSON.stringify(st) + ')'); } catch (e) {} });
