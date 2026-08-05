// ===== CSVエクスポート =====

export function exportToCSV(records) {
    const headers = [
        '実施日', '曜日', '開始時間', '終了時間', '活動時間(分)',
        'エリア', '地名', 'スポット', '配布枚数', '配布係数(枚/分)',
        'ボランティア人数', 'ボランティア名', '天候', '気温',
        '実施形態', 'マイク', '単独/複数',
        'テーマ', '配布物', '声かけ数', '立ち止まり数', '受取拒否数',
        '受取率', '新規連絡先', '寄附件数', 'QR誘導数',
        'トラブル', 'トラブル内容', '備考', '月'
    ];
    const rows = records.map(r => [
        r.date, r.dayOfWeek || '', r.startTime, r.endTime, r.duration || '',
        r.area, r.locality || '', r.spot, r.distributionCount, r.distributionRate != null ? r.distributionRate : '',
        r.volunteerCount || 0, r.volunteerNames || '', r.weather || '', r.temperature != null ? r.temperature : '',
        r.formType || '', r.micType || '', r.groupType || '',
        (r.themes || []).join('・'), (r.materials || []).join('・'),
        r.approachCount || '', r.stopCount || '', r.refusalCount || '',
        r.acceptRate != null ? r.acceptRate : '', r.newContactCount || '', r.donationCount || '', r.qrCount || '',
        r.hasTrouble ? 'あり' : '', r.troubleNote || '', r.memo || '', r.yearMonth || '',
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `街頭活動ログ_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
