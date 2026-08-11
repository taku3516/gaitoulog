#!/usr/bin/env node

import {
    existsSync, readFileSync, readdirSync, lstatSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, relative, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAX_TEXT_BYTES = 2_000_000;
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const TEXT_EXTENSIONS = new Set([
    '', '.css', '.csv', '.env', '.html', '.ini', '.js', '.json', '.md', '.mjs',
    '.properties', '.rules', '.sh', '.toml', '.tsv', '.txt', '.xml', '.yaml', '.yml',
]);

// パターンを分割して記述し、検査スクリプト自身が検出対象にならないようにする。
const SECRET_PATTERNS = [
    ['秘密鍵 (PEM)', new RegExp('-----BEGIN ' + '[A-Z ]*PRIVATE KEY-----')],
    ['サービスアカウントのprivate_key', new RegExp('"private_' + 'key"\\s*:\\s*"[^"\\r\\n]+"')],
    ['GoogleサービスアカウントJSON', new RegExp('"type"\\s*:\\s*"service_' + 'account"')],
    ['OAuthクライアントシークレット', new RegExp('"client_' + 'secret"\\s*:\\s*"(?!example|placeholder|xxx)[^"\\r\\n]{8,}"', 'i')],
    ['Google OAuthクライアントシークレット', new RegExp('GOC' + 'SPX-[A-Za-z0-9_-]{10,}')],
    ['GitHubトークン', new RegExp('(gh' + '[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})')],
    ['AWSアクセスキー', new RegExp('AK' + 'IA[0-9A-Z]{16}')],
    ['OpenAI形式の秘密鍵', new RegExp('sk-' + '[A-Za-z0-9_-]{20,}')],
    ['Slackトークン', new RegExp('xox' + '[baprs]-[A-Za-z0-9-]{10,}')],
    ['Stripe本番秘密鍵', new RegExp('sk_' + 'live_[A-Za-z0-9]{16,}')],
    ['SendGrid APIキー', new RegExp('SG\\.' + '[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{16,}')],
    ['npmトークン', new RegExp('npm_' + '[A-Za-z0-9]{20,}')],
    ['Google OAuthアクセストークン', new RegExp('ya29\\.' + '[A-Za-z0-9_-]{20,}')],
    ['JWT', new RegExp('eyJ' + '[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}')],
    ['汎用シークレット代入', new RegExp(
        '(?:api[_-]?secret|client[_-]?secret|password|passwd|private[_-]?key|refresh[_-]?token|access[_-]?token)'
        + '\\s*[:=]\\s*[\'\"](?!example|placeholder|changeme|xxx)[A-Za-z0-9_./+=-]{16,}[\'\"]',
        'i',
    )],
];

const PERSONAL_DATA_PATTERNS = [
    ['メールアドレス', new RegExp('[A-Z0-9._%+-]+' + '@[A-Z0-9.-]+\\.[A-Z]{2,}', 'i')],
    ['携帯電話番号', new RegExp('(?:^|[^0-9])0[789]0[- ]?[0-9]{4}[- ]?[0-9]{4}(?:$|[^0-9])')],
    ['郵便番号', new RegExp('(?:^|[^0-9])(?:〒\\s*)?[0-9]{3}-[0-9]{4}(?:$|[^0-9])')],
    ['個人情報フィールドの固定値', new RegExp(
        '(?:^|[^A-Za-z0-9_])(?:full[_-]?name|氏名|volunteerNames|address|住所|phone|電話|email|メール)'
        + '\\s*[:=]\\s*[\'\"](?!example|sample|dummy)[^\'\"\\r\\n]{2,}[\'\"]',
        'im',
    )],
];

const SENSITIVE_FILE_NAMES = [
    [/^\.env(?:\..+)?$/i, '環境変数ファイル'],
    [/(?:service[-_]?account|credentials?|secrets?)(?:\.[^.]+)?$/i, '認証情報らしいファイル名'],
    [/(?:^|\/)(?:id_rsa|id_ed25519)$/i, 'SSH秘密鍵'],
    [/\.(?:key|p12|pfx|pem)$/i, '鍵・証明書ファイル'],
    [/\.(?:csv|tsv|xlsx|xls|sqlite|sqlite3|db|backup)$/i, '個人情報を含む可能性があるデータファイル'],
];

function lineNumberAt(text, index) {
    return text.slice(0, index).split('\n').length;
}

function sensitiveFileReason(path) {
    const normalized = path.replaceAll('\\', '/');
    // テンプレートは値が空であることを内容検査するため、ファイル名だけでは拒否しない。
    if (/^\.env\.example$/i.test(basename(normalized))) return null;
    return SENSITIVE_FILE_NAMES.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}

export function scanText(path, content) {
    const findings = [];
    for (const [label, pattern] of [...SECRET_PATTERNS, ...PERSONAL_DATA_PATTERNS]) {
        const match = pattern.exec(content);
        if (match) findings.push({ path, line: lineNumberAt(content, match.index), label });
    }
    return findings;
}

function scanEntry(path, buffer) {
    const findings = [];
    const fileReason = sensitiveFileReason(path);
    if (fileReason) findings.push({ path, line: 1, label: fileReason });

    if (buffer.length > MAX_TEXT_BYTES) {
        findings.push({ path, line: 1, label: `自動検査上限（${MAX_TEXT_BYTES} bytes）を超えるファイル` });
        return findings;
    }
    if (buffer.includes(0)) return findings;
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) return findings;
    return findings.concat(scanText(path, buffer.toString('utf8')));
}

