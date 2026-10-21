'use strict';
/**
 * 通常表示 <-> ミニ表示 の切り替えロジック。
 * Electron の BrowserWindow / screen / app を引数で受け取るので、Electron なしでもテストできる。
 */

const MINI_DEFAULT = { width: 320, height: 150 };
const MINI_MIN = { width: 240, height: 120 };
const NORMAL_DEFAULT = { width: 480, height: 820 };
const NORMAL_MIN = { width: 320, height: 360 };
const MARGIN = 16;          // ミニウィンドウと画面端の余白
const MOVE_TOLERANCE = 2;   // これ以上ずれたら「ユーザーが動かした」とみなす (px)

/** rect を area (workArea) の内側に収める。area が小さければ rect の方を縮める。 */
function clampRect(rect, area) {
    const width = Math.min(rect.width, area.width);
    const height = Math.min(rect.height, area.height);
    const x = Math.min(Math.max(rect.x, area.x), area.x + area.width - width);
    const y = Math.min(Math.max(rect.y, area.y), area.y + area.height - height);
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function createMiniController({ win, screen, app, platform = process.platform }) {
    const state = {
        mini: false,
        busy: false,
        normalBounds: null,   // ミニに入る直前の通常ウィンドウの位置とサイズ
        expectedPos: null,    // ミニに入った時にこちらが置いた位置 (動かされたか判定する基準)
        userMoved: false,
        miniSize: null,       // 前回のミニの大きさ (リサイズを覚える)
        miniPos: null,        // 前回のミニの位置
    };

    const areaFor = rect => screen.getDisplayMatching(rect).workArea;   // メニューバー・ノッチ・Dock を除いた領域
    const moved = (b, p) => !!p && (Math.abs(b.x - p.x) > MOVE_TOLERANCE || Math.abs(b.y - p.y) > MOVE_TOLERANCE);

    function waitLeaveFullScreen() {
        return new Promise(resolve => {
            const done = () => { clearTimeout(timer); resolve(); };
            const timer = setTimeout(() => { win.removeListener('leave-full-screen', done); resolve(); }, 2500);
            win.once('leave-full-screen', done);
            win.setFullScreen(false);
        });
    }

    async function enter() {
        if (win.isFullScreen()) await waitLeaveFullScreen();
        // 最大化/全画面でも「通常状態」の位置とサイズが返る
        state.normalBounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
        if (win.isMaximized && win.isMaximized()) win.unmaximize();

        const size = state.miniSize || MINI_DEFAULT;
        const homeArea = areaFor(state.normalBounds);
        let rect = { x: 0, y: 0, width: size.width, height: size.height };
        if (state.miniPos) {
            rect.x = state.miniPos.x; rect.y = state.miniPos.y;
            rect = clampRect(rect, areaFor(rect));            // 前回の位置 (画面構成が変わっていれば収め直す)
        } else {
            rect.x = homeArea.x + homeArea.width - size.width - MARGIN;   // 初回は今の画面の右上
            rect.y = homeArea.y + MARGIN;
            rect = clampRect(rect, homeArea);
        }

        state.expectedPos = { x: rect.x, y: rect.y };
        state.userMoved = false;
        state.mini = true;

        win.setMinimumSize(MINI_MIN.width, MINI_MIN.height);
        win.setMaximizable(false);      // ダブルクリックでの拡大・最小化を防ぐ
        win.setMinimizable(false);
        win.setFullScreenable(false);
        win.setBounds(rect);
        // ミニ表示の間だけ最前面。'screen-saver' レベル + 全画面 Space 上にも表示
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        if (!win.isVisible()) win.showInactive();
    }

    async function exit() {
        const b = win.getBounds();
        const userMoved = state.userMoved || moved(b, state.expectedPos);
        state.miniSize = { width: b.width, height: b.height };
        state.miniPos = { x: b.x, y: b.y };
        state.mini = false;
        state.expectedPos = null;

        win.setAlwaysOnTop(false);
        win.setVisibleOnAllWorkspaces(false);
        win.setFullScreenable(true);
        win.setMaximizable(true);
        win.setMinimizable(true);
        win.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height);
        if (platform === 'darwin' && app && app.dock) {
            try { await app.dock.show(); } catch (e) { /* Dock が非表示になっていた場合に戻すだけ */ }
        }

        const normal = state.normalBounds || { x: b.x, y: b.y, width: NORMAL_DEFAULT.width, height: NORMAL_DEFAULT.height };
        let target;
        if (!userMoved) {
            // 動かされていなければ、切替前の位置とサイズへそのまま戻す (画面構成が変わっていれば収め直す)
            target = clampRect(normal, areaFor(normal));
        } else {
            // 動かされていたら、今の位置から広げる (元の位置へ飛ばさない)。はみ出す分だけ内側へ寄せる
            target = clampRect({ x: b.x, y: b.y, width: normal.width, height: normal.height }, areaFor(b));
        }
        win.setBounds(target);
        win.show();
    }

    async function setMini(on) {
        on = !!on;
        if (state.busy || on === state.mini) return state.mini;
        state.busy = true;
        try { if (on) await enter(); else await exit(); }
        finally { state.busy = false; }
        return state.mini;
    }

    /** win.on('move') から呼ぶ。ミニ中にユーザーが動かしたかを記録する */
    function handleMove() {
        if (!state.mini || !state.expectedPos) return;
        if (moved(win.getBounds(), state.expectedPos)) state.userMoved = true;
    }

    return { setMini, handleMove, isMini: () => state.mini, _state: state };
}

module.exports = { createMiniController, clampRect, MINI_DEFAULT, MINI_MIN, NORMAL_DEFAULT, NORMAL_MIN, MARGIN };
