'use strict';
// Electron なしで、ミニ表示の位置・サイズ・最前面の切り替えロジックを検証する: npm test
const assert = require('assert');
const { EventEmitter } = require('events');
const { createMiniController, clampRect, MINI_DEFAULT, MINI_MIN, NORMAL_MIN, MARGIN } = require('../mini-window');

function makeEnv({ bounds, displays, fullscreen = false, maximized = false }) {
    const log = [];
    const ee = new EventEmitter();
    let b = { ...bounds };
    const win = Object.assign(ee, {
        getBounds: () => ({ ...b }),
        getNormalBounds: () => ({ ...b }),
        setBounds: r => { b = { ...r }; log.push(['setBounds', r]); },
        isFullScreen: () => fullscreen,
        setFullScreen: v => { fullscreen = v; if (!v) setImmediate(() => ee.emit('leave-full-screen')); },
        isMaximized: () => maximized,
        unmaximize: () => { maximized = false; log.push(['unmaximize']); },
        setMinimumSize: (w, h) => log.push(['setMinimumSize', w, h]),
        setMaximizable: v => log.push(['setMaximizable', v]),
        setMinimizable: v => log.push(['setMinimizable', v]),
        setFullScreenable: v => log.push(['setFullScreenable', v]),
        setAlwaysOnTop: (v, level) => log.push(['setAlwaysOnTop', v, level]),
        setVisibleOnAllWorkspaces: (v, o) => log.push(['setVisibleOnAllWorkspaces', v, o]),
        isVisible: () => true, showInactive: () => log.push(['showInactive']), show: () => log.push(['show']),
        userMove: (x, y) => { b.x = x; b.y = y; ee.emit('move'); },
    });
    const screen = {
        getDisplayMatching: r => {
            const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
            return displays.find(d => cx >= d.workArea.x && cx < d.workArea.x + d.workArea.width && cy >= d.workArea.y && cy < d.workArea.y + d.workArea.height) || displays[0];
        },
    };
    let dockShown = 0;
    const app = { dock: { show: async () => { dockShown++; } } };
    return { win, screen, app, log, dock: () => dockShown, bounds: () => ({ ...b }) };
}
const main = { workArea: { x: 0, y: 38, width: 1512, height: 905 } };   // メニューバー/ノッチ分 y=38
const second = { workArea: { x: 1512, y: 0, width: 1920, height: 1055 } };
const last = (log, name) => [...log].reverse().find(e => e[0] === name);

