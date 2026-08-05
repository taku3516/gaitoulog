// ===== アイコン =====
// 絵文字は端末ごとに字形も色も変わり、文章の中で浮いてしまう。
// 線幅と余白を揃えた自前のSVGに置き換え、色は currentColor で文字に追従させる。

const PATHS = {
    // ナビゲーション
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M14.5 6.5 17.5 9.5"/>',
    list: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    idea: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.7V16h5.6v-.5c0-.7.3-1.3.8-1.7A6 6 0 0 0 12 3Z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5 13 5.4a7.4 7.4 0 0 1 2 .8l2.8-1.2 2.2 2.2-1.2 2.8c.4.6.6 1.3.8 2l2.9 1v3l-2.9 1a7.4 7.4 0 0 1-.8 2l1.2 2.8-2.2 2.2-2.8-1.2c-.6.4-1.3.6-2 .8l-1 2.9h-3l-1-2.9a7.4 7.4 0 0 1-2-.8l-2.8 1.2-2.2-2.2 1.2-2.8a7.4 7.4 0 0 1-.8-2l-2.9-1v-3l2.9-1c.2-.7.4-1.4.8-2L3.2 7.2l2.2-2.2L8.2 6.2c.6-.4 1.3-.6 2-.8l1-2.9Z"/>',

    // ブランド
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1Z"/><path d="M18 9a3.5 3.5 0 0 1 0 6"/><path d="M6 14v4a1 1 0 0 0 1 1h1.5a1 1 0 0 0 1-1v-3"/>',

    // 操作・状態
    check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
    alert: '<path d="M12 4.5 2.8 20h18.4L12 4.5Z"/><path d="M12 10v4M12 17.2v.1"/>',
    trash: '<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6 18 18M18 6 6 18"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4h-4"/>',
    save: '<path d="M5 3h11l3 3v15H5V3Z"/><path d="M9 3v6h6V3"/><rect x="8" y="13" width="8" height="6"/>',
    upload: '<path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    download: '<path d="M12 4v12"/><path d="M8 12l4 4 4-4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    chevronDown: '<path d="M6 9.5 12 15.5 18 9.5"/>',

    // 記録の項目
    pin: '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    page: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
    trend: '<path d="M3 17 9.5 10.5 13 14 21 6"/><path d="M21 11V6h-5"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M17 13.4A6 6 0 0 1 21 19"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3"/><path d="M12 13v4M9 20h6M10 17h4"/>',
    cloud: '<path d="M7 18h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.2A3.6 3.6 0 0 0 7 18Z"/>',
    note: '<path d="M5 4h14v16H5V4Z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/>',
    pinned: '<path d="M9 3h6l-1 6 4 3v2H6v-2l4-3-1-6Z"/><path d="M12 14v7"/>',

    // 天候
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>',
    rain: '<path d="M7 15h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.2A3.6 3.6 0 0 0 7 15Z"/><path d="M9 18.5 8 21M13 18.5 12 21M17 18.5 16 21"/>',
    snow: '<path d="M7 15h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.2A3.6 3.6 0 0 0 7 15Z"/><path d="M9 19v2M8 20h2M15 19v2M14 20h2"/>',
};

/**
 * インラインSVGを文字列で返す。
 * @param {string} name PATHS のキー
 * @param {{size?: number, cls?: string}} options
 */
export function icon(name, { size = 18, cls = '' } = {}) {
    const body = PATHS[name];
    if (!body) return '';
    return `<svg class="icon${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" `
        + `fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" `
        + `stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** 天候名からアイコン名へ */
export function weatherIcon(weather) {
    return { '晴': 'sun', '曇': 'cloud', '雨': 'rain', '雪': 'snow' }[weather] || '';
}
