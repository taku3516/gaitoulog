// ===== 活動タイマー =====
// 未完成の計測を通常レコードと分離し、ページ再読込や端末スリープ後も復元する。

const TIMER_KEY = 'streetActivityLog_activeTimer_v1';

function read() {
    try {
        const parsed = JSON.parse(localStorage.getItem(TIMER_KEY));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function write(value) {
    localStorage.setItem(TIMER_KEY, JSON.stringify(value));
    return value;
}

export function getActiveTimer() {
    return read();
}

export function startTimer({ politicianId, spotId = '', area, locality = '', spot }) {
    if (read()) throw new Error('すでに計測中または保存待ちの活動があります。');
    if (!politicianId || !area || !spot) throw new Error('活動場所を選択してください。');
    const startedAt = new Date().toISOString();
    return write({
        id: `timer_${Date.now().toString(36)}`,
        politicianId,
        spotId,
        area,
        locality,
        spot,
        startedAt,
        endedAt: null,
        status: 'running',
    });
}

export function finishTimer() {
    const timer = read();
    if (!timer || timer.status !== 'running') return timer;
    return write({ ...timer, endedAt: new Date().toISOString(), status: 'ended' });
}

export function clearTimer() {
    localStorage.removeItem(TIMER_KEY);
}

export function elapsedMilliseconds(timer = read(), now = Date.now()) {
    if (!timer?.startedAt) return 0;
    const start = Date.parse(timer.startedAt);
    const end = timer.endedAt ? Date.parse(timer.endedAt) : now;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, end - start);
}

export function formatElapsed(milliseconds) {
    const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
}

export function localDateTimeParts(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return { date: '', time: '' };
    const pad = value => String(value).padStart(2, '0');
    return {
        date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    };
}
