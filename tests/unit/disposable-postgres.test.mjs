import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {freePort,startDisposablePostgres} from '../checks/disposable-postgres.mjs';

test('a taken port is retried with another one on a clean directory; persistent failure is reported',async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'pages-disposable-pg-test-'));
 try{
  const databaseDir=path.join(temp,'db'),made=[],ports=[5001,5002,5003,5004];
  class Fake{
   constructor(options){this.options=options;made.push(this);}
   async initialise(){await assert.rejects(stat(databaseDir),'やり直しの前に保管庫が片付いている');await mkdir(databaseDir);}
   async start(){if(this.options.port===5001)throw Error('port taken');}
   async stop(){this.stopped=true;}
  }
  const {cluster,port}=await startDisposablePostgres(Fake,{databaseDir,user:'u'},{pickPort:async()=>ports.shift()});
  assert.equal(port,5002);assert.equal(cluster,made[1]);assert.equal(made[0].stopped,true);
  assert.deepEqual(made.map(one=>[one.options.port,one.options.user]),[[5001,'u'],[5002,'u']]);
  await rm(databaseDir,{recursive:true});
  class Broken{async initialise(){throw Error('always');}async stop(){throw Error('not started');}}
  let picks=0;
  await assert.rejects(startDisposablePostgres(Broken,{databaseDir},{pickPort:async()=>++picks}),/always/);
  assert.equal(picks,3);
  const free=await freePort();assert.ok(Number.isInteger(free)&&free>0);
 }finally{await rm(temp,{recursive:true,force:true});}
});
