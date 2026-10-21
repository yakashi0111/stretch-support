'use strict';
// ビルドした .app に ad-hoc 署名 (開発者証明書なし) を付ける。Apple Silicon で「壊れている」と言われにくくするため。
// macOS 以外では何もしない。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.platform !== 'darwin') {
    console.log('macOS 以外なので署名はスキップしました (Mac 上でビルドしてください)');
    process.exit(0);
}
const dist = path.join(__dirname, '..', 'dist');
const apps = fs.readdirSync(dist, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(dist, d.name, 'Stretch Tool.app'))
    .filter(p => fs.existsSync(p));
if (!apps.length) { console.error('dist/ に Stretch Tool.app が見つかりません'); process.exit(1); }
for (const app of apps) {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
    try { execFileSync('xattr', ['-cr', app]); } catch (e) { /* ignore */ }
    console.log('ad-hoc signed:', app);
}
