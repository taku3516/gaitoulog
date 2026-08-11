import test from 'node:test';
import assert from 'node:assert/strict';

import { scanText } from './check-sensitive-data.mjs';

test('通常の公開設定値を秘密情報として扱わない', () => {
    const source = "const config = { projectId: 'gaitoulog', appId: 'public-app-id' };";
    assert.deepEqual(scanText('data/firebase-config.js', source), []);
});

test('秘密鍵を値を表示せず検出する', () => {
    const source = '-----BEGIN ' + 'PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----';
    const findings = scanText('private.pem', source);
    assert.equal(findings[0]?.label, '秘密鍵 (PEM)');
});

test('メールアドレスを個人情報候補として検出する', () => {
    const source = 'person' + '@' + 'example.com';
    const findings = scanText('notes.txt', source);
    assert.equal(findings[0]?.label, 'メールアドレス');
});