function walkCurrent(dir, findings) {
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        const stat = lstatSync(full);
        if (stat.isSymbolicLink()) {
            findings.push({ path: relative(ROOT, full), line: 1, label: 'シンボリックリンクは自動検査対象外' });
            continue;
        }
        if (stat.isDirectory()) {
            walkCurrent(full, findings);
        } else if (stat.isFile()) {
            findings.push(...scanEntry(relative(ROOT, full), readFileSync(full)));
        }
    }
}

function git(args, encoding = null) {
    return execFileSync('git', args, {
        cwd: ROOT,
        encoding,
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function isNoreplyEmail(email) {
    return /@users\.noreply\.github\.com$/i.test(email);
}

function scanGitIdentity({ includeHead = false } = {}) {
    const findings = [];
    try {
        const configured = git(['config', '--get', 'user.email'], 'utf8').trim();
        if (configured && !isNoreplyEmail(configured)) {
            findings.push({ path: '.git/config', line: 1, label: 'Git作者メールがGitHub noreply形式ではありません' });
        }
    } catch {
        // CI等で作者メールが未設定の場合は、HEADの作者情報だけを検査する。
    }
    if (includeHead) {
        try {
            const author = git(['log', '-1', '--format=%ae', 'HEAD'], 'utf8').trim();
            if (author && !isNoreplyEmail(author)) {
                findings.push({ path: 'HEAD', line: 1, label: '最新コミットの作者メールがGitHub noreply形式ではありません' });
            }
        } catch {
            // まだコミットがないリポジトリでは検査不要。
        }
    }
    return findings;
}

function scanStaged() {
    const output = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
    const paths = output.toString('utf8').split('\0').filter(Boolean);
    const findings = [];
    for (const path of paths) {
        try {
            findings.push(...scanEntry(path, git(['show', `:${path}`])));
        } catch {
            findings.push({ path, line: 1, label: 'ステージ済み内容を読み取れません' });
        }
    }
    return findings.concat(scanGitIdentity());
}

function scanHistory() {
    const objects = git(['rev-list', '--objects', '--all'], 'utf8').split('\n').filter(Boolean);
    const findings = [];
    for (const row of objects) {
        const separator = row.indexOf(' ');
        if (separator < 0) continue;
        const hash = row.slice(0, separator);
        const path = row.slice(separator + 1);
        try {
            if (git(['cat-file', '-t', hash], 'utf8').trim() !== 'blob') continue;
            findings.push(...scanEntry(`${path}@${hash.slice(0, 12)}`, git(['cat-file', 'blob', hash])));
        } catch {
            findings.push({ path, line: 1, label: 'Git履歴オブジェクトを読み取れません' });
        }
    }
    return findings;
}

export function findSensitiveData({ root = ROOT, mode = 'current' } = {}) {
    if (root !== ROOT && mode !== 'current') throw new Error('root指定はcurrentモードのみ対応しています。');
    if (mode === 'staged') return scanStaged();
    if (mode === 'history') return scanHistory();
    const findings = [];
    if (!existsSync(root)) return [{ path: root, line: 1, label: '検査対象が存在しません' }];
    walkCurrent(root, findings);
    if (root === ROOT) findings.push(...scanGitIdentity({ includeHead: true }));
    return findings;
}

function main() {
    const mode = process.argv.includes('--staged')
        ? 'staged'
        : process.argv.includes('--history') ? 'history' : 'current';
    const findings = findSensitiveData({ mode });
    if (findings.length === 0) {
        console.log(`✅ 秘密情報・個人情報チェック (${mode}): 問題は見つかりませんでした。`);
        return;
    }
    console.error(`❌ 秘密情報・個人情報の可能性がある項目を${findings.length}件検出しました。`);
    console.error('安全のため値は表示しません。ファイル名と行番号を確認してください。');
    for (const finding of findings) {
        console.error(`  - ${finding.path}:${finding.line} (${finding.label})`);
    }
    process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
