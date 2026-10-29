const { contextBridge, ipcRenderer } = require('electron');

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
