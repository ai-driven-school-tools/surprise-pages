import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { root, dir } from './paths.mjs';
await build({entryPoints:[`${root}/src/lib/deck/edit/text-sync.ts`],outfile:`${dir}/deck-text-sync.mjs`,bundle:true,platform:'node',format:'esm'});
const {DeckTextReplica,createTextState,applyTextChange}=await import(`${dir}/deck-text-sync.mjs`);
function test(name,run){run();console.log('OK  '+name);}
test('同じ位置に同時入力した文字が両方残り順序によらず一致する',()=>{
 const initial=createTextState('始終');const a=new DeckTextReplica(initial),b=new DeckTextReplica(initial);
 const x=a.replace('始甲終'),y=b.replace('始乙終');a.receive(y);b.receive(x);
 assert.equal(a.value,b.value);assert.match(a.value,/甲/);assert.match(a.value,/乙/);
 a.receive(y);assert.equal(a.value,b.value);a.destroy();b.destroy();
});
test('他人の入力を残して自分の入力だけ取り消しやり直せる',()=>{
 const initial=createTextState('始終');const a=new DeckTextReplica(initial),b=new DeckTextReplica(initial);
 const x=a.replace('始甲終'),y=b.replace('始乙終');a.receive(y);b.receive(x);
 b.receive(a.undo());assert.equal(a.value,'始乙終');assert.equal(a.value,b.value);
 b.receive(a.redo());assert.equal(a.value,b.value);assert.match(a.value,/甲/);a.destroy();b.destroy();
});
test('遠隔入力の前後で入力位置が元の文字を指す',()=>{
 const initial=createTextState('あいう');const a=new DeckTextReplica(initial),b=new DeckTextReplica(initial);
 const anchor=a.anchor(2);a.receive(b.replace('甲あいう'));assert.equal(a.position(anchor),3);a.destroy();b.destroy();
});
test('保存した同期記録から開き直しても通信断中の変更を合流できる',()=>{
 const initial=createTextState('本文');const a=new DeckTextReplica(initial),b=new DeckTextReplica(initial);
 const x=a.replace('甲本文'),y=b.replace('乙本文');const saved=applyTextChange(initial,x);
 const resumed=applyTextChange(saved.state,y);a.receive(y);assert.equal(resumed.value,a.value);a.destroy();b.destroy();
});
test('原稿更新後の文章へ古い入力を付け替えない',()=>{
 const a=new DeckTextReplica(createTextState('古い文章'));const x=a.replace('直した文章');
 assert.throws(()=>applyTextChange(createTextState('新しい文章'),x),/構成/);a.destroy();
});
test('10人の更新を重複させ到着順を変えても全員一致する',()=>{
 const initial=createTextState('本文');const replicas=Array.from({length:10},()=>new DeckTextReplica(initial));
 const changes=replicas.map((r,i)=>r.replace(`参加者${i}本文`));
 for(let i=0;i<replicas.length;i++)for(let j=0;j<changes.length*2;j++)replicas[i].receive(changes[(j*3+i)%changes.length]);
 for(const r of replicas){assert.equal(r.value,replicas[0].value);for(let i=0;i<10;i++)assert.ok(r.value.includes(String(i)));}replicas.forEach(r=>r.destroy());
 // Seeded random delivery keeps failures reproducible. Include dependent local
 // inserts/deletes, duplicates and reverse causal arrival, not just one update.
 for(let seed=1;seed<=30;seed++){
  let randomState=seed;
  const random=limit=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState%limit;};
  const state=createTextState('始本文終'),peers=Array.from({length:10},()=>new DeckTextReplica(state)),updates=[];
  for(let round=0;round<5;round++)for(let who=0;who<peers.length;who++){
    const replica=peers[who],value=replica.value,at=random(value.length+1);
    const next=round%2?value.slice(0,at)+value.slice(at+1):value.slice(0,at)+String(who)+value.slice(at);
    updates.push(replica.replace(next));
  }
  for(const peer of peers){
    const delivery=[...updates,...updates];
    for(let i=delivery.length-1;i>0;i--){const at=random(i+1);[delivery[i],delivery[at]]=[delivery[at],delivery[i]];}
    delivery.forEach(update=>peer.receive(update));peer.assertComplete();
  }
  for(const peer of peers){assert.equal(peer.value,peers[0].value,`seed ${seed}`);peer.destroy();}
 }
});
