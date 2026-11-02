/** Build once, then run isolated databases against the same test-only app. */
import {cp,readFile,mkdir,mkdtemp,realpath,rename,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {watch} from 'node:fs';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {appEnvironment} from './environment.mjs';
const exec=promisify(execFile);
const excluded=new Set(['node_modules','.git','.next','.vercel','.test-runtime','.test-build','test-results','playwright-report','coverage','backups','dist']);
const allowed=relative=>!relative.split(path.sep).some(part=>excluded.has(part)||part.startsWith('.env')||part==='.pages-site.json');
const outputs=['.next','src/widget/dist','vendor'];
export async function testBuildIdentity(root){
 const {stdout}=await exec('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,maxBuffer:16*1024*1024});
 const hash=createHash('sha256');
 for(const file of [...new Set(stdout.split('\0').filter(file=>file&&allowed(file)))].sort()){
  hash.update(file+'\0');hash.update(await readFile(path.join(root,file)));hash.update('\0');
 }
 return {format:1,source:hash.digest('hex'),node:process.version,platform:process.platform,arch:process.arch};
}
export async function prepareTestApp(root,app){
 await cp(root,app,{recursive:true,filter:source=>allowed(path.relative(root,source))});
 await aliasDisposableBlob(app);
 await symlink(path.join(root,'node_modules'),path.join(app,'node_modules'),'dir');
}
/**
 * 写しの組み立て設定だけで、画像の置き場を検査用（tests/support/blob-store.mjs）へ差し替える。リポジトリの設定は触らない。
 *
 * もう 1 つ、見た目の指定を作る道具（tailwindcss-v3）をサーバーの束に入れない。本番の組み立て（Turbopack）は
 * serverExternalPackages をそのまま守るが、検査用の webpack は別名の部品（npm:tailwindcss@3）を本名で見分けるので束ねてしまい、
 * 道具が自分の置き場の CSS を読めずに「本文を描く前の待ちを外す」差し込み（src/lib/first-paint/delivery.ts）が毎回失敗していた
 * （本番より遅い条件で画面を検査していた・docs/design/app-speed.md）。
 */
export async function aliasDisposableBlob(app){
 const config=path.join(app,'next.config.ts');
 await writeFile(config,(await readFile(config,'utf8'))+'\nnextConfig.webpack = (config, { isServer }) => { config.resolve.alias["@vercel/blob$"] = '+JSON.stringify(path.join(app,'tests/support/blob-store.mjs'))+'; if (isServer) config.externals = [...[config.externals ?? []].flat(), ({ request }: { request?: string }, callback: (error?: Error | null, result?: string) => void) => request === "tailwindcss-v3" ? callback(null, "commonjs tailwindcss-v3") : callback()]; return config; };\n');
}
/**
 * 直したファイルを写しへ届け続ける（手元の開発で、写しの上の next dev に直しを拾わせる）。
 * 届けるのは写しを作ったときと同じ範囲だけ（.env や組み立て物は届けない）。組み立て設定を直したら、
 * 差し替えも付け直す。止めるときは戻り値の close() を呼ぶ。
 */
export function mirrorTestApp(root,app,{onError=()=>{}}={}){
 let queue=Promise.resolve();
 const copyOne=async relative=>{
  const from=path.join(root,relative),to=path.join(app,relative);
  let info;
  try{info=await stat(from);}catch{await rm(to,{recursive:true,force:true});return;}
  if(info.isDirectory())return;
  await mkdir(path.dirname(to),{recursive:true});
  await cp(from,to);
  if(relative==='next.config.ts')await aliasDisposableBlob(app);
 };
 const watcher=watch(root,{recursive:true},(_event,name)=>{
  if(typeof name!=='string'||!name||!allowed(name))return;
  queue=queue.then(()=>copyOne(name)).catch(onError);
 });
 return {close:()=>watcher.close()};
}
/**
 * 組み立ての脚本は「直に呼ばれたときだけ動く」を本当の道（import.meta.url）と argv[1] の突き合わせで決めるので、
 * 近道の道（Mac の一時フォルダ /var/folders は /private/var への近道）のまま渡すと黙って何もしない。本当の道で呼ぶ。
 */
export async function buildTestApp(root,source,env,run){
 await mkdir(path.join(source,'src/widget/dist'),{recursive:true});
 const app=await realpath(source);
 await run([path.join(app,'scripts/build/widget.mjs')],app,env);
 await run([path.join(app,'scripts/build/vendor.mjs')],app,env);
 await run([path.join(root,'node_modules/next/dist/bin/next'),'build','--webpack'],app,env);
}
export async function restoreTestBuild(root,app,artifact){
 const actual=JSON.parse(await readFile(path.join(artifact,'manifest.json'),'utf8'));
 const expected=await testBuildIdentity(root);
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('検査用ビルドの原稿・実行環境が一致しません');
 if(!(await readFile(path.join(artifact,'.next/BUILD_ID'),'utf8')).trim())throw Error('完成した検査用ビルドがありません');
 for(const output of outputs)await cp(path.join(artifact,output),path.join(app,output),{recursive:true});
}
/**
 * The same commit is type-checked by the production build job, and the gate needs both. The shared
 * test build only has to produce the app, so it does not repeat that step.
 */
export async function skipRepeatedTypecheck(app){
 const config=path.join(app,'next.config.ts');
 await writeFile(config,(await readFile(config,'utf8'))+'\nnextConfig.typescript = { ...nextConfig.typescript, ignoreBuildErrors: true };\n');
}
/**
 * Webpack's persistent cache (.next/cache) records absolute paths, so a reusable cache needs the same
 * build location every time. Without PAGES_TEST_BUILD_CACHE nothing changes: a fresh random directory.
 * The cache only speeds up compiling; webpack re-hashes every input, so a stale entry is not reused.
 */
export async function buildDirectory(cache){
 if(!cache)return realpath(await mkdtemp(path.join(tmpdir(),'pages-e2e-build-')));
 const fixed=path.join(tmpdir(),'pages-e2e-build-cached');
 await rm(fixed,{recursive:true,force:true});await mkdir(fixed);
 return realpath(fixed);
}
/** Move the cache instead of copying its many small files (copying cost more than the cache saved). */
export async function moveDirectory(from,to){
 await mkdir(path.dirname(to),{recursive:true});
 try{await rename(from,to);}catch(error){
  if(error.code==='ENOENT')return;
  if(error.code!=='EXDEV')throw error;
  await cp(from,to,{recursive:true});await rm(from,{recursive:true,force:true});
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const destination=process.argv[2];if(!destination)throw Error('検査用ビルドの出力先が必要です');
 const artifact=path.resolve(destination);
 const cache=process.env.PAGES_TEST_BUILD_CACHE?path.resolve(process.env.PAGES_TEST_BUILD_CACHE):null;
 await mkdir(artifact); // Refuse stale output, including an incomplete earlier build.
 const temp=await buildDirectory(cache),app=path.join(temp,'app');
 const run=(args,cwd,env)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit'});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('検査用ビルドに失敗しました')));
 });
 try{
  const identity=await testBuildIdentity(root);
  await prepareTestApp(root,app);
  await skipRepeatedTypecheck(app);
  if(cache)await moveDirectory(cache,path.join(app,'.next/cache'));
  await buildTestApp(root,app,appEnvironment({origin:'http://127.0.0.1:3129',secret:randomBytes(32).toString('hex')}),run);
  for(const output of outputs)await cp(path.join(app,output),path.join(artifact,output),{recursive:true,filter:source=>!path.relative(app,source).split(path.sep).includes('cache')});
  await writeFile(path.join(artifact,'manifest.json'),JSON.stringify(identity));
  if(cache){await rm(cache,{recursive:true,force:true});await moveDirectory(path.join(app,'.next/cache'),cache);}
 }finally{await rm(temp,{recursive:true,force:true});}
}
