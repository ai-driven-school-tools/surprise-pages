/** Package the same authored examples used by the review library for the editor. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { sampleScene } from '../generate/deck-catalog/sample-scenes.mjs';
import { CATALOG_CHAPTERS } from '../generate/deck-catalog/chapters.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export async function buildDeckLibrary() {
  const dir = await mkdtemp(join(tmpdir(), 'deck-library-'));
  try {
    const examples = new Map();
    const assets = join(dir, 'assets');
    for (const script of ['assets.mjs', 'editorial-assets.mjs'])
      execFileSync(process.execPath, [join(root, 'scripts/generate/deck-catalog', script), assets], {cwd:root, stdio:'pipe'});
    function inlineArtwork(raw, doc) {
      const dom = new JSDOM(raw, {contentType:'image/svg+xml'});
      const svg = dom.window.document.documentElement;
      // Inline artwork must not introduce shared ids, global CSS, expensive filters,
      // editable screenshot text, or external resources into the authored slide.
      svg.querySelectorAll('style,defs').forEach(node=>node.remove());
      for (const node of [svg,...svg.querySelectorAll('*')]) {
        node.removeAttribute('id'); node.removeAttribute('filter');
        for (const attribute of [...node.attributes]) if (attribute.value.startsWith('url('))
          node.setAttribute(attribute.name, attribute.value.includes('wash')?'#e5ece3':'#fafbf6');
      }
      svg.setAttribute('style','display:block;width:100%;height:100%;pointer-events:none;font-family:Arial,"Hiragino Sans",sans-serif');
      svg.setAttribute('preserveAspectRatio','xMidYMid meet');
      svg.setAttribute('aria-hidden','true'); svg.removeAttribute('role'); svg.removeAttribute('aria-label');
      const imported=doc.importNode(svg,true);dom.window.close();return imported;
    }
    let basicImage = '';
    for (const [script, args] of [
      ['deck-format-catalog.mjs', ['--output']],
      ['message-image-compositions.mjs', []],
      ['editorial-compositions.mjs', []],
      ['process-compositions.mjs', []],
    ]) {
      const path = join(dir, script + '.html');
      execFileSync(process.execPath, [join(root, 'scripts/generate', script), ...args, path], { cwd: root, stdio: 'pipe' });
      const dom = new JSDOM(await readFile(path, 'utf8'));
      const doc = dom.window.document;
      const focus = JSON.parse(doc.querySelector('[data-deck-focus]').textContent);
      for (const slide of doc.querySelectorAll('section[data-deck-slide]')) {
        const id = slide.getAttribute('data-deck-id');
        if (!id || examples.has(id)) throw Error('Duplicate example: ' + id);
        // Self-contained authored examples; never reference another page’s private assets.
        for (const media of slide.querySelectorAll('img,video,audio')) {
          const kind = media.tagName === 'IMG' ? 'image' : media.tagName.toLowerCase();
          const label = {image:'画像を追加',video:'動画を追加',audio:'音声を配置する欄'}[kind];
          const slot = doc.createElement('div');
          for (const attr of media.attributes) {
            if (['class','style','data-dd-element-id'].includes(attr.name)) slot.setAttribute(attr.name, attr.value);
          }
          slot.setAttribute('data-deck-media-slot', kind);
          slot.setAttribute('data-deck-media-style',media.getAttribute('style')??'');
          slot.setAttribute('role', 'img');
          slot.setAttribute('aria-label', label);
          slot.style.cssText += ';display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:0;min-width:0;background:var(--dd-surface);color:var(--dd-muted);font-size:24px;';
          if(kind==='audio') slot.style.height='54px';
          if(kind==='video') slot.style.cssText+=';width:auto;max-width:100%;aspect-ratio:16/9;justify-self:center;';
          slot.textContent = label;
          if (kind === 'image') {
            const src = media.getAttribute('src');
            let svg, description;
            if (src === 'assets/composition-office.jpg') {
              const scene=sampleScene(id);svg=scene.svg;description=scene.label;
            } else {
              if (!/^assets\/[a-z-]+\.svg$/.test(src??'')) throw Error('Missing safe sample artwork: '+src);
              svg=await readFile(join(dir,src),'utf8');description=media.getAttribute('alt')??'サンプル画像';
            }
            const artwork=inlineArtwork(svg,doc);
            if (src === 'assets/composition-office.jpg') artwork.setAttribute('preserveAspectRatio','xMidYMid slice');
            slot.replaceChildren(artwork);
            slot.setAttribute('data-deck-sample-image','');
            slot.setAttribute('aria-label',description+'。サンプル画像');
            slot.style.overflow='hidden';
            if(id==='image-one') basicImage=slot.outerHTML;
          }
          media.replaceWith(slot);
        }
        // Cross-example links cannot resolve in a document containing only this slide.
        for (const link of slide.querySelectorAll('[data-dd-slide-link]')) {
          const text = doc.createElement('span');
          text.textContent = link.textContent;
          link.replaceWith(text);
        }
        if(['title','divider','editorial-cover-left','editorial-cover-editorial','editorial-divider-center','editorial-divider-number'].includes(id))slide.setAttribute('data-dd-logo-safe','top-right');
        // School's horizontal lockup fits the reserved footer band; full-bleed
        // photos retain their own uninterrupted composition. Other brands keep
        // the existing explicitly reviewed placement list.
        if(!['composition-photo-bleed','composition-photo-panel','composition-photo-rail'].includes(id))
          slide.setAttribute('data-dd-logo-safe', [slide.getAttribute('data-dd-logo-safe'), 'school-bottom-right'].filter(Boolean).join(' '));
        if(['title','editorial-cover-left','editorial-cover-center','editorial-cover-editorial','editorial-cover-window','editorial-cover-horizon','composition-wide-margin'].includes(id)) {
          slide.setAttribute('data-deck-brand-layout','cover');
          slide.setAttribute('data-dd-logo-safe',slide.getAttribute('data-dd-logo-safe')+' school-cover');
        }
        slide.setAttribute('data-deck-template', id);
        examples.set(id, {html:slide.outerHTML, focus:focus.slides[id]});
      }
      dom.window.close();
    }
    const templates = CATALOG_CHAPTERS.flatMap(group => group.slides.map(([id, name]) => {
      const sample = examples.get(id);
      if (!sample) throw Error('Missing example: ' + id);
      examples.delete(id);
      return {id, name, category:group.id, ...sample};
    }));
    if (examples.size || templates.length !== 94) throw Error('The complete 94-example library is required');
    const diagram = await readFile(join(root,'src/templates/mermaid.html'),'utf8');
    const diagramKit = diagram.slice(diagram.indexOf('<script',diagram.indexOf('-->')+3),diagram.lastIndexOf('</script>')+9);
    return {diagramKit, basicImage, categories:CATALOG_CHAPTERS.map(({id,name,description})=>({id,name,description})), templates,
      previewKit:await readFile(join(root,'src/templates/deck-design.html'),'utf8')};
  } finally { await rm(dir, {recursive:true,force:true}); }
}
const data = JSON.stringify(await buildDeckLibrary(), null, 2) + '\n';
const target = join(root, 'src/lib/deck/design/library.generated.json');
if (process.argv.includes('--check')) {
  if (await readFile(target,'utf8') !== data) throw Error('Rebuild the editor template library');
} else await writeFile(target,data);
