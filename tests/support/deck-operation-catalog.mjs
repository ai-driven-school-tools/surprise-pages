/** Required user outcomes. A row is covered only by a completed browser case,
 * never by a source-text match or by sending the save request directly. */
export const deckOperations = [
  ['open','navigation',100],['close','navigation',125],['select-slide','navigation',125],['scroll','navigation',125],['zoom','navigation',125],['present','navigation',300],['presenter','navigation',300],
  ['type','elements',125],['composition','elements',125],['paste','elements',125],['select','elements',125],['multi-select','elements',125],['move','elements',200],['resize','elements',200],['align','elements',250],['group','elements',250],['layers','elements',250],['element-menu','elements',250],['text-style','elements',250],
  ['insert','slides',250],['template-library','slides',250],['insert-slide','slides',250],['duplicate','slides',250],['delete','slides',250],['reorder','slides',250],['outline-drag','slides',300],['outline','slides',250],['skip','slides',250],
  ['appearance','design',250],['font','design',250],['document-appearance','design',250],['table','design',250],['chart','design',300],['notes','design',300],['focus','design',250],['logo','design',300],
  ['image-library','media',250],['image-upload','media',250],['image-replace','media',250],['image-crop','media',250],['video-upload','media',250],['video-playback','media',250],['video-convert','media',250],
  ['save','recovery',125],['undo','recovery',250],['redo','recovery',250],['remote','recovery',125],['offline','recovery',125],['draft','recovery',300],
].map(([id,category,responseMs])=>({id,category,responseMs,completionMs:id==='open'?10000:['font','document-appearance','image-upload','image-replace','video-upload','video-convert','remote','offline','draft','save','presenter'].includes(id)?15000:5000}));

/**
 * 速度検査（tests/performance/operations.spec.mjs）は、独立して走る 2 本に分けて測る。1 本で全部測ると約 2 分かかり、
 * 時間の上限の超過で 1 回測り直すと、その 1 台だけで全体 5 分の枠を超えていた。測る操作・回数・上限・資料の規模（300 枚）は変えない。
 * 並びは測る順番。分け目は 2026-10-02 の main の実測（実行 36957148151）で、2 本の所要時間がほぼ同じになる所:
 * 1/2 は開く 3 回（約 21 秒）と、1 枚の中の操作。2/2 は資料の構成・デザイン・素材・復旧で、閉じたあとの保存の確かめもこちら
 * （確かめる相手を作った操作と同じ側に置く）。操作を足すときは、どちらかの並びにも足す（足し忘れは検査が落とす）。
 */
export const DECK_OPERATION_PARTS = Object.freeze({
  '1/2': Object.freeze(['close','open','select-slide','scroll','zoom','select','type','save','undo','redo','composition','paste','appearance','document-appearance','notes','insert','image-library','image-upload','image-crop','resize','move','multi-select','align','group','layers','element-menu','text-style','presenter','present']),
  '2/2': Object.freeze(['duplicate','reorder','outline-drag','outline','skip','delete','table','chart','font','focus','logo','image-replace','video-upload','video-convert','video-playback','offline','draft','remote','template-library','insert-slide']),
});
/** その 1 本が測る操作。知らない指定は全部に倒さず断る。 */
export function deckOperationPart(part) {
  if(!Object.hasOwn(DECK_OPERATION_PARTS,part))throw Error('操作の検査の分割指定が正しくありません: '+part);
  return DECK_OPERATION_PARTS[part];
}

export const operationKinds = {
  text:'type',style:'move',image:'image-replace',insert:'insert',remove:'delete',restore:'undo',
  'video-source':'video-convert',outline:'outline','outline-move':'outline',move:'move','chart-value':'chart','setting-field':'appearance',
  notes:'notes',fragment:'duplicate',order:'reorder',attribute:'skip',setting:'document-appearance',
};

/** `part` を渡すと、その 1 本の担当だけを見る: 担当を全部測っていること、担当でない操作が混ざっていないこと。 */
export function assertDeckCoverage(rows, assert, {categoriesOnly=false,part}={}) {
  const ids=new Set(deckOperations.map(row=>row.id)),required=part===undefined?deckOperations.map(row=>row.id):deckOperationPart(part);
  for(const row of rows) {
    assert.ok(ids.has(row.id),`未登録の操作: ${row.id}`);
    assert.ok(required.includes(row.id),`この分割（${part}）の担当ではない操作: ${row.id}`);
    assert.equal(row.verified,true,`${row.id}: 結果未確認`);
    assert.ok(Number.isFinite(row.durationMs)&&row.durationMs>=0,`${row.id}: 計測なし`);
    assert.ok(row.durationMs<=deckOperations.find(item=>item.id===row.id).completionMs,`${row.id}: 完了時間超過 ${row.durationMs}`);
  }
  const seen=new Set(rows.map(row=>row.id));
  if(categoriesOnly)for(const category of new Set(deckOperations.map(row=>row.category)))assert.ok(deckOperations.some(row=>row.category===category&&seen.has(row.id)),`${category}: 未実行`);
  else for(const id of required)assert.ok(seen.has(id),`${id}: 未実行`);
}

export function responseBudget(id){
 const row=deckOperations.find(operation=>operation.id===id);
 if(!row)throw Error('未登録の操作です: '+id);
 return row.responseMs;
}
