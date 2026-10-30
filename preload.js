const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateAPI', {
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    installLater: () => ipcRenderer.invoke('install-update-later'),
    openReleasesPage: () => ipcRenderer.invoke('open-releases-page'),
    // The callback receives plain status objects only, never the IPC event.
    onStatus: (callback) => ipcRenderer.on('update-status', (_event, status) => callback(status))
});

contextBridge.exposeInMainWorld('wasmAPI', {
    loadWasm: () => ipcRenderer.invoke('load-wasm')
});

// Local files are read by the main process: drawing a file:// image into a canvas would taint it
// (getImageData then throws), so the bundled sample photo is delivered as bytes instead.
contextBridge.exposeInMainWorld('sampleAPI', {
    loadSample: () => ipcRenderer.invoke('load-sample')
});

window.addEventListener('DOMContentLoaded', () => {
    console.log('Photo Editor PRO Electron Shell Loaded with WASM API.');
});
