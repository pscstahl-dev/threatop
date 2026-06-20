'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('warroom', {
  selectTarget:         ()       => ipcRenderer.invoke('select-target'),
  checkClamAV:          ()       => ipcRenderer.invoke('check-clamav'),
  startScan:            (opts)   => ipcRenderer.invoke('start-scan', opts),
  abortScan:            ()       => ipcRenderer.invoke('abort-scan'),
  pauseScan:            ()       => ipcRenderer.invoke('pause-scan'),
  resumeScan:           ()       => ipcRenderer.invoke('resume-scan'),
  openFileLocation:     (path)   => ipcRenderer.invoke('open-file-location', path),
  updateDefinitions:    ()       => ipcRenderer.invoke('update-definitions'),
  quarantineFile:       (path)   => ipcRenderer.invoke('quarantine-file', path),
  restoreFile:          (opts)   => ipcRenderer.invoke('restore-file', opts),
  openQuarantineFolder: ()       => ipcRenderer.invoke('open-quarantine-folder'),

  onScanEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('scan-event', handler);
    return () => ipcRenderer.removeListener('scan-event', handler);
  },
});