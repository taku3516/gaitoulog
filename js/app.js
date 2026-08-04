// ===== メインアプリケーション =====
import * as store from './store.js';
import { generateDummyData } from './dummy-data.js';
import * as inputForm from './views/input-form.js';
import * as listView from './views/list-view.js';
import * as recommendView from './views/recommendations.js';
import * as dashboard from './views/dashboard.js';

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
    addOpt.textContent = '➕ 新規アカウント作成...';
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
    await switchView(currentView); // 画面再描画
});

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast'; }, 2500);
}

let isSwitching = false;

async function switchView(view, editId = null) {
    if (isSwitching && view !== currentView) return;
    isSwitching = true;
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    
    // 簡易ローディング表示
    if (!mainContent.innerHTML.includes('loading')) {
        mainContent.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">🔄 読み込み中...</div>';
    }

    try {
        switch (view) {
            case 'input':
                inputForm.setEditingId(editId);
                await inputForm.render(mainContent, {
                    onSaved: async (action) => {
                        if (action === 'created') showToast('✅ 保存しました');
                        else if (action === 'updated') showToast('✅ 更新しました');
                        else if (action === 'deleted') showToast('🗑️ 削除しました', 'error');
                        await switchView('list');
                    },
                });
                break;
            case 'list':
                await listView.render(mainContent, { onEdit: (id) => switchView('input', id) });
                break;
            case 'recommend':
                await recommendView.render(mainContent);
                break;
            case 'dashboard':
                await dashboard.render(mainContent);
                break;
        }
    } catch(err) {
        console.error('Error rendering view:', err);
        mainContent.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--accent-error);">⚠️ エラーが発生しました</div>';
    } finally {
        isSwitching = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

// 初期化フロー
(async function initApp() {
    try {
        await store.initIfEmpty(generateDummyData());
        await switchView('input');
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
