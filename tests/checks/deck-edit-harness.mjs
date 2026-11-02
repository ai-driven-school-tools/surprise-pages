import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
import { PGlite } from '@electric-sql/pglite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readdir, readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { root, companyDeployment } from './paths.mjs';

export async function createDeckEditHarness({ migration=true, extra="" }={}) {
  process.env.AUTH_SECRET ??= "local-deck-upload-test-secret-not-for-production";
  const pg=new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for(const file of (await readdir(`${root}/db/migrations`)).sort()){
    // The historical upgrade test intentionally has no session table yet.
    // Its later read/queue migrations and their dependent revisions belong
    // after that upgrade; normal harnesses still apply every migration.
    if(!migration&&['20260924073000_deck_collaboration_read.sql','20260924093000_deck_operation_receipts.sql','20260924111744_deck_shared_save_queue.sql','20260924132757_deck_deleted_save_guard.sql','20260924140005_deck_claim_audience.sql','20260924141219_deck_extend_claim.sql','20260924145619_deck_save_acknowledgement.sql','20260927180000_explicit_service_role_grants.sql','20261008170329_organization_scope.sql','20261008184521_recording_participants_organization.sql','20261009005743_recording_organization.sql','20261009013413_organization_usage_counting.sql','20261011095951_organization_keys_add.sql','20261011095952_organization_keys_shrink.sql'].includes(file))continue;
    if(file.endsWith('.sql') && (migration || !file.includes('deck_edit_sessions')))
      await pg.exec(await readFile(`${root}/db/migrations/${file}`,'utf8'));
  }
  globalThis.__deckPg=pg;
  globalThis.__deckIdentity=new AsyncLocalStorage();
  globalThis.__deckAssets=new Map();
  const temp=await mkdtemp(join(tmpdir(),'deck-edit-api-'));
  const stub=`${root}/tests/checks/fixtures/deck-edit/transport.mjs`;
  await build({stdin:{contents:`${extra} export {POST as workspaceMutation} from './src/app/api/workspace/route'; export * from './src/lib/workspace/workspace'; export * from './src/lib/workspace/model'; export * from './src/lib/pages/catalog'; export {POST as mediaStart,PUT as mediaChunk,PATCH as mediaFinish,DELETE as mediaCancel} from './src/app/api/pages/deck-edit/media/upload/route'; export {POST as mediaImport} from './src/app/api/pages/deck-edit/media/import/route'; export {GET as listThemes,POST as mutateTheme} from './src/app/api/deck-themes/route'; export {GET as themeLogo} from './src/app/api/deck-themes/[id]/logo/[version]/route'; export * from './src/lib/deck/design/theme-source'; export * from './src/lib/deck/design/theme-store'; export * from './src/app/api/pages/deck-edit/route'; export {POST as agent,GET as agentCapabilities} from './src/app/api/pages/agent/route'; export {POST as createDeck} from './src/app/api/pages/deck-edit/create/route'; export {authorSlide,authorChart} from './src/lib/deck/authoring'; export {newDeckDocument} from './src/lib/deck/new-document'; export {POST as upload} from './src/app/api/pages/deck-edit/assets/route'; export {issueVideoLease,readVideoLease} from './src/lib/deck/media/video-lease'; export {sweepVideoUploads} from './src/lib/deck/media/video-storage'; export {GET as readLegacy,PUT as saveLegacy} from './src/app/api/pages/edit/route'; export {withAssetBase,withVendorScripts,withSafeAnchorIds} from './src/lib/pages/content'; export {assetContentType,readAsset,readArchivedAsset,isSafeAssetPath} from './src/lib/pages/assets'; export {commitRevision} from './src/lib/pages/store'; export {prepareDeckEdit,inspectDeckEdit,refineDeckOperations,applyDeckEditOperations,deckSourceSetting} from './src/lib/deck/edit/source';`,resolveDir:root},outfile:`${temp}/api.mjs`,bundle:true,format:'esm',platform:'node',plugins:[companyDeployment,{name:'test-transport',setup(b){
    b.onResolve({filter:/^sharp$/},()=>({path:require.resolve('sharp'),external:true}));
    b.onResolve({filter:/^workflow(?:\/api)?$|^@vercel\/sandbox$/},()=>({path:`${root}/tests/checks/fixtures/deck-edit/media-worker.mjs`}));
    b.onResolve({filter:/supabase$|database$|pages\/cache$|^\.\/cache$|(^|\/)identity$|^@\/auth$|^@vercel\/blob$/},()=>({path:stub}));
  }}]});
  const api=await import(pathToFileURL(`${temp}/api.mjs`).href);
  /** 最初の組織（最初の組織）。移行が既存の行をこの組織へ写す。lib の関数へ直に渡す組織はこれを使う */
  const organization=Object.freeze({id:'00000000-0000-4000-8000-000000000001',assetPrefix:''});
  // 要求の組織（最初の組織）の member の所属つき（名乗りは要求ごとに所属を付ける）
  const owner={kind:'member',email:'owner@example.test',name:'作成者',image:null,organization:{...organization,role:'member'}};
  async function seed(html) {
    return api.commitRevision({organization,pageSlug:'internal/example/design',html,message:'最初の資料',author:owner});
  }
  const as=(viewer,fn)=>globalThis.__deckIdentity.run(viewer,fn);
  return {pg,api,owner,organization,seed,as,close:()=>pg.close()};
}
