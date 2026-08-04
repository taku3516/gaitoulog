// ===== おすすめ活動候補画面 =====
import * as store from '../store.js';

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
                    <div class="empty-state-icon">💡</div>
                    <div class="empty-state-text">この条件に合う実績データがまだありません。<br>活動記録が増えると、ここに候補が表示されます。</div>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = recommendations.map(r => `
            <div class="card" style="margin-bottom: var(--spacing-sm); display: flex; justify-content: space-between; align-items: center; padding: 16px;">
                <div style="flex: 1;">
                    <div style="font-weight: 700; font-size: var(--font-size-md); color: var(--text-primary);">${r.spot}</div>
                    <div style="font-size: var(--font-size-sm); color: var(--text-muted);">${r.area}エリア</div>
                    <div style="margin-top: 8px; display: flex; gap: 12px; font-size: var(--font-size-sm); align-items: center;">
                        <span style="background: rgba(80,129,181,0.1); color: var(--accent-primary); padding: 2px 8px; border-radius: 4px; font-weight: 600;">📈 ${r.distributionRate || 0} 枚/分</span>
                        <span style="color: var(--text-secondary);">実績: ${r.distributionCount}枚</span>
                    </div>
                </div>
                <div style="font-size: 1.5rem; margin-left: 12px;">📍</div>
            </div>
        `).join('');
    }

    container.innerHTML = `
        <div class="view-container">
            <div class="section-title">💡 おすすめ活動候補</div>
            <p style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--spacing-md);">
                過去の同じ曜日・時間帯の実績から、配布効率の高い場所を提案します。
            </p>

            <div class="card" style="padding: var(--spacing-md); margin-bottom: var(--spacing-lg);">
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
                <div style="text-align:center; padding: 40px; color: var(--text-muted);">🔄 計算中...</div>
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
