'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('homeBtn', { back: () => ipcRenderer.send('host:back') });
