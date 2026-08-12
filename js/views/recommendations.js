// ===== おすすめ活動候補・活動予定画面 =====
import * as store from '../store.js';
import { icon } from '../utils/icons.js';
import { todayISO } from '../calculations.js';
import * as schedule from '../schedule.js';

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    ));
}

export async function render(container) {
    const today = todayISO();
    const nowH = new Date().getHours().toString().padStart(2, '0');
    const nowM = (Math.floor(new Date().getMinutes() / 15) * 15).toString().padStart(2, '0');

    let selectedDate = today;
    let selectedTime = `${nowH}:${nowM}`;
    const politicianId = store.getCurrentPoliticianId();
    const uniqueSpots = await store.getUniqueSpots();

    function planStatus(message = '') {
        const element = document.getElementById('plan-status');
        if (element) element.textContent = message;
    }

    function renderPlans() {
        const listContainer = document.getElementById('plan-list');
        if (!listContainer) return;
        const plans = schedule.getUpcomingPlans(politicianId);
        listContainer.innerHTML = plans.length === 0
            ? '<p class="text-sm text-muted" style="margin:0;">これからの予定はありません。</p>'
            : plans.map(plan => `
                <div class="plan-item ${plan.date === today ? 'today' : ''}">
                    <div class="plan-when">
                        <div class="plan-date">${esc(plan.date)}${plan.date === today ? '（今日）' : ''}</div>
                        <div class="plan-time">${esc(plan.time || '時刻未定')}</div>
                    </div>
                    <div class="plan-body">
                        <div class="plan-spot">${esc(plan.spot || plan.area || '場所未定')}</div>
                        <div class="plan-meta">${esc([plan.area, plan.locality].filter(Boolean).join(' ／ '))}${plan.note ? `｜${esc(plan.note)}` : ''}</div>
                    </div>
                    <div class="plan-actions">
                        <button class="btn btn-secondary btn-sm plan-ics" data-id="${esc(plan.id)}">カレンダー</button>
                        <button class="btn btn-danger btn-sm plan-remove" data-id="${esc(plan.id)}">削除</button>
                    </div>
                </div>`).join('');

        listContainer.querySelectorAll('.plan-ics').forEach(button => button.addEventListener('click', () => {
            const plan = schedule.getPlans(politicianId).find(p => p.id === button.dataset.id);
            if (!plan) return;
            schedule.downloadIcs(plan);
            planStatus('カレンダー用のファイルを保存しました。開くと端末のカレンダーへ登録できます。');
        }));
        listContainer.querySelectorAll('.plan-remove').forEach(button => button.addEventListener('click', () => {
            schedule.removePlan(button.dataset.id);
            schedule.startReminders(politicianId);
            renderPlans();
            planStatus('予定を削除しました。');
        }));
    }

    function renderNotificationRow() {
        const row = document.getElementById('plan-notify-row');
        if (!row) return;
        const state = schedule.notificationState();
        if (state === 'granted') {
            row.innerHTML = '<span class="text-xs text-muted">この端末では、アプリを開いている間に予定の通知が出ます。</span>';
            return;
        }
        if (state === 'unsupported' || state === 'denied') {
            row.innerHTML = '<span class="text-xs text-muted">この端末では通知を出せません。「カレンダー」から端末のカレンダーへ登録してください。</span>';
            return;
        }
        row.innerHTML = '<button class="btn btn-secondary btn-sm" id="plan-notify">予定の通知を許可</button>';
        document.getElementById('plan-notify').addEventListener('click', async () => {
            await schedule.requestNotificationPermission();
            renderNotificationRow();
        });
    }

    async function updateList() {
        const recommendations = await store.getRecommendations(selectedDate, selectedTime);
        const listContainer = document.getElementById('rec-list');

        if (!listContainer) return;

        if (recommendations.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">${icon('idea', { size: 32 })}</div>
                    <div class="empty-state-text">この条件に合う実績がまだありません。<br>記録が増えると、ここに候補が並びます。</div>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = recommendations.map((r, index) => `
            <div class="rec-card">
                <div class="rec-body">
                    <div class="rec-spot">${esc(r.spot)}</div>
                    <div class="rec-area">${esc(r.area)}</div>
                    <div class="rec-metrics">
                        <span class="stat-chip">${icon('page')}実績 <span class="stat-value">${r.distributionCount}</span> 枚</span>
                    </div>
                    <button class="btn btn-secondary btn-sm rec-plan" data-index="${index}">${icon('calendar', { size: 14 })}予定に追加</button>
                </div>
                <div style="text-align:right;">
                    <div class="rec-rate">${r.distributionRate || 0}</div>
                    <div class="rec-rate-unit">枚/分</div>
                </div>
            </div>
        `).join('');

        listContainer.querySelectorAll('.rec-plan').forEach(button => button.addEventListener('click', () => {
            const target = recommendations[Number(button.dataset.index)];
            if (!target) return;
            try {
                schedule.addPlan({
                    politicianId,
                    date: selectedDate,
                    time: selectedTime,
                    area: target.area,
                    locality: target.locality || '',
                    spot: target.spot,
                    spotId: target.spotId || '',
                });
                schedule.startReminders(politicianId);
                renderPlans();
                planStatus(`${selectedDate} ${selectedTime} の予定に「${target.spot}」を追加しました。`);
            } catch (error) {
                planStatus(error.message);
            }
        }));
    }

    container.innerHTML = `
        <div>
            <h2 class="section-title">${icon('calendar', { size: 19 })}活動予定</h2>
            <p class="section-note">予定の1時間前と開始時刻に、アプリを開いている間はお知らせします。アプリを閉じていても通知を受け取りたいときは「カレンダー」から端末のカレンダーへ登録してください。</p>

            <div class="card">
                <div id="plan-list" class="plan-list"></div>
                <div class="divider"></div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label" for="plan-date">日付</label>
                        <input type="date" class="form-input" id="plan-date" value="${today}">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="plan-time">開始時間</label>
                        <input type="time" class="form-input" id="plan-time" value="${selectedTime}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="plan-spot">場所</label>
                    <input type="text" class="form-input" id="plan-spot" placeholder="例：大井町駅デッキ上" list="plan-spot-list">
                    <datalist id="plan-spot-list">${uniqueSpots.map(spot => `<option value="${esc(spot)}">`).join('')}</datalist>
                </div>
                <div class="form-group">
                    <label class="form-label" for="plan-note">メモ</label>
                    <input type="text" class="form-input" id="plan-note" placeholder="例：ビラ200枚を持参">
                </div>
                <button class="btn btn-primary btn-full" id="plan-add">${icon('plus', { size: 15 })}予定を追加</button>
                <div id="plan-notify-row" style="margin-top:12px;"></div>
                <div class="text-xs" id="plan-status" aria-live="polite" style="margin-top:8px;"></div>
            </div>

            <h2 class="section-title">${icon('idea', { size: 19 })}おすすめの活動場所</h2>
            <p class="section-note">同じ曜日・時間帯の実績から、配布効率の高い場所を並べています。「予定に追加」で下の日時のまま予定へ入れられます。</p>

            <div class="card">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label" for="rec-date">シミュレート日</label>
                        <input type="date" class="form-input" id="rec-date" value="${selectedDate}">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="rec-time">開始時間</label>
                        <input type="time" class="form-input" id="rec-time" value="${selectedTime}">
                    </div>
                </div>
            </div>

            <div id="rec-list">
                <div class="loading">計算中…</div>
            </div>
        </div>
    `;

    const dateInput = document.getElementById('rec-date');
    const timeInput = document.getElementById('rec-time');

    dateInput.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        updateList();
    });

    timeInput.addEventListener('change', (e) => {
        selectedTime = e.target.value;
        updateList();
    });

    document.getElementById('plan-add').addEventListener('click', () => {
        const spot = document.getElementById('plan-spot').value.trim();
        try {
            schedule.addPlan({
                politicianId,
                date: document.getElementById('plan-date').value,
                time: document.getElementById('plan-time').value,
                area: '',
                spot,
                note: document.getElementById('plan-note').value.trim(),
            });
            document.getElementById('plan-spot').value = '';
            document.getElementById('plan-note').value = '';
            schedule.startReminders(politicianId);
            renderPlans();
            planStatus('予定を追加しました。');
        } catch (error) {
            planStatus(error.message);
        }
    });

    renderPlans();
    renderNotificationRow();
    await updateList();
}
