// ===== ログイン方式の判定のテスト =====
// 実行: node --test js/sync/auth-environment.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isStandaloneDisplay,
    shouldUseRedirectSignIn,
    parsePendingRedirect,
    REDIRECT_MAX_AGE_MS,
} from './auth-environment.js';

/** ブラウザ環境を模した最小限のオブジェクトを作る */
function fakeWindow({ iosStandalone = undefined, displayMode = null, matchMedia = true } = {}) {
    const navigator = iosStandalone === undefined ? {} : { standalone: iosStandalone };
    if (!matchMedia) return { navigator };
    return {
        navigator,
        matchMedia: (query) => ({ matches: displayMode !== null && query === `(display-mode: ${displayMode})` }),
    };
}

test('ブラウザのタブではリダイレクトを使わない', () => {
    const win = fakeWindow({ iosStandalone: false, displayMode: 'browser' });
    assert.equal(isStandaloneDisplay(win), false);
    assert.equal(shouldUseRedirectSignIn(win), false);
});

test('iOSのホーム画面アプリを検出する', () => {
    const win = fakeWindow({ iosStandalone: true, displayMode: 'browser' });
    assert.equal(isStandaloneDisplay(win), true);
    assert.equal(shouldUseRedirectSignIn(win), true);
});

test('display-mode: standalone のPWAを検出する', () => {
    assert.equal(isStandaloneDisplay(fakeWindow({ displayMode: 'standalone' })), true);
});

test('fullscreen と minimal-ui もアプリ起動として扱う', () => {
    assert.equal(isStandaloneDisplay(fakeWindow({ displayMode: 'fullscreen' })), true);
    assert.equal(isStandaloneDisplay(fakeWindow({ displayMode: 'minimal-ui' })), true);
});

test('matchMedia が無い環境でも例外を出さない', () => {
    assert.equal(isStandaloneDisplay(fakeWindow({ matchMedia: false })), false);
    assert.equal(isStandaloneDisplay(undefined), false);
});

test('matchMedia が例外を投げても判定を続ける', () => {
    const win = { navigator: {}, matchMedia: () => { throw new Error('unsupported'); } };
    assert.equal(isStandaloneDisplay(win), false);
});

test('保存したリダイレクトの意図を読み戻せる', () => {
    const now = 1_700_000_000_000;
    const raw = JSON.stringify({ purpose: 'signIn', remember: true, startedAt: now - 1000 });
    assert.deepEqual(parsePendingRedirect(raw, now), { purpose: 'signIn', remember: true, startedAt: now - 1000 });
});

test('purpose と remember の既定値を補う', () => {
    const now = 1_700_000_000_000;
    const raw = JSON.stringify({ startedAt: now });
    assert.deepEqual(parsePendingRedirect(raw, now), { purpose: 'signIn', remember: false, startedAt: now });
});

test('アカウント削除の意図は保たれる', () => {
    const now = 1_700_000_000_000;
    const raw = JSON.stringify({ purpose: 'deleteAccount', startedAt: now });
    assert.equal(parsePendingRedirect(raw, now)?.purpose, 'deleteAccount');
});

test('古い記録は無視する', () => {
    const now = 1_700_000_000_000;
    const raw = JSON.stringify({ purpose: 'signIn', startedAt: now - REDIRECT_MAX_AGE_MS - 1 });
    assert.equal(parsePendingRedirect(raw, now), null);
});

test('未来の時刻が入った記録は無視する', () => {
    const now = 1_700_000_000_000;
    const raw = JSON.stringify({ purpose: 'signIn', startedAt: now + 10 * 60 * 1000 });
    assert.equal(parsePendingRedirect(raw, now), null);
});

test('壊れた値や空の値は無視する', () => {
    assert.equal(parsePendingRedirect(null), null);
    assert.equal(parsePendingRedirect(''), null);
    assert.equal(parsePendingRedirect('{'), null);
    assert.equal(parsePendingRedirect('"文字列"'), null);
    assert.equal(parsePendingRedirect(JSON.stringify({ purpose: 'signIn' })), null); // startedAt が無い
});
