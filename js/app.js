// ===== メインアプリケーション =====
import * as store from './store.js';
import { generateDummyData } from './dummy-data.js';
import * as inputForm from './views/input-form.js';
import * as listView from './views/list-view.js';
import * as recommendView from './views/recommendations.js';
import * as dashboard from './views/dashboard.js';
import * as settingsView from './views/settings.js';
import * as syncBridge from './sync/bridge.js';
import * as schedule from './schedule.js';
import { icon } from './utils/icons.js';

// ナビゲーションとタイトルのアイコンを描画する
document.getElementById('app-title').insertAdjacentHTML('afterbegin', icon('megaphone', { size: 19 }));
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.insertAdjacentHTML('afterbegin', icon(btn.dataset.icon, { size: 21 }));
});

let currentView = 'input';
const mainContent = document.getElementById('main-content');
const polSelect = document.getElementById('politician-select');

// マスタのセットアップ
function renderPoliticianSelect() {
    polSelect.innerHTML = '';
    const politicians = store.getPoliticians();
    politicians.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === store.getCurrentPoliticianId()) opt.selected = true;
        polSelect.appendChild(opt);
    });
    const addOpt = document.createElement('option');
    addOpt.value = '_add_new';
    addOpt.textContent = '＋ 新規アカウントを作成…';
    polSelect.appendChild(addOpt);
}

renderPoliticianSelect();

polSelect.addEventListener('change', async (e) => {
    if (e.target.value === '_add_new') {
        const name = prompt('新しいアカウント名を入力してください:');
        if (name && name.trim()) {
            const newId = store.addPolitician(name.trim());
            store.setCurrentPoliticianId(newId);
            renderPoliticianSelect();
            await switchView(currentView);
        } else {
            polSelect.value = store.getCurrentPoliticianId();
        }
        return;
    }
    store.setCurrentPoliticianId(e.target.value);
    setUpReminders();
    await switchView(currentView); // 画面再描画
});

// 予定のリマインド。アプリを開いている間だけ動く（端末を閉じている間は動かない）。
schedule.setRemindHandler(({ body }) => {
    if (!schedule.showNotification('街頭活動の予定', body)) showToast(body);
});

function setUpReminders() {
    schedule.startReminders(store.getCurrentPoliticianId());
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.innerHTML = icon(type === 'error' ? 'trash' : 'check', { size: 16 }) + `<span>${message}</span>`;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast'; }, 2500);
}

/**
 * 初回起動時に、サンプルデータを入れるかを選んでもらう。
 * 以前は自動で入れていたが、サンプルが実績の集計や共有画像に混ざるため選択制にした。
 */
async function setUpFirstRun() {
    if (!await store.needsFirstRunSetup()) return;

    const choice = await new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-sheet">
            <div class="modal-head"><div>
              <div class="modal-title">はじめまして</div>
              <div class="modal-sub">街頭活動ログの使い方を試せるサンプルを用意しています。</div>
            </div></div>
            <p class="text-sm" style="margin:0 0 var(--s4);line-height:1.9;">
              サンプルは品川区の架空の活動記録10件です。集計やグラフの見え方を確かめられます。
              あとから設定画面でまとめて削除できます。
            </p>
            <div class="modal-actions">
              <button class="btn btn-primary" id="first-run-sample">サンプルを入れて試す</button>
              <button class="btn btn-secondary" id="first-run-empty">空で始める</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
        const pick = value => { modal.remove(); resolve(value); };
        modal.querySelector('#first-run-sample').addEventListener('click', () => pick('sample'));
        modal.querySelector('#first-run-empty').addEventListener('click', () => pick('empty'));
    });

    if (choice === 'sample') await store.seedSampleRecords(generateDummyData());
    else store.markFirstRunDone();
}

let isSwitching = false;

async function switchView(view, editId = null) {
    if (isSwitching && view !== currentView) return;
    isSwitching = true;
    if (currentView === 'settings' && view !== 'settings') settingsView.dispose();
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    
    // 簡易ローディング表示
    if (!mainContent.innerHTML.includes('loading')) {
        mainContent.innerHTML = '<div class="loading">読み込み中…</div>';
    }

    try {
        switch (view) {
            case 'input':
                inputForm.setEditingId(editId);
                await inputForm.render(mainContent, {
                    onSaved: async (action) => {
                        if (action === 'created') showToast('保存しました');
                        else if (action === 'updated') showToast('更新しました');
                        else if (action === 'deleted') showToast('削除しました', 'error');
                        await switchView('list');
                    },
                });
                break;
            case 'list':
                await listView.render(mainContent, {
                    onEdit: (id) => switchView('input', id),
                    onDuplicate: (record) => {
                        inputForm.setTemplateFrom(record);
                        switchView('input');
                    },
                });
                break;
            case 'recommend':
                await recommendView.render(mainContent, {
                    // 予定→実施→記録をつなぐ。場所と開始時刻を入力画面へ渡す。
                    onStartFromPlan: (place) => {
                        inputForm.setTemplateFrom({ ...place, endTime: '' });
                        switchView('input');
                    },
                });
                break;
            case 'dashboard':
                await dashboard.render(mainContent);
                break;
            case 'settings':
                await settingsView.render(mainContent, {
                    // アカウントを削除したらヘッダーの選択欄を作り直す
                    onAccountsChanged: () => {
                        renderPoliticianSelect();
                        showToast('アカウントを削除しました', 'error');
                    },
                });
                break;
        }
    } catch(err) {
        console.error('Error rendering view:', err);
        mainContent.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon('alert', { size: 32 })}</div>`
            + '<div class="empty-state-text">表示中に問題が起きました。<br>画面を切り替えると復帰することがあります。</div></div>';
    } finally {
        isSwitching = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

// 初期化フロー
(async function initApp() {
    try {
        await setUpFirstRun();
        await switchView('input');

        setUpReminders();
        const todaysPlans = schedule.getTodaysPlans(store.getCurrentPoliticianId());
        if (todaysPlans.length > 0) {
            const first = todaysPlans[0];
            showToast(`今日の予定 ${todaysPlans.length}件（${first.time || '時刻未定'} ${first.spot || first.area}）`);
        }

        // クラウド由来でデータが入れ替わったら、アカウント一覧と表示中の画面を作り直す
        syncBridge.onCloudStateApplied(async () => {
            renderPoliticianSelect();
            // 入力途中の内容を消さないよう、入力画面と設定画面は作り直さない
            if (currentView !== 'settings' && currentView !== 'input') {
                await switchView(currentView);
            }
        });
    } catch(e) {
        console.error('App init failed:', e);
    }
})();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const serviceWorkerUrl = new URL('../sw.js', import.meta.url);
            await navigator.serviceWorker.register(serviceWorkerUrl);
        } catch (e) {
            console.warn('Service Worker registration failed:', e);
        }
    });
}
