import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=await mkdtemp(path.join(tmpdir(),'read-aloud-settings-'));
const out=path.join(dir,'read-aloud.mjs');
await build({stdin:{contents:'export * from "./src/lib/read-aloud/settings"; export * from "./src/lib/read-aloud/text";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:out});
const m=await import(pathToFileURL(out).href);
test.after(()=>rm(dir,{recursive:true,force:true}));

const voice=(voiceURI,lang,localService=true,isDefault=false)=>({voiceURI,name:voiceURI.split('.').at(-1),lang,localService,default:isDefault});

test('端末の中で動く声だけを選ぶ（外へ送る声は選ばない）',()=>{
 const cloud=voice('Google 日本語','ja-JP',false,true);
 assert.equal(m.pickVoice([cloud],'ja'),null);
 const kyoko=voice('com.apple.voice.compact.ja-JP.Kyoko','ja-JP');
 assert.equal(m.pickVoice([cloud,kyoko],'ja'),kyoko);
 assert.deepEqual(m.localVoices([cloud,kyoko]),[kyoko]);
});

test('品質の段の高い声を選ぶ（Safari は全部が既定を名乗る）',()=>{
 const eloquence=voice('com.apple.eloquence.ja-JP.Reed','ja-JP',true,true);
 const compact=voice('com.apple.voice.compact.ja-JP.Kyoko','ja-JP',true,true);
 const premium=voice('com.apple.voice.premium.ja-JP.Otoya','ja-JP',true,true);
 assert.equal(m.pickVoice([eloquence,compact,premium],'ja-JP'),premium);
});

test('本人が選んだ声は、同じ言語で端末にあるときだけ使う',()=>{
 const kyoko=voice('com.apple.voice.compact.ja-JP.Kyoko','ja-JP');
 const otoya=voice('com.apple.voice.compact.ja-JP.Otoya','ja-JP');
 const samantha=voice('com.apple.voice.compact.en-US.Samantha','en-US');
 assert.equal(m.pickVoice([kyoko,otoya,samantha],'ja','com.apple.voice.compact.ja-JP.Otoya'),otoya);
 // 言語が違う声は、日本語のページでは使わない（自動で選ぶ）
 assert.equal(m.pickVoice([kyoko,samantha],'ja','com.apple.voice.compact.en-US.Samantha'),kyoko);
 // 端末から消えた声は自動に戻る
 assert.equal(m.pickVoice([kyoko],'ja','gone'),kyoko);
});

test('速さは段にある値だけ・押すたびに 1 段送り、最後の次は等速',()=>{
 assert.equal(m.parseRate('1.5'),1.5);
 assert.equal(m.parseRate('3'),1);
 assert.equal(m.parseRate(null),1);
 assert.deepEqual(m.SPEECH_RATES.map(m.nextRate),[1.25,1.5,2,1]);
 assert.equal(m.rateLabel(1.25),'1.25×');
});

test('文に分ける（閉じ括弧は句点と離さない・空白だけの区間は返さない）',()=>{
 const text='はじめに。「そうです。」と言った！\n  \n次の段落';
 assert.deepEqual(m.sentenceSpans(text).map(({start,end})=>text.slice(start,end)),['はじめに。','「そうです。」','と言った！','次の段落']);
});

test('絵・コード・隠した注記・赤入れの取り消しは声にしない',()=>{
 const attrs=(map)=>(name)=>map[name]??null;
 assert.equal(m.isReadAloudSilent('pre',attrs({})),true);
 assert.equal(m.isReadAloudSilent('p',attrs({'aria-hidden':'true'})),true);
 assert.equal(m.isReadAloudSilent('del',attrs({'data-surprise-redline':'1'})),true);
 assert.equal(m.isReadAloudSilent('del',attrs({})),false);
 assert.equal(m.isReadAloudSilent('p',attrs({})),false);
});
