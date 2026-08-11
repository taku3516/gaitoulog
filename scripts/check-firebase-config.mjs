#!/usr/bin/env node
// ===== クラウド同期の設定漏れ・秘密情報混入の検査 =====
//
//   node scripts/check-firebase-config.mjs
//
// 検査内容:
//   1. enabled: true なのに設定値が空のまま残っていないか
//   2. 秘密鍵・クライアントシークレットらしき文字列がリポジトリに混入していないか
//   3. Firestore ルールファイルが存在し、既定拒否が書かれているか
//
// 終了コード 0 = 問題なし / 1 = 要修正

import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSensitiveData } from './check-sensitive-data.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG_PATH = join(ROOT, 'data/firebase-config.js');
const RULES_PATH = join(ROOT, 'firebase/firestore.rules');

const problems = [];
const notes = [];

// ---------- 1. 設定値の整合性 ----------

function readConfig() {
    if (!existsSync(CONFIG_PATH)) {
        problems.push(`設定ファイルが見つかりません: ${relative(ROOT, CONFIG_PATH)}`);
        return null;
    }
    const source = readFileSync(CONFIG_PATH, 'utf8');
    if (!/window\.GAITOULOG_FIREBASE_SYNC\s*=\s*Object\.freeze\(\{/.test(source)) {
        problems.push('設定ファイルが所定の形式で window.GAITOULOG_FIREBASE_SYNC を定義していません。');
        return null;
    }

    // 検査対象をNode.jsコードとして実行しない。固定形式からリテラル値だけを読み取る。
    const readString = (text, key) => {
        const match = text.match(new RegExp(`\\b${key}\\s*:\\s*(['\"])([^'\"\\r\\n]*)\\1`));
        return match?.[2];
    };
    const readBoolean = (text, key) => {
        const match = text.match(new RegExp(`\\b${key}\\s*:\\s*(true|false)\\b`));
        return match ? match[1] === 'true' : undefined;
    };
    const readFrozenObject = (key) => {
        const start = source.match(new RegExp(`\\b${key}\\s*:\\s*Object\\.freeze\\(\\{`));
        if (!start || start.index === undefined) return null;
        const bodyStart = start.index + start[0].length;
        const rest = source.slice(bodyStart);
        const end = rest.search(/\}\s*\)/);
        return end < 0 ? null : rest.slice(0, end);
    };

    const firebaseBlock = readFrozenObject('firebaseConfig');
    const appCheckBlock = readFrozenObject('appCheck');
    if (!firebaseBlock || !appCheckBlock) {
        problems.push('firebaseConfig または appCheck の固定設定ブロックを読み取れません。');
        return null;
    }

    return {
        enabled: readBoolean(source, 'enabled'),
        sdkVersion: readString(source, 'sdkVersion'),
        firebaseConfig: {
            apiKey: readString(firebaseBlock, 'apiKey'),
            authDomain: readString(firebaseBlock, 'authDomain'),
            projectId: readString(firebaseBlock, 'projectId'),
            appId: readString(firebaseBlock, 'appId'),
        },
        appCheck: {
            enabled: readBoolean(appCheckBlock, 'enabled'),
            enterpriseSiteKey: readString(appCheckBlock, 'enterpriseSiteKey'),
        },
    };
}

const config = readConfig();

if (config) {
    if (config.enabled !== true) {
        notes.push('同期は無効（enabled: false）です。アプリは従来どおりローカル保存のみで動作します。');
    } else {
        const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
        const fb = config.firebaseConfig || {};
        for (const key of required) {
            if (typeof fb[key] !== 'string' || fb[key].trim() === '') {
                problems.push(`enabled: true ですが firebaseConfig.${key} が空です。`);
            }
        }
        if (typeof fb.projectId === 'string' && typeof fb.authDomain === 'string'
            && fb.projectId && fb.authDomain && !fb.authDomain.includes(fb.projectId)) {
            notes.push(`authDomain (${fb.authDomain}) と projectId (${fb.projectId}) が対応していない可能性があります。`);
        }
        if (config.appCheck?.enabled === true && !String(config.appCheck.enterpriseSiteKey || '').trim()) {
            problems.push('appCheck.enabled が true ですが enterpriseSiteKey が空です。');
        }
    }

    if (typeof config.sdkVersion !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(config.sdkVersion)) {
        problems.push(`sdkVersion の形式が不正です: ${JSON.stringify(config.sdkVersion)}（例: "12.16.0"）`);
    }
}

