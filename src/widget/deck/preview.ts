import { navigationRuntime, designRuntime } from "../../lib/deck/preview.generated";
import compatible from "../../templates/deck-preview-compat.json";
import { withVendorScripts } from "../../lib/html/vendor-scripts";

async function hash(text:string):Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,"0")).join("");
}
type Found={text:string;index:number};
/** 標準の操作部品そのものだけを切り出す。雛形の説明書きが `<!--` を失って本文に
 * はみ出した資料では、説明書き中の「<script>」の字から本物の閉じまでが 1 つに見える。
 * 本物は閉じの直前にある最後の `<script>` から始まるので、そこから先だけを照合に使う
 * （照合は完全一致のままなので、切り出しを誤っても差し替えは起きない）。 */
function stockNavigation(found:Found):Found {
  const at=found.text.lastIndexOf("<script>");
  return at>0?{text:found.text.slice(at),index:found.index+at}:found;
}
/** Only exact, reviewed stock runtime bytes may be upgraded in the preview.
 * Custom scripts and the stored/original HTML are never rewritten. */
export async function upgradeDeckPreview(html:string, navigationOnly=false):Promise<string> {
  const scripts=[...html.matchAll(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>/g)].filter(match=>match[0].startsWith("<script")&&match.index!==undefined).map(match=>({text:match[0],index:match.index??0}));
  const candidate=scripts.find(match=>match.text.startsWith("<script>")&&match.text.includes("var WIDTH = 1280;")&&match.text.includes("data-deck-ready"));
  const design=scripts.find(match=>/^<script\b[^>]*\bdata-deck-design-runtime="3"(?:\s|>)/.test(match.text));
  if(!candidate)return html;
  const navigation=stockNavigation(candidate);
  if(!design){
    if(!navigationOnly)return html;
    const known=navigation.text===navigationRuntime||navigation.text===withVendorScripts(navigationRuntime)||compatible.navigation.includes(await hash(navigation.text));
    return known?html.slice(0,navigation.index)+navigationRuntime+html.slice(navigation.index+navigation.text.length):html;
  }
  const [navHash,designHash]=await Promise.all([hash(navigation.text),hash(design.text)]);
  const currentNavigation=navigation.text===navigationRuntime||navigation.text===withVendorScripts(navigationRuntime);
  const currentDesign=design.text===designRuntime||design.text===withVendorScripts(designRuntime);
  if((!currentNavigation&&!compatible.navigation.includes(navHash))||(!currentDesign&&!compatible.design.includes(designHash)))return html;
  const replacements=[
    {start:navigation.index,length:navigation.text.length,value:navigationRuntime},
    {start:design.index,length:design.text.length,value:designRuntime},
  ].sort((a,b)=>b.start-a.start);
  let upgraded=html;
  for(const replacement of replacements)upgraded=upgraded.slice(0,replacement.start)+replacement.value+upgraded.slice(replacement.start+replacement.length);
  return upgraded;
}
