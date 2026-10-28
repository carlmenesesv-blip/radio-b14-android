'use strict';
// Puente entre la interfaz del radio y Windows. Imita la parte de AndroidBridge que usa la interfaz
// (apps, abrir cluster, ESP32 por USB) para no tocar los módulos web, y añade RadioHost.
const { contextBridge, ipcRenderer } = require('electron');

const bridge = {
  apps: () => JSON.stringify(ipcRenderer.sendSync('host:apps') || []),
  icon: (pkg) => ipcRenderer.sendSync('host:icon', String(pkg)) || '',
  launch: (pkg) => { ipcRenderer.send('host:launch', String(pkg)); return true; },
  openUrl: (url) => { ipcRenderer.send('host:openUrl', String(url)); return true; },
  dial: (n) => { ipcRenderer.send('host:openUrl', 'tel:' + String(n)); return true; },
  openCluster: () => { ipcRenderer.send('host:openCluster'); },
  espSend: (line) => { ipcRenderer.send('host:espSend', String(line)); }
};
const host = {
  platform: 'windows',
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
