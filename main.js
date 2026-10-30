const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1000,
        minHeight: 700,
        title: "Photo Editor PRO",
        icon: path.join(__dirname, 'build/icon.png'),
        backgroundColor: '#090b0e', // 配合主題底色，防閃爍
        show: false, // 延遲顯示，直到網頁資源載入完成，防止視覺閃爍並加快開啟感受
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,   // 渲染程序沙盒化（preload 僅使用 contextBridge / ipcRenderer）
            devTools: false, // 停用開發者工具，防止逆向調試
            
            // 降低系統資源消耗的最佳化設定：
            backgroundThrottling: true,  // 當視窗在背景時暫停/減緩渲染，節省 CPU
            spellcheck: false,            // 停用拼字檢查，節省記憶體
            webgl: false                  // 停用 WebGL，節省 GPU 記憶體
        }
    });

    // 當視窗準備好顯示時才顯示，避免白色閃爍
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // 禁用快捷鍵開啟開發者工具 (如 F12, Ctrl+Shift+I, Ctrl+Shift+J)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if ((input.control && input.shift && input.key.toLowerCase() === 'i') ||
            (input.control && input.shift && input.key.toLowerCase() === 'j') ||
            input.key === 'F12') {
            event.preventDefault();
        }
    });

    // 預防任何開啟 DevTools 的行為
    mainWindow.webContents.on('devtools-opened', () => {
        mainWindow.webContents.closeDevTools();
    });

    // 禁止開啟新視窗或導覽到外部網址（例如拖入檔案或點擊連結時，視窗不應跳轉離開編輯器）
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event) => {
        event.preventDefault();
    });

    // 直接載入本地 HTML 檔案，不需額外啟動本機伺服器，速度最快且最省資源
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // 隱藏預設的頂部功能選單（選單欄），讓畫面更像原生專業桌面軟體
    mainWindow.setMenuBarVisibility(false);
}
// 資源優化：確保單一實例（防止重複開啟多個程式佔用記憶體）
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length) {
            if (windows[0].isMinimized()) windows[0].restore();
            windows[0].focus();
        }
    });

    app.whenReady().then(() => {
        // Register IPC handlers
        ipcMain.handle('load-wasm', () => {
            try {
                const wasmPath = path.join(__dirname, 'image_processor.wasm');
                return fs.readFileSync(wasmPath);
            } catch (err) {
                console.error("Failed to load wasm:", err);
                return null;
            }
        });
        
        ipcMain.handle('load-sample', () => {
            try {
                return fs.readFileSync(path.join(__dirname, 'sample.jpg'));
            } catch (err) {
                console.error("Failed to load sample image:", err);
                return null;
            }
        });
        
        ipcMain.handle('check-for-updates', () => updater.checkForUpdates(true));
        ipcMain.handle('download-update', () => updater.downloadUpdate());
        ipcMain.handle('install-update', () => updater.installUpdate());
        ipcMain.handle('install-update-later', () => updater.installOnQuit());
        ipcMain.handle('open-releases-page', () => updater.openReleasesPage());

        createWindow();

        // Give the editor time to finish loading before the background update check.
        setTimeout(() => updater.checkForUpdates(false), 5000);

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
