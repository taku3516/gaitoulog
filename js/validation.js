// ===== バリデーション =====

export function validateRecord(record, allRecords = []) {
    const errors = {};
    const warnings = [];

    if (!record.date) errors.date = '実施日を入力してください';
    if (!record.startTime) errors.startTime = '開始時間を入力してください';
    if (!record.endTime) errors.endTime = '終了時間を入力してください';
    if (!record.area || !record.area.trim()) errors.area = 'エリアを入力してください';
    if (!record.spot || !record.spot.trim()) errors.spot = 'スポット名を入力してください';
    if (record.distributionCount === '' || record.distributionCount === undefined || record.distributionCount === null) {
        errors.distributionCount = '配布枚数を入力してください';
    }

    if (record.startTime && record.endTime && !record.nextDay) {
        const [sh, sm] = record.startTime.split(':').map(Number);
        const [eh, em] = record.endTime.split(':').map(Number);
        if (eh * 60 + em <= sh * 60 + sm) {
            errors.endTime = '終了時間が開始時間より前です（翌日跨ぎの場合はチェックしてください）';
        }
    }

    const numericFields = [
        { key: 'distributionCount', label: '配布枚数' },
        { key: 'volunteerCount', label: 'ボランティア人数' },
        { key: 'approachCount', label: '声かけ数' },
        { key: 'stopCount', label: '立ち止まり人数' },
        { key: 'refusalCount', label: '受取拒否数' },
        { key: 'newContactCount', label: '新規連絡先獲得数' },
        { key: 'donationCount', label: '寄附/カンパ件数' },
        { key: 'qrCount', label: 'QR/URL誘導数' },
        { key: 'temperature', label: '気温' },
    ];

    for (const field of numericFields) {
        const val = record[field.key];
        if (val !== '' && val !== undefined && val !== null) {
            const num = Number(val);
            if (isNaN(num)) errors[field.key] = `${field.label}は数値で入力してください`;
            else if (field.key !== 'temperature' && num < 0) errors[field.key] = `${field.label}は0以上で入力してください`;
            else if (field.key === 'distributionCount' && num > 10000) warnings.push(`${field.label}が${num}枚です。入力ミスではありませんか？`);
            else if (field.key !== 'temperature' && field.key !== 'distributionCount' && num > 1000) warnings.push(`${field.label}が${num}です。極端な値ではありませんか？`);
        }
    }

    if (record.date && record.startTime && record.area && record.spot) {
        const duplicates = allRecords.filter(r =>
            r.id !== record.id && r.date === record.date && r.startTime === record.startTime && r.area === record.area && r.spot === record.spot
        );
        if (duplicates.length > 0) warnings.push('同じ日・時間・場所のレコードが既に存在します。重複入力ではありませんか？');
    }

    return { valid: Object.keys(errors).length === 0, errors, warnings };
}
