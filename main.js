const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const crypto = require('crypto');

const licenseFile = path.join(app.getPath('userData'), 'license.json');

let hwidPromise = null;

// Runs a PowerShell command without blocking the main process (and without flashing a console window).
function runPowerShell(command) {
    return new Promise((resolve) => {
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 10000
        }, (error, stdout) => {
            resolve(error ? '' : (stdout || '').trim());
        });
    });
}

async function queryHardwareID() {
    let boardUUID = "";
    let cpuID = "";

    // Query both properties in a single PowerShell process
    const powershellCmd = '$board=(Get-CimInstance Win32_ComputerSystemProduct).UUID; if (!$board -or $board -eq "00000000-0000-0000-0000-000000000000") { $board=(Get-CimInstance Win32_BIOS).SerialNumber }; $cpu=(Get-CimInstance Win32_Processor).ProcessorId; Write-Output "$board|$cpu"';
    const parts = (await runPowerShell(powershellCmd)).split('|');
    if (parts.length >= 2) {
        boardUUID = parts[0].trim();
        cpuID = parts[1].trim();
    }

    // Fallback to individual commands if the combined command fails or returns empty results
    if (!boardUUID && !cpuID) {
        boardUUID = await runPowerShell('(Get-CimInstance Win32_ComputerSystemProduct).UUID');
        if (!boardUUID || boardUUID === "00000000-0000-0000-0000-000000000000") {
            boardUUID = await runPowerShell('(Get-CimInstance Win32_BIOS).SerialNumber');
        }
        cpuID = await runPowerShell('(Get-CimInstance Win32_Processor).ProcessorId');
    }

    if (!boardUUID && !cpuID) {
        return require('os').hostname() || "UNKNOWN-HOST";
    }
    return `${boardUUID}-${cpuID}`.trim();
}

// Resolved once and cached; the HWID format is unchanged so existing license keys stay valid.
function getHardwareID() {
    if (!hwidPromise) {
        hwidPromise = queryHardwareID().catch(() => "UNKNOWN-HWID");
    }
    return hwidPromise;
}

// ---- License verification ----
// A license key is an Ed25519 signature of the hardware ID (Base32, grouped by 5). Only the public key
// ships with the app (license-public.json); keys are issued with tools/license.js and the private key.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(text) {
    let bits = 0, value = 0;
    const out = [];
    for (const ch of text) {
        const idx = BASE32_ALPHABET.indexOf(ch);
        if (idx < 0) return null;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

function normalizeKey(key) {
    return typeof key === 'string' ? key.replace(/[\s-]+/g, '').toUpperCase() : '';
}

let cachedPublicKey;
function getPublicKey() {
    if (cachedPublicKey !== undefined) return cachedPublicKey;
    try {
        const file = path.join(__dirname, 'license-public.json');
        const { publicKey } = JSON.parse(fs.readFileSync(file, 'utf8'));
        cachedPublicKey = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    } catch (e) {
        console.error('License public key unavailable:', e.message);
        cachedPublicKey = null;
    }
    return cachedPublicKey;
}

function verifyKey(hwid, key) {
    if (!hwid || hwid === "UNKNOWN-HWID") return false;
    const publicKey = getPublicKey();
    const signature = decodeBase32(normalizeKey(key));
    if (!publicKey || !signature || signature.length !== 64) return false;
    try {
        return crypto.verify(null, Buffer.from(hwid, 'utf8'), publicKey, signature);
    } catch (e) {
        return false;
    }
}

async function isLicenseValid() {
    if (!fs.existsSync(licenseFile)) return false;
    try {
        const data = JSON.parse(fs.readFileSync(licenseFile, 'utf8'));
        return !!data && verifyKey(await getHardwareID(), data.key);
    } catch (e) {
        return false;
    }
}

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
        ipcMain.handle('get-hwid', () => {
            return getHardwareID();
        });
        
        ipcMain.handle('check-license', async () => {
            return isLicenseValid();
        });
        
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
        
        ipcMain.handle('verify-and-save', async (event, key) => {
            const hwid = await getHardwareID();
            if (!verifyKey(hwid, key)) return false;
            try {
                fs.writeFileSync(licenseFile, JSON.stringify({ key: normalizeKey(key) }), 'utf8');
                return true;
            } catch (e) {
                console.error("Failed to write license file:", e);
                return false;
            }
        });

        createWindow();

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
