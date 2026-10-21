'use strict';
// リポジトリ直下の index.html (Web版と共通の本体) を Electron 用の renderer/ へコピーする
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'index.html');
const destDir = path.join(__dirname, '..', 'renderer');
if (!fs.existsSync(src)) {
    console.error('index.html が見つかりません:', src);
    process.exit(1);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'index.html'));
console.log('synced: index.html -> electron/renderer/index.html');
