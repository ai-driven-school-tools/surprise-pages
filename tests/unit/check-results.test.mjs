import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseInventory, inspectResult, missingChecks} from '../../scripts/ci/check-results.mjs';

test('damaged or empty inventory must fail', () => {
  for (const text of ['{', '{}', '[]', 'null', '{"check-a.mjs":{"items":0,"sections":0}}',
    '{"check-a.mjs":{"items":1,"sections":-1}}']) assert.throws(() => parseInventory(text));
});
test('removed test cannot disappear from the result', () => {
  const inventory = parseInventory('{"check-a.mjs":{"items":2,"sections":1}}');
  assert.deepEqual(missingChecks(inventory, []), ['check-a.mjs']);
});
test('zero checks and incomplete checks must fail', () => {
  assert.equal(inspectResult('nothing ran', undefined).empty, true);
  assert.equal(inspectResult('OK first\n', {items:2, sections:0}).shrank, true);
  assert.equal(inspectResult('OK first\nNG second\n', {items:2, sections:0}).ng, 1);
  assert.equal(inspectResult('--- section\nOK first\nOK second\n', {items:2, sections:1}).shrank, false);
});

test('sharding executes every registered check exactly once and refuses invalid partitions',async()=>{
 const {shardChecks}=await import('../../scripts/ci/check-results.mjs');
 for(const count of [4,17,130]){
  const files=Array.from({length:count},(_,i)=>`check-${i}.mjs`);
  const slices=Array.from({length:4},(_,i)=>shardChecks(files,`${i+1}/4`));
  assert.deepEqual(slices.flat().sort(),files.sort());
  assert.equal(new Set(slices.flat()).size,count);
  for(const invalid of ['0/4','5/4','1/0','1/999','1.5/4','x'])assert.throws(()=>shardChecks(files,invalid));
 }
});

test('time-weighted sharding balances the load, still runs unknown checks, and is the same on every shard',async()=>{
 const {shardChecks,parseDurations,runPool}=await import('../../scripts/ci/check-results.mjs');
 const files=['check-a.mjs','check-b.mjs','check-c.mjs','check-d.mjs','check-new.mjs'];
 const durations={'check-a.mjs':60,'check-b.mjs':5,'check-c.mjs':30,'check-d.mjs':25,'check-gone.mjs':99};
 const slices=[1,2].map(index=>shardChecks(files,`${index}/2`,durations));
 assert.deepEqual(slices.flat().sort(),[...files].sort());
 // the unknown check weighs the median (30). By name order the shards would carry 120s against 30s; by time 85s against 65s
 assert.deepEqual(slices[0],['check-a.mjs','check-d.mjs']);
 assert.deepEqual(slices[1],['check-b.mjs','check-c.mjs','check-new.mjs']);
 assert.deepEqual(shardChecks(files,'1/2',durations),slices[0]);
 for(const damaged of ['{}','{"checks":[]}','{"checks":{"other.mjs":1}}','{"checks":{"check-a.mjs":-1}}','{"checks":{"check-a.mjs":"1"}}'])assert.throws(()=>parseDurations(damaged));
 assert.deepEqual(parseDurations('{"checks":{"check-a.mjs":1.5}}'),{'check-a.mjs':1.5});
 let running=0,peak=0;
 const out=await runPool([3,1,2,5,4],2,async value=>{running++;peak=Math.max(peak,running);await new Promise(resolve=>setTimeout(resolve,value));running--;return value*2;});
 assert.deepEqual(out,[6,2,4,10,8]);assert.equal(peak,2);
 await assert.rejects(runPool([1],0,async()=>1));
 // heavy items never overlap with each other, every item still runs once, and a free worker is not left idle behind them
 const heavy=value=>value>=10,log=[];
 let heavyNow=0,heavyPeak=0,nowAll=0,peakAll=0;
 const ran=await runPool([10,11,1,12,2,3,13],3,async value=>{
  nowAll++;peakAll=Math.max(peakAll,nowAll);if(heavy(value)){heavyNow++;heavyPeak=Math.max(heavyPeak,heavyNow);}
  log.push(value);await new Promise(resolve=>setTimeout(resolve,heavy(value)?8:2));
  if(heavy(value))heavyNow--;nowAll--;return value;
 },heavy);
 assert.deepEqual(ran,[10,11,1,12,2,3,13]);assert.equal(heavyPeak,1);assert.ok(peakAll>=2);
 assert.deepEqual([...log].sort((a,b)=>a-b),[1,2,3,10,11,12,13]);
 // the second worker took an ordinary item instead of waiting behind the first heavy one
 assert.deepEqual(log.slice(0,2),[10,1]);
 // only heavy items left: they run one after another and none is dropped
 assert.deepEqual(await runPool([10,11,12],3,async value=>value,heavy),[10,11,12]);
 // a failing heavy item releases the lock
 await assert.rejects(runPool([10,11],2,async value=>{if(value===10)throw Error('x');return value;},heavy));
});
