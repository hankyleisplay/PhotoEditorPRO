const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseAPI', {
    getHWID: () => ipcRenderer.invoke('get-hwid'),
    checkLicense: () => ipcRenderer.invoke('check-license'),
    verifyAndSave: (key) => ipcRenderer.invoke('verify-and-save', key)
});

contextBridge.exposeInMainWorld('wasmAPI', {
    loadWasm: () => ipcRenderer.invoke('load-wasm')
});

window.addEventListener('DOMContentLoaded', () => {
    console.log('Photo Editor PRO Electron Shell Loaded with License and WASM API.');
});