(async () => {
    // 1. 初回: 画面右上 (workArea の内側・余白つき) に 320x150、最前面 + 全画面 Space 上に表示
    {
        const e = makeEnv({ bounds: { x: 200, y: 100, width: 480, height: 820 }, displays: [main] });
        const c = createMiniController({ ...e, platform: 'darwin' });
        assert.strictEqual(await c.setMini(true), true);
        assert.deepStrictEqual(e.bounds(), { x: 1512 - 320 - MARGIN, y: 38 + MARGIN, width: 320, height: 150 });
        assert.deepStrictEqual(last(e.log, 'setAlwaysOnTop'), ['setAlwaysOnTop', true, 'screen-saver']);
        assert.deepStrictEqual(last(e.log, 'setVisibleOnAllWorkspaces'), ['setVisibleOnAllWorkspaces', true, { visibleOnFullScreen: true }]);
        assert.deepStrictEqual(last(e.log, 'setMinimumSize'), ['setMinimumSize', MINI_MIN.width, MINI_MIN.height]);
        // 2. 動かさずに戻す → 元の位置とサイズへ完全に復元、最前面は解除
        assert.strictEqual(await c.setMini(false), false);
        assert.deepStrictEqual(e.bounds(), { x: 200, y: 100, width: 480, height: 820 });
        assert.strictEqual(last(e.log, 'setAlwaysOnTop')[1], false);
        assert.strictEqual(last(e.log, 'setVisibleOnAllWorkspaces')[1], false);
        assert.deepStrictEqual(last(e.log, 'setMinimumSize'), ['setMinimumSize', NORMAL_MIN.width, NORMAL_MIN.height]);
        assert.strictEqual(e.dock(), 1);
    }
    // 3. ミニをユーザーが動かした → 元の位置へ飛ばず、今の位置から広がる (はみ出す分は内側へ)
    {
        const e = makeEnv({ bounds: { x: 200, y: 100, width: 480, height: 820 }, displays: [main] });
        const c = createMiniController({ ...e, platform: 'darwin' });
        await c.setMini(true);
        e.win.userMove(900, 600);
        await c.setMini(false);
        const b = e.bounds();
        assert.strictEqual(b.width, 480); assert.strictEqual(b.height, 820 > 905 ? 905 : 820);
        assert.ok(b.x >= 0 && b.x + b.width <= 1512, 'x within work area');
        assert.ok(b.y >= 38 && b.y + b.height <= 38 + 905, 'y within work area');
        assert.strictEqual(b.x, 900);                // 横は今の位置から (収まるので動かさない)
        assert.strictEqual(b.y, 38 + 905 - 820);     // 縦ははみ出す分だけ上へ寄せる
    }
    // 4. 別のディスプレイへ動かした → そのディスプレイ上に戻る
    {
        const e = makeEnv({ bounds: { x: 200, y: 100, width: 480, height: 820 }, displays: [main, second] });
        const c = createMiniController({ ...e, platform: 'darwin' });
        await c.setMini(true);
        e.win.userMove(2000, 50);
        await c.setMini(false);
        const b = e.bounds();
        assert.ok(b.x >= 1512 && b.x + b.width <= 1512 + 1920, 'on second display');
    }
    // 5. 次回のミニは、前回ユーザーが置いた位置・大きさで開く
    {
        const e = makeEnv({ bounds: { x: 200, y: 100, width: 480, height: 820 }, displays: [main] });
        const c = createMiniController({ ...e, platform: 'darwin' });
        await c.setMini(true); e.win.userMove(100, 500); await c.setMini(false);
        await c.setMini(true);
        assert.deepStrictEqual({ x: e.bounds().x, y: e.bounds().y }, { x: 100, y: 500 });
    }
    // 6. 前回の位置が今の画面の外 (外部ディスプレイを外した等) なら、画面内へ収める
    {
        const e = makeEnv({ bounds: { x: 200, y: 100, width: 480, height: 820 }, displays: [main, second] });
        const c = createMiniController({ ...e, platform: 'darwin' });
        await c.setMini(true); e.win.userMove(3000, 300); await c.setMini(false);
        e.screen.getDisplayMatching = r => ({ workArea: main.workArea });   // second を外した
        await c.setMini(true);
        const b = e.bounds();
        assert.ok(b.x + b.width <= 1512 && b.x >= 0 && b.y >= 38, 'clamped into remaining display');
    }
    // 7. 全画面で切り替えた → 全画面を抜けてから小さくする / 通常へ戻すと元のサイズ
    {
        const e = makeEnv({ bounds: { x: 0, y: 0, width: 1512, height: 982 }, displays: [main], fullscreen: true });
        const c = createMiniController({ ...e, platform: 'darwin' });
        assert.strictEqual(await c.setMini(true), true);
        assert.strictEqual(e.win.isFullScreen(), false);
    }
    // 8. 連打・二重呼び出し
    {
        const e = makeEnv({ bounds: { x: 200, y: 100, width: 480, height: 820 }, displays: [main] });
        const c = createMiniController({ ...e, platform: 'darwin' });
        const [a, b] = await Promise.all([c.setMini(true), c.setMini(true)]);
        assert.strictEqual(c.isMini(), true);
        assert.strictEqual(await c.setMini(true), true);
        assert.strictEqual(e.log.filter(l => l[0] === 'setAlwaysOnTop' && l[1] === true).length, 1);
        await c.setMini(false);
        assert.strictEqual(await c.setMini(false), false);
    }
    // clampRect
    assert.deepStrictEqual(clampRect({ x: -50, y: -50, width: 300, height: 100 }, { x: 0, y: 38, width: 1000, height: 700 }), { x: 0, y: 38, width: 300, height: 100 });
    assert.deepStrictEqual(clampRect({ x: 900, y: 700, width: 300, height: 100 }, { x: 0, y: 38, width: 1000, height: 700 }), { x: 700, y: 638, width: 300, height: 100 });
    assert.deepStrictEqual(clampRect({ x: 0, y: 0, width: 2000, height: 100 }, { x: 0, y: 0, width: 1000, height: 700 }), { x: 0, y: 0, width: 1000, height: 100 });
    console.log('mini-window tests passed');
})().catch(e => { console.error(e); process.exit(1); });
