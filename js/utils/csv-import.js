// ===== CSVインポート =====
import { enrichRecord } from '../calculations.js';

/**
 * ヘッダー名の正規化マッピング
 * ユーザーのCSV形式と既存エクスポート形式の両方に対応
 */
const HEADER_ALIASES = {
    // 日付
    '日付': 'date',
    '実施日': 'date',
    // 曜日（自動計算されるので無視するが認識はする）
    '曜日': '_dayOfWeek',
    // 時間
    '開始時間': 'startTime',
    '開始': 'startTime',
    '終了時間': 'endTime',
    '終了': 'endTime',
    // 活動時間（自動計算されるので無視）
    '活動時間(分)': '_duration',
    '配布(分)': '_duration',
    '配布分': '_duration',
    '時間(分)': '_duration',
    // 配布
    '配布枚数': 'distributionCount',
    '枚数': 'distributionCount',
    '配布係数': '_distributionRate',
    '配布係数(枚/分)': '_distributionRate',
    '係数': '_distributionRate',
    // 場所
    '配布場所': 'spot',
    'スポット': 'spot',
    '場所': 'spot',
    'エリア': 'area',
    // メモ・備考
    '備考メモ': 'memo',
    '備考': 'memo',
    'メモ': 'memo',
    // ボランティア
    'ボランティア参加者': 'volunteerNames',
    'ボランティア名': 'volunteerNames',
    '参加者': 'volunteerNames',
    'ボランティア人数': 'volunteerCount',
    // 番号（無視）
    '番号': '_number',
    'No': '_number',
    'no': '_number',
    'NO': '_number',
    // 天候
    '天候': 'weather',
    // 気温
    '気温': 'temperature',
    // 形態
    '実施形態': 'formType',
    'マイク': 'micType',
    '単独/複数': 'groupType',
    // テーマ・配布物
    'テーマ': 'themes',
    '配布物': 'materials',
    // 反応
    '声かけ数': 'approachCount',
    '立ち止まり数': 'stopCount',
    '受取拒否数': 'refusalCount',
    '受取率': '_acceptRate',
    '新規連絡先': 'newContactCount',
    '寄附件数': 'donationCount',
    'QR誘導数': 'qrCount',
    // トラブル
    'トラブル': 'hasTrouble',
    'トラブル内容': 'troubleNote',
    // 月（自動計算、無視）
    '月': '_yearMonth',
};

/**
 * CSVテキストをパースしてレコード配列を返す
 * エクスポート形式・ユーザー指定形式の両方に自動対応
 */
export function parseCSV(csvText) {
    // BOM除去
    const text = csvText.replace(/^\uFEFF/, '');
    const lines = parseCSVLines(text);
    if (lines.length < 2) return { records: [], errors: ['CSVにデータ行がありません。'] };

    const rawHeaders = lines[0].map(h => h.trim());

    // ヘッダーをフィールド名にマッピング
    const fieldMap = mapHeaders(rawHeaders);

    if (!fieldMap) {
        return { records: [], errors: ['CSVのヘッダーを認識できませんでした。対応するヘッダー名を使用してください。'] };
    }

    const errors = [];
    const records = [];
    // エリアが独立カラムにないかチェック
    const hasAreaColumn = Object.values(fieldMap).includes('area');

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) continue;

        const rowNum = i + 1;
        const getField = (fieldName) => {
            for (const [colIdx, fName] of Object.entries(fieldMap)) {
                if (fName === fieldName && Number(colIdx) < row.length) {
                    return row[Number(colIdx)].trim();
                }
            }
            return '';
        };
        const getNumField = (fieldName) => {
            const v = getField(fieldName);
            if (v === '') return '';
            const n = Number(v);
            return isNaN(n) ? '' : n;
        };

        // 日付取得・正規化
        let date = getField('date');
        if (!date) {
            errors.push(`行${rowNum}: 日付が見つかりません。`);
            continue;
        }
        // YYYY/MM/DD → YYYY-MM-DD に変換
        date = normalizeDate(date);
        if (!date) {
            errors.push(`行${rowNum}: 日付の形式が不正です（YYYY-MM-DD または YYYY/MM/DD 形式で入力してください）。`);
            continue;
        }

        // 時間取得・正規化
        let startTime = normalizeTime(getField('startTime'));
        let endTime = normalizeTime(getField('endTime'));

        if (!startTime || !endTime) {
            errors.push(`行${rowNum}: 開始時間または終了時間が不正です（HH:MM形式で入力してください）。`);
            continue;
        }

        // 場所
        let area = getField('area');
        let spot = getField('spot');

        if (!spot) {
            errors.push(`行${rowNum}: 場所（配布場所/スポット）が見つかりません。`);
            continue;
        }

        // エリアが独立列にない場合、デフォルト値を設定
        if (!area) {
            area = '品川区';
        }

        // 配布枚数
        const distributionCount = getNumField('distributionCount');

        // ボランティア
        const volunteerNames = getField('volunteerNames');
        const volunteerCount = getNumField('volunteerCount') ||
            (volunteerNames ? volunteerNames.split(/[、,，\s]+/).filter(Boolean).length : 0);

        // メモ
        const memo = getField('memo');

        // テーマ・配布物（「・」区切り）
        const themesStr = getField('themes');
        const themes = themesStr ? themesStr.split('・').filter(Boolean) : [];
        const materialsStr = getField('materials');
        const materials = materialsStr ? materialsStr.split('・').filter(Boolean) : [];

        const record = {
            date,
            startTime,
            endTime,
            nextDay: false,
            area,
            spot,
            distributionCount: distributionCount || 0,
            volunteerCount: volunteerCount || 0,
            volunteerNames,
            weather: getField('weather'),
            temperature: getNumField('temperature'),
            formType: getField('formType'),
            micType: getField('micType'),
            groupType: getField('groupType'),
            themes,
            materials,
            approachCount: getNumField('approachCount'),
            stopCount: getNumField('stopCount'),
            refusalCount: getNumField('refusalCount'),
            newContactCount: getNumField('newContactCount'),
            donationCount: getNumField('donationCount'),
            qrCount: getNumField('qrCount'),
            hasTrouble: getField('hasTrouble') === 'あり',
            troubleNote: getField('troubleNote'),
            memo,
            address: '',
            lat: null,
            lng: null,
            photos: [],
        };

        records.push(record);
    }

    return { records, errors };
}

