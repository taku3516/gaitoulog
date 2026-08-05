// ===== おすすめ活動候補画面 =====
import * as store from '../store.js';
import { icon } from '../utils/icons.js';

export async function render(container) {
    const today = new Date().toISOString().split('T')[0];
    const nowH = new Date().getHours().toString().padStart(2, '0');
    const nowM = (Math.floor(new Date().getMinutes() / 15) * 15).toString().padStart(2, '0');

    let selectedDate = today;
    let selectedTime = `${nowH}:${nowM}`;

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

        listContainer.innerHTML = recommendations.map(r => `
            <div class="rec-card">
                <div class="rec-body">
                    <div class="rec-spot">${r.spot}</div>
                    <div class="rec-area">${r.area}</div>
                    <div class="rec-metrics">
                        <span class="stat-chip">${icon('page')}実績 <span class="stat-value">${r.distributionCount}</span> 枚</span>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div class="rec-rate">${r.distributionRate || 0}</div>
                    <div class="rec-rate-unit">枚/分</div>
                </div>
            </div>
        `).join('');
    }

    container.innerHTML = `
        <div>
            <h2 class="section-title">${icon('idea', { size: 19 })}おすすめの活動場所</h2>
            <p class="section-note">同じ曜日・時間帯の実績から、配布効率の高い場所を並べています。</p>

            <div class="card">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">シミュレート日</label>
                        <input type="date" class="form-input" id="rec-date" value="${selectedDate}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">開始時間</label>
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

    await updateList();
}
