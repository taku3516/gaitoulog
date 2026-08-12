// ===== 活動予定とリマインド =====
// 予定は端末のlocalStorageへ持つ（タイマーと同じ扱い）。
// 通知はブラウザの制約が大きいため、アプリを開いている間の通知に加えて
// 端末カレンダーへ登録できる .ics も用意する。

import { todayISO } from './calculations.js';

const PLANS_KEY = 'streetActivityLog_plans';
const DEFAULT_REMIND_MINUTES = 60;

let timers = [];
// 通知の出し方はアプリ本体（app.js）が決める。予定を足した画面からも同じ設定で組み直せるようにする。
let remindHandler = null;

export function setRemindHandler(handler) {
    remindHandler = handler;
}

function readAll() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PLANS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeAll(plans) {
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
}

function sortKey(plan) {
    return `${plan.date} ${plan.time || '00:00'}`;
}

export function getPlans(politicianId) {
    return readAll()
        .filter(plan => (plan.politicianId || 'default') === politicianId)
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** 今日以降の予定。過ぎた予定は一覧に出さない。 */
export function getUpcomingPlans(politicianId, from = todayISO()) {
    return getPlans(politicianId).filter(plan => plan.date >= from);
}

export function getTodaysPlans(politicianId, today = todayISO()) {
    return getPlans(politicianId).filter(plan => plan.date === today);
}

export function addPlan(values) {
    const plan = {
        id: `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        politicianId: values.politicianId || 'default',
        date: values.date,
        time: values.time || '',
        area: values.area || '',
        locality: values.locality || '',
        spot: values.spot || '',
        spotId: values.spotId || '',
        note: values.note || '',
        remindMinutes: Number.isFinite(Number(values.remindMinutes)) ? Number(values.remindMinutes) : DEFAULT_REMIND_MINUTES,
        createdAt: new Date().toISOString(),
    };
    if (!plan.date) throw new Error('日付を選んでください。');
    if (!plan.spot && !plan.area) throw new Error('場所を入れてください。');
    writeAll([...readAll(), plan]);
    return plan;
}

export function removePlan(id) {
    writeAll(readAll().filter(plan => plan.id !== id));
}

export function planLabel(plan) {
    const place = [plan.area, plan.spot].filter(Boolean).join(' ／ ');
    return plan.time ? `${plan.date} ${plan.time} ${place}` : `${plan.date} ${place}`;
}

// ---- 端末カレンダー用の .ics ----

function icsEscape(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/[;,]/g, m => `\\${m}`).replace(/\n/g, '\\n');
}

function icsStamp(date) {
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
        + `T${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}Z`;
}

/** 開始・終了は端末のローカル時刻として扱う（タイムゾーン指定なしの表記） */
function icsLocal(dateStr, timeStr) {
    return `${dateStr.replace(/-/g, '')}T${(timeStr || '00:00').replace(':', '')}00`;
}

function addMinutes(timeStr, minutes) {
    const [hour, minute] = (timeStr || '00:00').split(':').map(Number);
    const total = hour * 60 + minute + minutes;
    const wrapped = ((total % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function buildIcs(plan) {
    const place = [plan.area, plan.locality, plan.spot].filter(Boolean).join(' ');
    const start = icsLocal(plan.date, plan.time || '09:00');
    const end = icsLocal(plan.date, addMinutes(plan.time || '09:00', 60));
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//gaitoulog//activity plan//JA',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${plan.id}@gaitoulog`,
        `DTSTAMP:${icsStamp(new Date())}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${icsEscape(`街頭活動 ${plan.spot || place}`)}`,
        `LOCATION:${icsEscape(place)}`,
        plan.note ? `DESCRIPTION:${icsEscape(plan.note)}` : '',
        'BEGIN:VALARM',
        `TRIGGER:-PT${Math.max(0, plan.remindMinutes || DEFAULT_REMIND_MINUTES)}M`,
        'ACTION:DISPLAY',
        'DESCRIPTION:街頭活動の予定',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ].filter(Boolean);
    return `${lines.join('\r\n')}\r\n`;
}

export function downloadIcs(plan) {
    const blob = new Blob([buildIcs(plan)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    // 拡張子が落ちるとカレンダーで開けないため、ファイル名は英数字にする
    anchor.download = `gaitoulog-plan-${plan.date}.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- アプリを開いている間のリマインド ----

export function notificationState() {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
}

export async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    try {
        return await Notification.requestPermission();
    } catch {
        return Notification.permission;
    }
}

function planStartAt(plan) {
    const [year, month, day] = plan.date.split('-').map(Number);
    const [hour, minute] = (plan.time || '09:00').split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function clearReminders() {
    timers.forEach(id => clearTimeout(id));
    timers = [];
}

/**
 * 今日の予定に合わせて、アプリを開いている間だけ通知を出す。
 * 端末を閉じている間は動かないため、確実な通知は .ics でカレンダーへ入れてもらう。
 */
export function startReminders(politicianId, onRemind = remindHandler) {
    clearReminders();
    const now = Date.now();
    for (const plan of getTodaysPlans(politicianId)) {
        const startAt = planStartAt(plan).getTime();
        const remindAt = startAt - (plan.remindMinutes || DEFAULT_REMIND_MINUTES) * 60000;
        for (const at of [remindAt, startAt]) {
            const delay = at - now;
            if (delay <= 0 || delay > 12 * 3600000) continue;
            timers.push(setTimeout(() => {
                const minutesLeft = Math.max(0, Math.round((startAt - Date.now()) / 60000));
                const body = minutesLeft > 0
                    ? `${minutesLeft}分後に ${plan.spot || plan.area} の予定です。`
                    : `${plan.spot || plan.area} の予定の時間です。`;
                onRemind?.({ plan, body });
            }, delay));
        }
    }
    return timers.length;
}

export function showNotification(title, body) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    try {
        new Notification(title, { body, icon: './assets/icons/icon.svg', tag: 'gaitoulog-plan' });
        return true;
    } catch {
        return false;
    }
}
