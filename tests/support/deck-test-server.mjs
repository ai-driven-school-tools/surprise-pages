import {spawn} from 'node:child_process';
import {constants,setPriority} from 'node:os';
import {testEnvironment,localTestUrl} from './environment.mjs';

/** The helper server (in-memory PostgreSQL, HTML checks, video conversion) is not
 * what the speed checks measure, yet it burns ~13s of CPU per run in bursts at each
 * save. On a two-core CI machine those bursts compete with the browser at random
 * moments. Lower its priority (inherited by its ffmpeg children) so it mostly uses
 * time the browser leaves idle. */
export function yieldToBrowser(child) {
  try { setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL); }
  catch (error) { console.warn(`補助サーバーの優先度を下げられませんでした: ${error.message}`); }
}

export async function startDeckTestServer(sample) {
  const server=spawn(process.execPath,['scripts/dev/preview-deck-editor.mjs'],{env:testEnvironment({PORT:'0',DECK_EDIT_SAMPLE:sample,DECK_TEST_MEDIA_WORKFLOW:'1',TEST_FFMPEG:process.env.TEST_FFMPEG??(process.platform==='darwin'?'/opt/homebrew/bin/ffmpeg':'/usr/bin/ffmpeg'),TEST_FFPROBE:process.env.TEST_FFPROBE??(process.platform==='darwin'?'/opt/homebrew/bin/ffprobe':'/usr/bin/ffprobe')}),stdio:['ignore','pipe','pipe']});
  yieldToBrowser(server);
  let logs='';server.stderr.on('data',data=>logs+=data);
  try {
    const url=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error(logs||'検査画面の準備が時間切れです')),30000);
      server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(localTestUrl(match[0]).href);}});
      server.once('error',error=>{clearTimeout(timeout);reject(error);});
      server.once('exit',()=>{clearTimeout(timeout);reject(Error(logs||'検査画面が終了しました'));});
    });
    return {url,async close(){if(server.exitCode===null){const ended=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await ended;}}};
  } catch(error){server.kill();throw error;}
}
