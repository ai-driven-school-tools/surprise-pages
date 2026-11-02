// Transport-only local VM adapter. The actual conversion program and workflow execute unchanged.
import {mkdtemp,writeFile,readFile,mkdir,readdir,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const sandboxes=new Map();
export async function start(_fn,args){(globalThis.__deckMediaStarts??=[]).push(args);return {runId:randomUUID()};}
export async function sleep(){await new Promise(resolve=>setTimeout(resolve,20));}
export function getWorkflowMetadata(){return {workflowRunId:globalThis.__deckWorkflowRunId??'local-workflow'};}
export class Sandbox{
 static async getOrCreate({name}){if(!sandboxes.has(name))sandboxes.set(name,new Sandbox(name,await mkdtemp(join(tmpdir(),'deck-media-vm-'))));return sandboxes.get(name);}
 static async get({name}){if(!sandboxes.has(name))throw Error('Missing sandbox');return sandboxes.get(name);}
 constructor(name,directory){this.name=name;this.directory=directory;this.commands=new Map();}
 path(path){return join(this.directory,path.replace(/^\//,''));}
 async writeFiles(files){for(const file of files){const path=this.path(file.path);await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true});await writeFile(path,file.content);}}
 async runCommand(cmd,args=[],opts={}){
  if(typeof cmd==='object'){opts=cmd;args=cmd.args;cmd=cmd.cmd;}
  if(cmd==='npm')return {exitCode:0};
  if(cmd==='rm'){await rm(this.path(args.at(-1)),{recursive:true,force:true});return {exitCode:0};}
  if(cmd==='mkdir'){await mkdir(this.path(args.at(-1)),{recursive:true});return {exitCode:0};}
  if(cmd==='sh'){
   const output=createWriteStream(this.path('/tmp/input'));
   const directory=this.path('/tmp/input-parts');
   for(const file of (await readdir(directory)).sort())for await(const part of createReadStream(join(directory,file)))if(!output.write(part))await once(output,'drain');
   output.end();await new Promise(resolve=>output.on('close',resolve));await rm(directory,{recursive:true});return {exitCode:0};
  }
  const mapped=args.map(value=>value.endsWith('/ffmpeg-static/ffmpeg')?(process.env.TEST_FFMPEG??'/opt/homebrew/bin/ffmpeg'):value.endsWith('/ffprobe')?(process.env.TEST_FFPROBE??'/opt/homebrew/bin/ffprobe'):value.startsWith('/tmp/')?this.path(value):value);
  const child=spawn(cmd==='node'?process.execPath:cmd,mapped,{stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',data=>stderr+=data);
  const result={cmdId:randomUUID(),exitCode:null,stderr:async()=>stderr};this.commands.set(result.cmdId,result);
  child.on('exit',code=>{result.exitCode=code;if(code)console.error('Local conversion:',stderr.slice(0,2000));});
  if(!opts.detached)await new Promise(resolve=>child.on('exit',resolve));return result;
 }
 async getCommand(id){return this.commands.get(id);}
 async readFile({path}){return createReadStream(this.path(path));}
 async readFileToBuffer({path}){return readFile(this.path(path));}
 async stop(){await rm(this.directory,{recursive:true,force:true});sandboxes.delete(this.name);}
}
