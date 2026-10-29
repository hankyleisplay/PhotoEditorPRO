const { app, dialog, shell, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');

const RELEASES_URL = 'https://github.com/hankyleisplay/PhotoEditorPRO/releases/latest';

// The portable build is a self-extracting exe that cannot replace itself; only the NSIS installer can.
const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE;

let wired = false;
let manualCheck = false;

function getWindow() {
    return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function showMessage(options) {
    const win = getWindow();
    return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

function wireUpdater() {
    if (wired) return;
    wired = true;

    // Ask before downloading, and install on the next quit if the user postpones the restart.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('update-available', async (info) => {
        manualCheck = false;
        const { response } = await showMessage({
            type: 'info',
            title: '發現新版本',
            message: `Photo Editor PRO ${info.version} 已發布`,
            detail: `目前版本為 ${app.getVersion()}，要現在下載更新嗎？`,
            buttons: ['下載更新', '稍後'],
            defaultId: 0,
            cancelId: 1
        });
        if (response === 0) {
            autoUpdater.downloadUpdate().catch((e) => console.error('Update download failed:', e));
        }
    });

    autoUpdater.on('update-not-available', () => {
        if (!manualCheck) return;
        manualCheck = false;
        showMessage({
            type: 'info',
            title: '檢查更新',
            message: '目前已是最新版本',
            detail: `版本 ${app.getVersion()}`,
            buttons: ['好']
        });
    });

    autoUpdater.on('download-progress', (progress) => {
        const win = getWindow();
        if (win) win.setProgressBar(progress.percent / 100);
    });

    autoUpdater.on('update-downloaded', async (info) => {
        const win = getWindow();
        if (win) win.setProgressBar(-1);
        const { response } = await showMessage({
            type: 'info',
            title: '更新已下載',
            message: `Photo Editor PRO ${info.version} 已準備好安裝`,
            detail: '要現在重新啟動並安裝嗎？選擇「稍後」會在下次關閉程式時自動安裝。',
            buttons: ['重新啟動並安裝', '稍後'],
            defaultId: 0,
            cancelId: 1
        });
        if (response === 0) {
            autoUpdater.quitAndInstall();
        } else {
            autoUpdater.autoInstallOnAppQuit = true;
        }
    });

    autoUpdater.on('error', (err) => {
        console.error('Auto-update error:', err);
        const win = getWindow();
        if (win) win.setProgressBar(-1);
        if (!manualCheck) return;
        manualCheck = false;
        showMessage({
            type: 'warning',
            title: '檢查更新失敗',
            message: '無法取得更新資訊，請確認網路連線後再試。',
            buttons: ['好']
        });
    });
}

// manual = true when the user clicked "check for updates": then every outcome is reported, not just "update found".
async function checkForUpdates(manual) {
    if (!app.isPackaged) {
        if (manual) {
            await showMessage({ type: 'info', title: '檢查更新', message: '開發模式不支援自動更新。', buttons: ['好'] });
        }
        return;
    }

    if (isPortable) {
        if (manual) {
            const { response } = await showMessage({
                type: 'info',
                title: '檢查更新',
                message: '免安裝版無法自動更新',
                detail: '請前往 GitHub 下載最新版本，或改用安裝版以取得自動更新。',
                buttons: ['開啟下載頁面', '取消'],
                defaultId: 0,
                cancelId: 1
            });
            if (response === 0) shell.openExternal(RELEASES_URL);
        }
        return;
    }

    wireUpdater();
    manualCheck = manual;
    try {
        await autoUpdater.checkForUpdates();
    } catch (e) {
        // The 'error' event handler already reports it.
    }
}

module.exports = { checkForUpdates };
