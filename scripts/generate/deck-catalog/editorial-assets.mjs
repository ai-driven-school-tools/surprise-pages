/** Small, text-free concept illustrations; captions remain editable slide HTML. */
import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
if(!process.argv[2])throw Error('Specify an assets directory outside Git');
const out=resolve(process.argv[2]);await mkdir(out,{recursive:true});
const paper=(x,y,w,h)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="url(#paper)" stroke="#fff" stroke-width="2"/>`;
const lines=(x,y,w)=>`<path d="M${x} ${y}h${w}m-${w} 28h${w*.7}" fill="none" stroke="#8da697" stroke-width="10" stroke-linecap="round"/>`;
const pieces={
 capture:`${paper(128,64,300,276)}<rect x="164" y="96" width="72" height="12" rx="6" fill="#22634d"/>${lines(164,158,192)}${lines(164,240,148)}<g transform="translate(454 94) rotate(27)"><rect width="32" height="190" rx="6" fill="#22634d"/><path d="m0 190 16 32 16-32" fill="#14251e"/><rect y="22" width="32" height="12" fill="#a9c9b7"/></g>`,
 organize:`${paper(72,116,184,224)}${paper(236,84,184,224)}${paper(400,52,168,224)}<rect x="96" y="140" width="72" height="28" rx="8" fill="#d7bf8d"/><rect x="260" y="108" width="72" height="28" rx="8" fill="#9cc4ad"/><rect x="424" y="76" width="72" height="28" rx="8" fill="#a6bacb"/>${lines(96,212,116)}${lines(260,180,116)}${lines(424,148,112)}`,
 share:`<path d="M320 184V284M320 230H120v54M320 230h200v54" fill="none" stroke="#8da697" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>${paper(236,44,168,150)}${lines(264,94,112)}${[120,320,520].map(x=>`<circle cx="${x}" cy="302" r="32" fill="#22634d"/><path d="M${x-52} 378a52 52 0 0 1 104 0" fill="#9cc4ad"/>`).join('')}`,
};
const depth='<defs><linearGradient id="paper" x2=".7" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#f6f7f2"/></linearGradient><radialGradient id="wash" cx=".15" cy=".1" r="1"><stop stop-color="#fcfbf6"/><stop offset="1" stop-color="#d7e6da"/></radialGradient><filter id="depth" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#314b3d" flood-opacity=".13"/></filter></defs>';
for(const[id,body]of Object.entries(pieces))await writeFile(`${out}/concept-${id}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">${depth}<rect width="640" height="400" fill="url(#wash)"/><g filter="url(#depth)">${body}</g></svg>\n`);
