'use strict';
const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { createMiniController, NORMAL_DEFAULT, NORMAL_MIN } = require('./mini-window');

let win = null;
let mini = null;

/* ---------- データ保存 (userData/stretch-data.json) ---------- */
const dataFile = () => path.join(app.getPath('userData'), 'stretch-data.json');
const isJson = t => { try { JSON.parse(t); return true; } catch (e) { return false; } };

function readData() {
    for (const f of [dataFile(), dataFile() + '.bak']) {   // 本体が壊れていたらバックアップから
        try { const t = fs.readFileSync(f, 'utf8'); if (isJson(t)) return t; } catch (e) { /* 次へ */ }
    }
    return null;
}
function writeData(text) {
    const f = dataFile(), tmp = f + '.tmp';
    try {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(tmp, text, 'utf8');
        if (fs.existsSync(f)) { try { fs.copyFileSync(f, f + '.bak'); } catch (e) { /* ignore */ } }
        fs.renameSync(tmp, f);   // 書き込み途中で落ちても本体が壊れないよう、一時ファイル経由
        return true;
    } catch (e) { return false; }
}

const fromMainWindow = e => win && e.sender === win.webContents;
ipcMain.on('data:load-sync', e => { e.returnValue = fromMainWindow(e) ? readData() : null; });
ipcMain.on('data:save', (e, text) => {
    if (fromMainWindow(e) && typeof text === 'string' && text.length < 5 * 1024 * 1024 && isJson(text)) writeData(text);
});
ipcMain.handle('window:set-mini', (e, on) => (fromMainWindow(e) && mini ? mini.setMini(!!on) : false));

/* ---------- ウィンドウ ---------- */
function createWindow() {
    win = new BrowserWindow({
        width: NORMAL_DEFAULT.width, height: NORMAL_DEFAULT.height,
        minWidth: NORMAL_MIN.width, minHeight: NORMAL_MIN.height,
        // macOS の全画面 Space 上にもミニ表示を載せられるよう、パネル型で作成する。
        ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
        title: 'Stretch Tool',
        backgroundColor: '#0b0c0f',
        titleBarStyle: 'hidden',                 // 太いタイトルバーをなくし、信号ボタンだけ残す
        trafficLightPosition: { x: 14, y: 7 },
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            spellcheck: false,
        },
    });
    mini = createMiniController({ win, screen, app });
    win.on('move', () => mini && mini.handleMove());
    win.once('ready-to-show', () => win.show());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());   // 外部ページへは遷移させない
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    win.on('closed', () => { win = null; mini = null; });
}

function buildMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
        ...(isMac ? [{ role: 'appMenu' }] : []),
        { role: 'editMenu' },   // 入力欄の コピー/ペースト に必要 (アプリ内だけで有効。グローバルショートカットではない)
        { label: '表示', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
        { role: 'windowMenu' },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
    app.whenReady().then(() => {
        buildMenu();
        createWindow();
        app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
    });
    app.on('window-all-closed', () => app.quit());
}
