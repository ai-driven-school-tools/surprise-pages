/** Export the fictional UI sequence and explicitly synthetic interview. No production service is used. */
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import{pathToFileURL}from'node:url';import{execFileSync}from'node:child_process';
if (!process.argv[2]) throw new Error('出力先を指定してください: node '+process.argv[1]+' <Git管理外のassetsディレクトリ>');
const out=resolve(process.argv[2]);
const tmp=await mkdtemp(join(tmpdir(),'aster-note-media-'));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const frames=['capture','saved','organize','share','shared'];
for(const [index,name]of frames.entries()){await page.goto(pathToFileURL(join(out,`screen-${name}.svg`)).href);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(tmp,`frame-${String(index).padStart(2,'0')}.png`)});}
await browser.close();
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','1/3','-i',join(tmp,'frame-%02d.png'),'-vf','fps=24,format=yuv420p','-c:v','libx264','-profile:v','baseline','-level','4.0','-movflags','+faststart','-t','15',join(out,'workflow.mp4')]);
execFileSync('say',['-v','Kyoko','-r','180','-f',resolve(out,'../testimonial.txt'),'-o',join(tmp,'testimonial.aiff')]);
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',join(tmp,'testimonial.aiff'),'-ac','1','-ar','44100','-c:a','libmp3lame','-b:a','128k',join(out,'testimonial.mp3')]);
await writeFile(join(out,'workflow-ja.vtt'),'WEBVTT\n\n00:00.000 --> 00:03.000\n1. 一文を残す。分類はあとでよい。\n\n00:03.000 --> 00:06.000\n2. 保存すると、自分用の記録になる。\n\n00:06.000 --> 00:09.000\n3. 必要になったら分類を付ける。\n\n00:09.000 --> 00:12.000\n4. 共有先と権限を確認する。\n\n00:12.000 --> 00:15.000\n5. 必要な2人に共有された。\n');
const audioSeconds=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',join(out,'testimonial.mp3')],{encoding:'utf8'}).trim());
await writeFile(resolve(out,'../media-manifest.json'),JSON.stringify({video:{file:'assets/workflow.mp4',seconds:15,description:'架空UIによる、入力→保存→整理→共有先確認→共有完了の操作イメージ',captions:'assets/workflow-ja.vtt',silent:true},audio:{file:'assets/testimonial.mp3',seconds:audioSeconds,synthetic:true,voice:'macOS Kyoko',transcript:await readFile(resolve(out,'../testimonial.txt'),'utf8')}},null,2));
await rm(tmp,{recursive:true,force:true});console.log(`Video 15s / synthetic interview ${audioSeconds.toFixed(1)}s → ${out}`);
