/** Reference compositions must not repeat the primary message as a second display headline.
 * This is a structural regression guard; semantic clarity still requires human review. */
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {root} from './paths.mjs';
let failures=0;const ok=(label,value)=>{console.log(`${value?'OK  ':'NG  '} ${label}`);if(!value)failures++;};
function competingHeadlines(doc){return [...doc.querySelectorAll('section[data-deck-slide]')].filter(slide=>slide.querySelectorAll('h1,h2,.dd-display,.dd-statement,.dd-quote').length!==1).map(slide=>slide.getAttribute('data-deck-id'));}
for(const name of ['deck-format-catalog','deck-design-presentation','deck-design-proposal','deck-design-report']){
 const doc=new JSDOM(await readFile(`${root}/tests/checks/fixtures/internal/example/${name}.html`,'utf8')).window.document;
 const bad=competingHeadlines(doc);ok(`${name}: 主張の見出しを二重に置かない${bad.length?' '+bad.join(','):''}`,bad.length===0);
}
const oldProduct=new JSDOM('<section data-deck-slide data-deck-id="product"><h2>記録を判断材料に変える</h2><p class="dd-statement">散らばる気づきを、使える記録へ</p></section>').window.document;
ok('見出しと別の大きなコピーが競合する旧構成を検出',competingHeadlines(oldProduct).join()==='product');
const evidence=new JSDOM('<section data-deck-slide><h2>継続率は目標に届いていない</h2><p class="dd-number">70%</p><p>目標75%</p><blockquote class="dd-support-quote">利用者の証言</blockquote></section>').window.document;
ok('主張を支える数値や小さな引用は残せる',competingHeadlines(evidence).length===0);
if(failures)process.exitCode=1;
