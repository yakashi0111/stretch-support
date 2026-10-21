'use strict';
// レンダラーへ公開するのは、この3つだけ (contextIsolation 有効・nodeIntegration 無効)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stretchNative', Object.freeze({
    isElectron: true,
    platform: process.platform,
    // ルーティーンデータ (userData 内のファイル) の読み書き
    loadDataSync: () => ipcRenderer.sendSync('data:load-sync'),
    saveData: text => ipcRenderer.send('data:save', String(text)),
    // ミニ表示 (true) / 通常表示 (false)。実際の状態 (boolean) を返す
    setMini: on => ipcRenderer.invoke('window:set-mini', !!on),
}));
