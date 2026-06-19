'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screensaver', {
  exit: () => ipcRenderer.send('exit-screensaver'),

  onThreatFound:   (cb) => ipcRenderer.on('threat-found',   (_, d) => cb(d)),
  onScanProgress:  (cb) => ipcRenderer.on('scan-progress',  (_, d) => cb(d)),
  onScanComplete:  (cb) => ipcRenderer.on('scan-complete',  (_, d) => cb(d)),
});
