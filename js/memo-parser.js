import { findLocationBySpot, findLocationInText } from './location-catalog.js';

const REQUIRED_LABELS = {
    date: '実施日',
    startTime: '開始時間',
    endTime: '終了時間',
    area: '地区',
    spot: 'スポット',
    distributionCount: '配布枚数',
};

function normalizeText(text) {
    return String(text || '')
        .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
        .replace(/：/g, ':')
        .replace(/，/g, ',');
}

function validDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function formatDate(year, month, day) {
    if (!validDate(year, month, day)) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDate(text, now) {
    let match = text.match(/(?:^|\D)(20\d{2})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})日?/);
    if (match) return formatDate(Number(match[1]), Number(match[2]), Number(match[3]));

    match = text.match(/(?:^|\D)(\d{1,2})[\/\.月](\d{1,2})日?/);
    if (match) return formatDate(now.getFullYear(), Number(match[1]), Number(match[2]));
    return '';
}

function parseTimeToken(token) {
    const match = token.match(/^(\d{1,2})(?::(\d{1,2})|時(?:(\d{1,2})分?)?)$/);
    if (!match) return '';
    const hour = Number(match[1]);
    const minute = Number(match[2] ?? match[3] ?? 0);
    if (hour > 23 || minute > 59) return '';
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimes(text) {
    const timeToken = '(\\d{1,2}(?::\\d{1,2}|時(?:\\d{1,2}分?)?))';
    const range = text.match(new RegExp(`${timeToken}\\s*(?:〜|～|~|－|–|—|-|から)\\s*${timeToken}`));
    if (range) {
        return { startTime: parseTimeToken(range[1]), endTime: parseTimeToken(range[2]) };
    }

    const start = text.match(/開始(?:時間)?\s*[:：]?\s*(\d{1,2}(?::\d{1,2}|時(?:\d{1,2}分?)?))/);
    const end = text.match(/終了(?:時間)?\s*[:：]?\s*(\d{1,2}(?::\d{1,2}|時(?:\d{1,2}分?)?))/);
    return {
        startTime: start ? parseTimeToken(start[1]) : '',
        endTime: end ? parseTimeToken(end[1]) : '',
    };
}

function parseDistributionCount(text) {
    const match = text.match(/配布枚数\s*[:：]?\s*(\d[\d,]*)\s*枚?/) || text.match(/(\d[\d,]*)\s*枚/);
    return match ? Number(match[1].replace(/,/g, '')) : '';
}

function parseSpot(text) {
    const catalogLocation = findLocationInText(text);
    if (catalogLocation) return catalogLocation;

    const labelled = text.match(/スポット\s*[:：]\s*([^\n,、]+)/);
    if (!labelled) return null;
    const spot = labelled[1].trim();
    return findLocationBySpot(spot) || { area: '', locality: '', spot };
}

export function parseActivityMemo(rawText, now = new Date()) {
    const text = normalizeText(rawText);
    const location = parseSpot(text);
    const result = {
        date: parseDate(text, now),
        ...parseTimes(text),
        area: location?.area || '',
        locality: location?.locality || '',
        spot: location?.spot || '',
        distributionCount: parseDistributionCount(text),
    };
    const found = Object.entries(REQUIRED_LABELS)
        .filter(([key]) => result[key] !== '' && result[key] !== null)
        .map(([, label]) => label);
    const missing = Object.entries(REQUIRED_LABELS)
        .filter(([key]) => result[key] === '' || result[key] === null)
        .map(([, label]) => label);

    return { values: result, found, missing };
}
