const { app, shell, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');

const RELEASES_URL = 'https://github.com/hankyleisplay/PhotoEditorPRO/releases/latest';

// The portable build is a self-extracting exe that cannot replace itself; only the NSIS installer can.
const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE;

let wired = false;
let manualCheck = false;   // the user asked for this check, so every outcome is shown
let downloading = false;   // a download the user started is in flight, so its errors are shown

// All feedback goes to the editor window, which draws it in its own UI (no native dialogs).
function send(status) {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('update-status', status);
        }
    }
}

function setTaskbarProgress(value) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.setProgressBar(value);
}

function wireUpdater() {
    if (wired) return;
    wired = true;

    // The user decides when to download and when to restart.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('update-available', (info) => {
        manualCheck = false;
        send({ state: 'available', version: info.version, current: app.getVersion() });
    });

    autoUpdater.on('update-not-available', () => {
        if (!manualCheck) return;
        manualCheck = false;
        send({ state: 'uptodate', current: app.getVersion() });
    });

    autoUpdater.on('download-progress', (progress) => {
        setTaskbarProgress(progress.percent / 100);
        send({
            state: 'downloading',
            percent: progress.percent,
            speed: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        downloading = false;
        setTaskbarProgress(-1);
        send({ state: 'downloaded', version: info.version });
    });

    autoUpdater.on('error', (err) => {
        console.error('Auto-update error:', err);
        setTaskbarProgress(-1);
        const show = manualCheck || downloading;
        manualCheck = false;
        downloading = false;
        if (show) send({ state: 'error' });
    });
}

// manual = true when the user clicked "check for updates": then every outcome is reported, not just "update found".
async function checkForUpdates(manual) {
    if (!app.isPackaged) {
        if (manual) send({ state: 'dev' });
        return;
    }

    if (isPortable) {
        if (manual) send({ state: 'portable' });
        return;
    }

    wireUpdater();
    manualCheck = manual;
    if (manual) send({ state: 'checking' });
    try {
        await autoUpdater.checkForUpdates();
    } catch (e) {
        // The 'error' event handler already reports it.
    }
}

function downloadUpdate() {
    downloading = true;
    send({ state: 'downloading', percent: 0, speed: 0, transferred: 0, total: 0 });
    autoUpdater.downloadUpdate().catch(() => {
        // The 'error' event handler already reports it.
    });
}

function installUpdate() {
    autoUpdater.quitAndInstall();
}

// "Later": install when the user next closes the app.
function installOnQuit() {
    autoUpdater.autoInstallOnAppQuit = true;
}

function openReleasesPage() {
    shell.openExternal(RELEASES_URL);
}

module.exports = { checkForUpdates, downloadUpdate, installUpdate, installOnQuit, openReleasesPage };