// ---------- 2. 秘密情報・個人情報の混入 ----------

for (const finding of findSensitiveData({ root: ROOT })) {
    problems.push(`秘密情報・個人情報の可能性: ${finding.path}:${finding.line} (${finding.label})`);
}

// ---------- 3. Firestore ルール ----------

if (!existsSync(RULES_PATH)) {
    problems.push(`Firestore ルールファイルが見つかりません: ${relative(ROOT, RULES_PATH)}`);
} else {
    const rules = readFileSync(RULES_PATH, 'utf8');
    if (!/rules_version\s*=\s*'2'/.test(rules)) {
        problems.push('firestore.rules に rules_version = \'2\' がありません。');
    }
    if (!/match\s*\/\{document=\*\*\}\s*\{\s*allow read, write: if false;/.test(rules.replace(/\n\s*/g, ' '))) {
        problems.push('firestore.rules に既定拒否 (match /{document=**} { allow read, write: if false; }) がありません。');
    }
    if (!/request\.auth\.uid\s*==\s*userId/.test(rules)) {
        problems.push('firestore.rules で本人確認 (request.auth.uid == userId) が行われていません。');
    }
    if (!/schemaVersion\s*==\s*1/.test(rules)) {
        problems.push('firestore.rules で schemaVersion の検証が行われていません。');
    }
    checkRecordFieldsCoveredByRules(rules);
}

// アプリが送る項目がルールの許可リストに無いと、書き込みが permission-denied で
// 弾かれ、その記録がこの端末から消えたように見える。両者のズレをここで検出する。
function checkRecordFieldsCoveredByRules(rules) {
    const syncSource = readFileSync(join(ROOT, 'js/sync/app-sync.js'), 'utf8');

    const sentFields = new Set(['id', 'schemaVersion', 'syncedAt', 'politicianId', 'temperature']);
    const collect = (blockName, pattern) => {
        const block = syncSource.match(new RegExp(`const ${blockName}\\s*=\\s*([\\[{][\\s\\S]*?[\\]}]);`));
        if (!block) {
            problems.push(`app-sync.js の ${blockName} を読み取れませんでした。`);
            return;
        }
        for (const m of block[1].matchAll(pattern)) sentFields.add(m[1]);
    };
    collect('STRING_LIMITS', /(\w+)\s*:/g);
    collect('NUMBER_LIMITS', /(\w+)\s*:/g);
    collect('LIST_FIELDS', /(\w+)\s*:/g);
    collect('BOOL_FIELDS', /'([^']+)'/g);

    const allowList = rules.match(/d\.keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
    if (!allowList) {
        problems.push('firestore.rules に記録の項目許可リスト (hasOnly) が見つかりません。');
        return;
    }
    const allowed = new Set([...allowList[1].matchAll(/'([^']+)'/g)].map(m => m[1]));

    const missing = [...sentFields].filter(f => !allowed.has(f));
    if (missing.length) {
        problems.push(
            `アプリが送る項目が firestore.rules で許可されていません: ${missing.join(', ')}。`
            + '（ルールを更新して Firebase コンソールで公開してください）'
        );
    }
}

// ---------- 結果 ----------

for (const note of notes) console.log(`ℹ️  ${note}`);

if (problems.length === 0) {
    console.log('✅ 設定チェック: 問題は見つかりませんでした。');
    process.exit(0);
}

console.error(`\n❌ ${problems.length} 件の問題が見つかりました:\n`);
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
