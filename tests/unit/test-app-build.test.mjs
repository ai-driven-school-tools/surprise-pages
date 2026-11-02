import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {prepareTestApp,testBuildIdentity,restoreTestBuild,moveDirectory} from '../support/test-app-build.mjs';
const exec=promisify(execFile);
test('shared builds exclude credentials and reject another source or an incomplete artifact',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'pages-build-contract-'));
 const root=path.join(dir,'source'),app=path.join(dir,'app'),artifact=path.join(dir,'artifact');
 try{
  await mkdir(root);await mkdir(path.join(root,'node_modules'));
  await exec('git',['init','--quiet'],{cwd:root});
  await writeFile(path.join(root,'next.config.ts'),'const nextConfig={};export default nextConfig;');
  await writeFile(path.join(root,'.env.local'),'DO_NOT_COPY=private');
  await writeFile(path.join(root,'.gitignore'),'node_modules\n.env*\n');
  await prepareTestApp(root,app);
  await assert.rejects(readFile(path.join(app,'.env.local')));
  const identity=await testBuildIdentity(root);
  await mkdir(artifact);await writeFile(path.join(artifact,'manifest.json'),JSON.stringify(identity));
  await assert.rejects(restoreTestBuild(root,app,artifact));
  for(const output of ['.next','src/widget/dist','vendor'])await mkdir(path.join(artifact,output),{recursive:true});
  await writeFile(path.join(artifact,'.next/BUILD_ID'),'build-example');
  await restoreTestBuild(root,app,artifact);
  assert.equal(await readFile(path.join(app,'.next/BUILD_ID'),'utf8'),'build-example');
  await writeFile(path.join(root,'next.config.ts'),'changed source');
  await assert.rejects(restoreTestBuild(root,app,artifact),/一致/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('the reusable build cache is moved in and out, and a first build without one still works',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'pages-build-cache-'));
 try{
  const saved=path.join(dir,'saved'),inApp=path.join(dir,'src/app/.next/cache');
  await moveDirectory(saved,inApp);
  await assert.rejects(readFile(path.join(inApp,'entry'),'utf8'));
  await mkdir(saved);await writeFile(path.join(saved,'entry'),'webpack');
  await moveDirectory(saved,inApp);
  assert.equal(await readFile(path.join(inApp,'entry'),'utf8'),'webpack');
  await assert.rejects(readFile(path.join(saved,'entry')));
  await moveDirectory(inApp,saved);
  assert.equal(await readFile(path.join(saved,'entry'),'utf8'),'webpack');
 }finally{await rm(dir,{recursive:true,force:true});}
});
