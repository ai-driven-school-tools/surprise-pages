import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export async function buildPageImages(){
 const built=await build({entryPoints:[root+'src/widget/reading/page-images.ts'],bundle:true,minify:true,write:false,format:'iife',target:'es2020'});
 const source=built.outputFiles[0].text;
 await writeFile(root+'src/widget/dist/page-images.js',source);
 await writeFile(root+'src/widget/dist/page-images-stamp.json',JSON.stringify({stamp:createHash('sha256').update(source).digest('hex').slice(0,12)},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await buildPageImages();
