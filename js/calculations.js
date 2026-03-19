// ===== 自動計算ロジック =====

export function calcDuration(startTime, endTime, nextDay = false) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (nextDay) endMin += 24 * 60;
    return endMin - startMin;
}

export function calcDistributionRate(count, minutes) {
    if (!minutes || minutes <= 0) return null;
    return Math.round((count / minutes) * 100) / 100;
}

export function calcAcceptRate(distributed, approached) {
    if (!approached || approached <= 0) return null;
    return Math.round((distributed / approached) * 100) / 100;
}

export function getDayOfWeek(dateStr) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[new Date(dateStr).getDay()];
}

export function getYearMonth(dateStr) {
    return dateStr.substring(0, 7);
}

export function getHour(timeStr) {
    return parseInt(timeStr.split(':')[0], 10);
}

export function enrichRecord(record) {
    const duration = calcDuration(record.startTime, record.endTime, record.nextDay);
    const distributionRate = calcDistributionRate(record.distributionCount, duration);
    const acceptRate = calcAcceptRate(record.distributionCount, record.approachCount);
    return {
        ...record,
        duration,
        distributionRate,
        acceptRate,
        dayOfWeek: getDayOfWeek(record.date),
        yearMonth: getYearMonth(record.date),
        hour: getHour(record.startTime),
    };
}
