// ===== Firestore セキュリティルールのテスト =====
// 実行方法は docs/firebase-sync-setup.md の「ルールのテスト」を参照。
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'demo-gaitoulog',
  firestore: { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
});

const google = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
const password = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const validRecord = (id='rec1', overrides={}) => ({
  id, politicianId: 'default', schemaVersion: 1, syncedAt: serverTimestamp(),
  date: '2026-05-01', area: '品川', spot: '大井町駅前', distributionCount: 42,
  startTime: '09:00', endTime: '10:00', memo: 'テスト', themes: ['子育て'], ...overrides,
});

let pass=0, fail=0;
const check=(n,c)=>{ c?(pass++,console.log('  ok  '+n)):(fail++,console.log('  FAIL '+n)); };
async function expectOk(name, p){ try { await assertSucceeds(p); check(name,true);} catch(e){ check(name,false); } }
async function expectDenied(name, p){ try { await assertFails(p); check(name,true);} catch(e){ check(name,false); } }

const A = google('userA'), B = google('userB');

await expectOk('本人はレコードを書ける', setDoc(doc(A,'users/userA/records/rec1'), validRecord()));
await expectOk('本人はレコードを読める', getDoc(doc(A,'users/userA/records/rec1')));
await expectDenied('他人のパスへ書けない', setDoc(doc(B,'users/userA/records/rec2'), validRecord('rec2')));
await expectDenied('他人のパスを読めない', getDoc(doc(B,'users/userA/records/rec1')));
await expectDenied('未認証は書けない', setDoc(doc(anon(),'users/userA/records/rec3'), validRecord('rec3')));
await expectDenied('未認証は読めない', getDoc(doc(anon(),'users/userA/records/rec1')));
await expectDenied('Google以外のログインは拒否', setDoc(doc(password('userA'),'users/userA/records/rec4'), validRecord('rec4')));

await expectDenied('未知のフィールドは拒否', setDoc(doc(A,'users/userA/records/rec5'), validRecord('rec5',{ evil: 'x' })));
await expectDenied('schemaVersion 違いは拒否', setDoc(doc(A,'users/userA/records/rec6'), validRecord('rec6',{ schemaVersion: 2 })));
await expectDenied('syncedAt がサーバー時刻でないと拒否', setDoc(doc(A,'users/userA/records/rec7'), validRecord('rec7',{ syncedAt: '2026-01-01' })));
await expectDenied('id と docId の不一致は拒否', setDoc(doc(A,'users/userA/records/rec8'), validRecord('mismatch')));
await expectDenied('必須項目 area 欠落は拒否', setDoc(doc(A,'users/userA/records/rec9'), (()=>{const r=validRecord('rec9'); delete r.area; return r;})()));
await expectDenied('文字数超過(memo)は拒否', setDoc(doc(A,'users/userA/records/rec10'), validRecord('rec10',{ memo: 'あ'.repeat(2001) })));
await expectDenied('件数超過(themes)は拒否', setDoc(doc(A,'users/userA/records/rec11'), validRecord('rec11',{ themes: Array.from({length:31},(_,i)=>'t'+i) })));
await expectDenied('負の配布枚数は拒否', setDoc(doc(A,'users/userA/records/rec12'), validRecord('rec12',{ distributionCount: -1 })));
await expectDenied('型違い(distributionCount が文字列)は拒否', setDoc(doc(A,'users/userA/records/rec13'), validRecord('rec13',{ distributionCount: '42' })));
await expectDenied('不正な文字を含むIDは拒否', setDoc(doc(A,'users/userA/records/bad id!'), validRecord('bad id!')));
await expectOk('気温は負の値を許可', setDoc(doc(A,'users/userA/records/rec14'), validRecord('rec14',{ temperature: -5 })));
await expectOk('地名(locality)を書ける', setDoc(doc(A,'users/userA/records/rec15'), validRecord('rec15',{ locality: '戸越' })));
await expectOk('スポットIDを書ける', setDoc(doc(A,'users/userA/records/rec17'), validRecord('rec17',{ spotId: 'preset_abc123' })));
await expectDenied('文字数超過(locality)は拒否', setDoc(doc(A,'users/userA/records/rec16'), validRecord('rec16',{ locality: 'あ'.repeat(101) })));

const validSpot = (id='spot1', o={}) => ({
  id, schemaVersion: 1, syncedAt: serverTimestamp(), area: '大井', locality: '大井',
  spot: 'テスト地点', lat: 35.606, lng: 139.734, source: 'custom', archived: false,
  deleted: false, baselineVersion: '2026-08-13', ...o,
});
await expectOk('本人は追加スポットを書ける', setDoc(doc(A,'users/userA/spots/spot1'), validSpot()));
await expectOk('本人は追加スポットを読める', getDoc(doc(A,'users/userA/spots/spot1')));
await expectOk('本人はピン位置と名称を更新できる', setDoc(doc(A,'users/userA/spots/spot1'), validSpot('spot1',{ spot: '移動後の地点', lat: 35.607, lng: 139.735 })));
await expectOk('標準ピンの上書きを同じIDで保存できる', setDoc(doc(A,'users/userA/spots/preset_abc123'), validSpot('preset_abc123',{ spot: '標準ピン変更' })));
await expectOk('標準ピンの削除印を保存できる', setDoc(doc(A,'users/userA/spots/preset_deleted'), validSpot('preset_deleted',{ deleted: true })));
await expectDenied('他人の追加スポットへ書けない', setDoc(doc(B,'users/userA/spots/spot2'), validSpot('spot2')));
await expectDenied('範囲外の緯度は拒否', setDoc(doc(A,'users/userA/spots/spot3'), validSpot('spot3',{ lat: 91 })));
await expectDenied('標準スポットをクラウドへ書けない', setDoc(doc(A,'users/userA/spots/spot4'), validSpot('spot4',{ source: 'preset' })));

const validPolitician = (id='pol1', o={}) => ({ id, name: '第2アカウント', schemaVersion: 1, syncedAt: serverTimestamp(), ...o });
await expectOk('本人はアカウントを書ける', setDoc(doc(A,'users/userA/politicians/pol1'), validPolitician()));
await expectDenied('他人のアカウントへ書けない', setDoc(doc(B,'users/userA/politicians/pol2'), validPolitician('pol2')));
await expectDenied('アカウント名の空文字は拒否', setDoc(doc(A,'users/userA/politicians/pol3'), validPolitician('pol3',{ name: '' })));

await expectOk('本人は削除できる', deleteDoc(doc(A,'users/userA/records/rec1')));
await expectDenied('関係ないコレクションは既定拒否', setDoc(doc(A,'other/doc1'), { x: 1 }));
await expectDenied('users直下も拒否', setDoc(doc(A,'users/userA'), { x: 1 }));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail?1:0);
