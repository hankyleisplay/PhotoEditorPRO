const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const licenseFile = path.join(app.getPath('userData'), 'license.json');

let cachedHWID = null;

function getHardwareID() {
    if (cachedHWID !== null) {
        return cachedHWID;
    }

    try {
        let boardUUID = "";
        let cpuID = "";

        // Query both properties in a single PowerShell process using spawnSync to avoid shell quoting/escaping issues
        const powershellCmd = '$board=(Get-CimInstance Win32_ComputerSystemProduct).UUID; if (!$board -or $board -eq "00000000-0000-0000-0000-000000000000") { $board=(Get-CimInstance Win32_BIOS).SerialNumber }; $cpu=(Get-CimInstance Win32_Processor).ProcessorId; Write-Output "$board|$cpu"';
        
        try {
            const result = spawnSync('powershell', [
                '-NoProfile',
                '-WindowStyle', 'Hidden',
                '-Command',
                powershellCmd
            ], { encoding: 'utf8' });

            if (!result.error) {
                const rawOutput = (result.stdout || '').trim();
                const parts = rawOutput.split('|');
                if (parts.length >= 2) {
                    boardUUID = parts[0].trim();
                    cpuID = parts[1].trim();
                }
            }
        } catch (e) {
            // Ignore optimization failure and fall back
        }
        
        // Fallback to individual commands if the optimized single command fails or returns empty results
        if (!boardUUID && !cpuID) {
            try {
                const resUUID = spawnSync('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID'], { encoding: 'utf8' });
                boardUUID = (resUUID.stdout || '').trim();
            } catch (e) {
                // Ignore
            }
            
            if (!boardUUID || boardUUID === "00000000-0000-0000-0000-000000000000") {
                try {
                    const resBIOS = spawnSync('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', '(Get-CimInstance Win32_BIOS).SerialNumber'], { encoding: 'utf8' });
                    boardUUID = (resBIOS.stdout || '').trim();
                } catch (e) {
                    // Ignore
                }
            }
            
            try {
                const resCPU = spawnSync('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', '(Get-CimInstance Win32_Processor).ProcessorId'], { encoding: 'utf8' });
                cpuID = (resCPU.stdout || '').trim();
            } catch (e) {
                // Ignore
            }
        }
        
        if (!boardUUID && !cpuID) {
            cachedHWID = require('os').hostname() || "UNKNOWN-HOST";
        } else {
            cachedHWID = `${boardUUID}-${cpuID}`.trim();
        }
        
        return cachedHWID;
    } catch (err) {
        return "UNKNOWN-HWID";
    }
}

function generateKey(hwid) {
    if (!hwid || hwid === "UNKNOWN-HWID") return null;
    
    // Obfuscated Salt parts to prevent simple string recovery
    const _p1 = "PhotoEditorPRO";
    const _p2 = "Licensing";
    const _p3 = "System";
    const _p4 = "SecretSalt";
    const _p5 = "2026_@#$!";
    const salt = [_p1, _p2, _p3, _p4, _p5].join("_");

    // Phase 1: SHA256 of hwid + salt (lowercase hex format)
    const input1 = hwid + salt;
    const hash1 = crypto.createHash('sha256').update(input1, 'utf8').digest('hex').toLowerCase();
    
    // Phase 2: Reverse hash1 to make reverse engineering harder
    const reversedHash1 = hash1.split('').reverse().join('');
    
    // Phase 3: SHA256 of reversedHash1 + salt + hwid (uppercase hex format)
    const input2 = reversedHash1 + salt + hwid;
    const hash2 = crypto.createHash('sha256').update(input2, 'utf8').digest('hex').toUpperCase();
    
    // Phase 4: Format as XXXXX-XXXXX-XXXXX-XXXXX
    const cleanHex = hash2.substring(0, 20);
    let serial = "";
    for (let i = 0; i < cleanHex.length; i += 5) {
        if (i > 0) serial += "-";
        serial += cleanHex.substring(i, i + 5);
    }
    return serial;
}

function isLicenseValid() {
    if (!fs.existsSync(licenseFile)) return false;
    try {
        const data = JSON.parse(fs.readFileSync(licenseFile, 'utf8'));
        const hwid = getHardwareID();
        const expectedKey = generateKey(hwid);
        return data && data.key === expectedKey;
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
        
        ipcMain.handle('check-license', () => {
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
        
        ipcMain.handle('verify-and-save', (event, key) => {
            const hwid = getHardwareID();
            const expected = generateKey(hwid);
            if (key && key.trim().toUpperCase() === expected) {
                try {
                    fs.writeFileSync(licenseFile, JSON.stringify({ key: key.trim().toUpperCase() }), 'utf8');
                    return true;
                } catch (e) {
                    console.error("Failed to write license file:", e);
                    return false;
                }
            }
            return false;
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
