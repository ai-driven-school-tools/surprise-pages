import {applyDeckEditOperations} from "../../../lib/deck/edit/source";
import type {DeckEditOperation} from "../../../lib/deck/edit/model";
import {deckSourcePreview} from "../../../lib/pages/preview";
import {withVendorScripts} from "../../../lib/html/vendor-scripts";

/** Compact snapshots declare how their preview is derived. Apply received
 * commands once to the canonical source, then use that same delivery contract.
 * Older servers may supply a custom preview; retain their original path. */
export function applyDeckRevisionBatches(
  snapshot:{html:string;previewHtml:string;previewHref?:string|null},
  batches:readonly {operations:readonly DeckEditOperation[]}[],
):{html:string;previewHtml:string}{
  if(snapshot.previewHref!==undefined){const html=applyDeckSourceBatches(snapshot.html,batches);return {html,previewHtml:deckSourcePreview(html,snapshot.previewHref)};}
  let {html,previewHtml}=snapshot;
  for(const batch of batches){
    html=applyDeckEditOperations(html,batch.operations).html;
    previewHtml=withVendorScripts(applyDeckEditOperations(previewHtml,batch.operations).html);
  }
  return {html,previewHtml};
}

/** The source half of a compact delivery. Its preview is derived from the
 * source by the same contract (deckSourcePreview) only when a preview is shown,
 * not for every save reply: that is several copies of the whole document each. */
export function applyDeckSourceBatches(html:string,batches:readonly {operations:readonly DeckEditOperation[]}[]):string{
  for(const batch of batches)html=applyDeckEditOperations(html,batch.operations).html;
  return html;
}
