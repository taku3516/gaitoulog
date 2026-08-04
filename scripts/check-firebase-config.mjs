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

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
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
    // ブラウザ用のファイルをそのまま評価するため、window を用意して実行する
    const sandbox = { window: {} };
    try {
        new Function('window', source)(sandbox.window);
    } catch (e) {
        problems.push(`設定ファイルを解釈できません: ${e.message}`);
        return null;
    }
    const config = sandbox.window.GAITOULOG_FIREBASE_SYNC;
    if (!config) {
        problems.push('設定ファイルが window.GAITOULOG_FIREBASE_SYNC を定義していません。');
        return null;
    }
    return config;
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

// ---------- 2. 秘密情報の混入 ----------

const SECRET_PATTERNS = [
    { name: '秘密鍵 (PEM)', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: 'サービスアカウントの private_key', re: /"private_key"\s*:/ },
    { name: 'サービスアカウントJSON', re: /"type"\s*:\s*"service_account"/ },
    { name: 'OAuthクライアントシークレット', re: /"client_secret"\s*:/ },
    { name: 'GOCSPX形式のクライアントシークレット', re: /GOCSPX-[A-Za-z0-9_-]{10,}/ },
];

const SKIP_DIRS = new Set(['.git', 'node_modules', '.github']);
const TEXT_EXT = new Set(['.js', '.mjs', '.json', '.html', '.css', '.md', '.rules', '.yml', '.yaml', '.txt', '']);

function walk(dir) {
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) { walk(full); continue; }
        if (!TEXT_EXT.has(extname(entry))) continue;
        if (st.size > 2_000_000) continue;

        const content = readFileSync(full, 'utf8');
        for (const { name, re } of SECRET_PATTERNS) {
            if (re.test(content)) {
                problems.push(`秘密情報らしき文字列を検出: ${relative(ROOT, full)} (${name})`);
            }
        }
    }
}

walk(ROOT);

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