/**
 * ヘッダー配列をフィールド名マッピングに変換
 * { カラムインデックス: フィールド名 } を返す
 */
function mapHeaders(rawHeaders) {
    const fieldMap = {};
    let matchCount = 0;

    for (let i = 0; i < rawHeaders.length; i++) {
        const header = rawHeaders[i];
        // 完全一致を試みる
        if (HEADER_ALIASES[header]) {
            fieldMap[i] = HEADER_ALIASES[header];
            matchCount++;
            continue;
        }
        // 括弧・空白を除去して再マッチ
        const cleaned = header.replace(/[\s()（）\[\]【】]/g, '');
        for (const [alias, field] of Object.entries(HEADER_ALIASES)) {
            const cleanedAlias = alias.replace(/[\s()（）\[\]【】]/g, '');
            if (cleaned === cleanedAlias) {
                fieldMap[i] = field;
                matchCount++;
                break;
            }
        }
    }

    // 最低限、日付と時間系ヘッダーが1つ以上マッチしていればOK
    const mappedFields = Object.values(fieldMap);
    if (!mappedFields.includes('date')) return null;

    return fieldMap;
}

/**
 * 日付の正規化
 * YYYY/MM/DD, YYYY-MM-DD, YYYY/M/D 等に対応
 */
function normalizeDate(dateStr) {
    // YYYY/MM/DD or YYYY-MM-DD
    let m = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) {
        const y = m[1];
        const mo = m[2].padStart(2, '0');
        const d = m[3].padStart(2, '0');
        return `${y}-${mo}-${d}`;
    }
    return null;
}

/**
 * 時間の正規化
 * H:MM, HH:MM 等に対応
 */
function normalizeTime(timeStr) {
    if (!timeStr) return null;
    const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
        return m[1].padStart(2, '0') + ':' + m[2];
    }
    return null;
}

/**
 * CSV行をパース（ダブルクォート・タブ区切り対応）
 */
function parseCSVLines(text) {
    // タブ区切りかカンマ区切りかを自動判定
    const firstLine = text.split(/\r?\n/)[0] || '';
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter = tabCount > commaCount ? '\t' : ',';

    const lines = [];
    let current = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === delimiter) {
                current.push(field);
                field = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
                current.push(field);
                field = '';
                lines.push(current);
                current = [];
            } else {
                field += ch;
            }
        }
    }
    if (field || current.length > 0) {
        current.push(field);
        lines.push(current);
    }

    return lines;
}

/**
 * ファイル読み込み（File API）
 */
export function readCSVFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'));
        reader.readAsText(file, 'UTF-8');
    });
}
