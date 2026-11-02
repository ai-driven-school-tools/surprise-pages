/* 生成物。直接編集しない。元のコードは src/widget/*.ts、作り直しは `pnpm build:widget`。 */
import{j as a,k as d}from"./comments-widget-chunk-4VXGFC7P.js";async function s(t){let e=typeof navigator>"u"?void 0:navigator.clipboard;if(e!==void 0)try{return await e.writeText(t),!0}catch{}return o(t)}function o(t){if(typeof document>"u"||typeof document.execCommand!="function")return!1;let e=!1,r=i=>{i.clipboardData!==null&&(i.clipboardData.setData("text/plain",t),i.preventDefault(),i.stopImmediatePropagation(),e=!0)};document.addEventListener("copy",r,!0);try{document.execCommand("copy")}catch{e=!1}finally{document.removeEventListener("copy",r,!0)}return e}var l=`
.deck-studio {
  --studio-header:52px; --studio-left:200px; --studio-right:264px; --studio-footer:36px;
  --studio-control:32px; --studio-gap:8px; --studio-inset:16px;
  font-size:var(--font-md); line-height:1.5; color:var(--text); overflow:hidden;
  -webkit-font-smoothing:antialiased;
}
.deck-studio * { box-sizing:border-box; }
.deck-studio button,.deck-studio input,.deck-studio select,.deck-studio textarea { font:inherit; color:inherit; }
.deck-studio button { cursor:pointer; }
.deck-studio button:disabled { cursor:default; opacity:.32; }
.deck-studio :is(button,input,select,textarea,summary):focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.deck-studio [hidden] { display:none!important; }
.deck-studio .icon { display:inline-flex; flex:none; align-items:center; justify-content:center; width:16px; height:16px; }
.deck-studio .icon svg { display:block; width:16px; height:16px; }
.deck-studio .edit-button,.ds-button {
  display:inline-flex; align-items:center; justify-content:center; gap:6px; flex:none;
  border:0; border-radius:6px; height:var(--studio-control); min-height:var(--studio-control);
  padding:0 10px; background:transparent; white-space:nowrap; font-size:13px; font-weight:500;
  transition:background ${a.quick}ms ${d};
}
.deck-studio .edit-button:hover:not(:disabled),.ds-button:hover:not(:disabled) { background:var(--surface-sunken); }
.deck-studio .edit-button[aria-pressed=true],.ds-button[aria-pressed=true] { background:var(--surface-sunken); color:var(--text); }
.deck-studio .ds-icon-button { width:var(--studio-control); padding:0; }
.ds-primary { transition:none!important; background:var(--text)!important; color:var(--surface)!important; }
.ds-primary:hover:not(:disabled) { opacity:.88; }
.deck-studio .deck-edit-bar {
  flex:0 0 var(--studio-header); height:var(--studio-header); padding:0 var(--studio-inset); gap:4px; flex-wrap:nowrap;
  border-bottom:1px solid var(--border);
}
.deck-studio .edit-title {
  display:flex; align-items:center; gap:8px; min-width:0; max-width:280px; height:32px;
  margin-right:12px; padding:0 4px; border:0; background:transparent; text-align:left;
  font-size:13px; font-weight:600; white-space:nowrap;
}
.deck-studio .edit-title>span:first-child { overflow:hidden; text-overflow:ellipsis; }
.deck-studio .edit-title .icon { color:var(--muted); }
.ds-history-tools { display:flex; gap:0; padding:0 8px; margin-right:4px; border-left:1px solid var(--border); }
.deck-edit-status,.deck-operation-status { display:flex; align-items:center; gap:6px; max-width:220px; overflow:hidden; text-overflow:ellipsis; font-size:12px; white-space:nowrap; color:var(--muted); }
.deck-edit-status[data-state=saved] { min-height:var(--size-control); }
.deck-edit-presence { display:flex; align-items:center; gap:5px; height:32px; margin-right:8px; font-size:12px; color:var(--muted); }
.ds-workspace { display:grid; grid-template-columns:var(--studio-left) minmax(0,1fr) var(--studio-right); flex:1; min-height:0; position:relative; }
.ds-nav { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; background:var(--surface); border-right:1px solid var(--border); }
.ds-nav-header { display:flex; align-items:center; gap:0; flex:0 0 48px; padding:0 10px 0 16px; }
.ds-library-dialog>.dp-library { overflow:auto; }
.ds-nav-title { flex:1; font-size:12px; font-weight:600; white-space:nowrap; }
.ds-slide-list { position:relative; flex:1; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:var(--space-2); padding:8px 12px 16px 8px; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
/* 構造（番号・開閉・字下げ）は左の溝に、内容（絵）は右の列に。溝の幅 24px が字下げ 1 段の単位。 */
.ds-slide {
  position:relative; flex:none; display:grid; grid-template-columns:var(--space-5) minmax(0,1fr); gap:var(--space-2); align-items:start;
  width:100%; margin:0; padding:0; border:0; border-radius:0; background:transparent; text-align:left; touch-action:pan-y;
}
.ds-slide:not([data-outline-child]):not(:first-child) { margin-top:var(--space-2); }
.ds-slide-number { grid-column:1; align-self:stretch; padding-top:6px; font-size:11px; line-height:16px; color:var(--muted); font-variant-numeric:tabular-nums; text-align:right; touch-action:none; }
.ds-thumb, .ds-skip-label { grid-column:2; margin-left:calc(var(--deck-depth,0) * var(--space-5)); }
.ds-thumb { display:block; aspect-ratio:16/9; overflow:hidden; position:relative; min-width:0; background:var(--surface); pointer-events:none; border:1px solid var(--border); border-radius:3px; }
.ds-thumb iframe { width:1280px; height:720px; position:absolute; left:0; top:0; transform-origin:top left; border:0; pointer-events:none; }
.ds-slide:hover .ds-thumb { border-color:var(--muted); }
.ds-slide[aria-selected=true] .ds-thumb { outline:2px solid var(--text); outline-offset:1px; }
.ds-slide[aria-selected=true] .ds-slide-number { color:var(--text); font-weight:600; }
.ds-slide[hidden] { display:none; }
/* 開閉は自分の絵の左下。溝の下端に置き、深さぶんの字下げ空間まで的を広げる。絵の上には置かない。 */
.ds-fold {
  position:absolute; left:0; bottom:0; z-index:1;
  display:inline-flex; align-items:flex-end; justify-content:flex-end;
  box-sizing:border-box; width:calc(var(--space-5) * (1 + var(--deck-depth,0))); height:var(--size-control); padding:0;
  color:var(--muted); cursor:pointer; touch-action:none;
}
.ds-slide:hover .ds-fold, .ds-slide[aria-selected=true] .ds-fold, .ds-fold:focus-visible { color:var(--text); }
.ds-fold:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.ds-fold-count { font-size:var(--font-xs); line-height:16px; font-variant-numeric:tabular-nums; }
/* 閉じた親は、絵の下に重なった紙の縁を 2 枚のぞかせる（overflow:hidden なので影で描く）。 */
.ds-slide[aria-expanded=false] .ds-thumb { box-shadow:0 3px 0 -2px var(--surface), 0 3px 0 -1px var(--border), 0 7px 0 -4px var(--surface), 0 7px 0 -3px var(--border); }
.ds-slide[data-moving] .ds-thumb { opacity:.4; }
.ds-slide-drag-preview { position:fixed; z-index:40; pointer-events:none; padding:var(--space-2) var(--space-3); border-radius:var(--radius-sm); background:var(--text); color:var(--surface); font-size:var(--font-base); max-width:240px; }
/* ドラッグの行き先は継ぎ目に引く 1 本の線。左端の位置が字下げの深さを言う（影も文字札も出さない）。 */
.ds-drop-line { position:absolute; right:12px; z-index:2; height:2px; margin-top:-1px; border-radius:1px; background:var(--accent); pointer-events:none; }
.ds-drop-line::before { content:""; position:absolute; left:-3px; top:-2px; width:6px; height:6px; border-radius:50%; background:var(--accent); }
/* 継ぎ目：行の下の隙間そのもの。触れると線と + が出て、押すとその位置に追加する。選んでいる枚の下の + だけは常に出す。 */
.ds-seam { position:absolute; z-index:1; left:calc(var(--space-5) + var(--space-2) + var(--deck-depth,0) * var(--space-5)); right:0; top:100%; height:var(--space-2); cursor:pointer; touch-action:none; }
.ds-slide[data-seam-wide] .ds-seam { height:var(--space-4); }
.ds-seam::before { content:""; position:absolute; left:0; right:0; top:50%; height:2px; margin-top:-1px; border-radius:1px; background:var(--accent); opacity:0; transition:opacity ${a.quick}ms ${d}; }
.ds-seam-chip { position:absolute; left:50%; top:50%; translate:-50% -50%; display:flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:var(--surface); border:1px solid var(--border); color:var(--muted); opacity:0; transition:opacity ${a.quick}ms ${d}; }
.ds-seam-chip::before { content:""; position:absolute; inset:-6px; }
.ds-seam-chip .icon, .ds-seam-chip .icon svg { width:12px; height:12px; }
.ds-slide[data-current] .ds-seam-chip { opacity:1; }
.ds-slide-list:has([data-moving]) .ds-seam { display:none; }
.ds-seam:hover::before, .ds-seam:focus-visible::before { opacity:1; }
.ds-seam:hover .ds-seam-chip, .ds-seam:focus-visible .ds-seam-chip { opacity:1; color:var(--text); border-color:var(--muted); }
.ds-seam:focus-visible { outline:0; }
.ds-slide[data-skipped] .ds-thumb { opacity:.5; }
.ds-slide[data-skipped] .ds-slide-number { text-decoration:line-through; }
.ds-skip-label { color:var(--muted); font-size:var(--font-sm); }
.ds-stage { position:relative; display:flex; flex-direction:column; min-width:0; min-height:0; background:var(--surface-sunken); }
.deck-studio .edit-frame { flex:1; min-height:0; background:var(--surface-sunken); }
.ds-inspector {
  display:flex; flex-direction:column; align-items:stretch; min-width:0; overflow:auto;
  background:var(--surface); border-left:1px solid var(--border); padding:14px var(--studio-inset) 16px;
  scrollbar-width:thin; scrollbar-color:var(--border) transparent;
}
.ds-inspector h2 { flex:none; font-size:12px; line-height:20px; font-weight:600; margin:0 0 20px; }
.ds-inspector h3 { font-size:12px; line-height:16px; font-weight:500; margin:0 0 12px; color:var(--muted); }
.ds-property-row {
  display:flex; align-items:center; gap:8px; flex:none; width:100%; min-height:36px;
  margin:0; padding:4px 0; border:0; background:transparent; text-align:left; border-radius:4px;
}
.ds-property-row:hover { background:var(--surface-sunken); }
.ds-property-label { flex:1; font-size:12px; color:var(--muted); }
.ds-property-value { font-size:12px; color:var(--text); }
.ds-property-row>.icon { width:12px; color:var(--muted); }
.ds-property-row>.icon svg { width:12px; height:12px; }
.ds-property-swatch { width:24px; height:24px; border:1px solid var(--border); border-radius:4px; }
.ds-section { margin:0 0 24px; padding:0; flex:none; }
.ds-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ds-row>.ds-field { flex:1; min-width:72px; }
.ds-field { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; font-size:12px; color:var(--muted); }
.ds-field input,.ds-field select,.ds-field textarea {
  width:100%; height:32px; min-height:32px; border:1px solid var(--border); border-radius:6px;
  padding:0 8px; background:var(--surface); font-size:13px; color:var(--text);
}
.ds-field textarea { padding:8px; min-height:96px; resize:vertical; line-height:1.6; }
.ds-field input[type=number] { font-variant-numeric:tabular-nums; }
.ds-color-field { flex-direction:row; align-items:center; justify-content:space-between; min-height:32px; }
.ds-field input[type=color] { padding:3px; width:32px; height:32px; min-height:32px; border-radius:5px; }
.ds-field input[type=color]::-webkit-color-swatch-wrapper { padding:3px; }
.ds-field input[type=color]::-webkit-color-swatch { border:0; border-radius:2px; }
.ds-field input[type=color]::-moz-color-swatch { border:0; border-radius:2px; }
.ds-field input[type=range] { border:0; padding:0; accent-color:var(--text); }
.ds-segment { display:flex; align-items:center; gap:2px; padding:2px; width:max-content; background:var(--surface-sunken); border-radius:6px; }
.ds-segment .ds-button { height:28px; min-height:28px; width:38px; background:transparent; color:var(--muted); }
.ds-segment .deck-studio .edit-button[aria-pressed=true],.ds-button[aria-pressed=true] { background:var(--surface); color:var(--text); box-shadow:0 1px 3px color-mix(in srgb,var(--text) 9%,transparent); }
.ds-placement { border-top:1px solid var(--border); padding-top:16px; }
.ds-placement summary { cursor:pointer; font-size:12px; font-weight:500; color:var(--muted); list-style:none; display:flex; align-items:center; justify-content:space-between; min-height:24px; }
.ds-placement summary::-webkit-details-marker { display:none; }
.ds-placement summary::after { content:'›'; font-size:16px; line-height:1; }
.ds-placement[open] summary { margin-bottom:12px; }
.ds-placement[open] summary::after { transform:rotate(90deg); }
.ds-selection-actions { display:flex; align-items:center; gap:4px; padding-top:12px; margin-top:auto; border-top:1px solid var(--border); }
.ds-footer { display:flex; align-items:center; gap:4px; flex:0 0 var(--studio-footer); height:var(--studio-footer); padding:0 12px; border-top:1px solid var(--border); font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums; }
.ds-footer .ds-button { font-size:12px; min-height:28px; height:28px; }
.ds-footer>span:first-child { min-width:48px; }
.ds-spacer { flex:1; min-width:4px; }
.ds-note { font-size:12px; color:var(--muted); line-height:1.6; margin:12px 0; }
.ds-notes { padding:12px 16px; border-top:1px solid var(--border); background:var(--surface); max-height:200px; overflow:auto; }
.ds-notes textarea { min-height:80px; }
.ds-empty { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:16px; pointer-events:none; }
.ds-empty button { pointer-events:auto; }
.ds-menu { position:fixed; z-index:30; width:204px; padding:5px; border:1px solid var(--border); border-radius:8px; background:var(--surface); box-shadow:0 8px 24px color-mix(in srgb,var(--text) 12%,transparent); }
.ds-menu-item { display:flex; align-items:center; gap:10px; width:100%; min-height:34px; padding:0 8px; border:0; border-radius:4px; background:transparent; text-align:left; font-size:13px!important; }
.ds-menu-item:hover,.ds-menu-item:focus-visible { background:var(--surface-sunken); }
.ds-menu-item kbd { margin-left:auto; font:11px ui-sans-serif,system-ui; color:var(--muted); }
.ds-menu-item.ds-danger { margin-top:4px; border-top:1px solid var(--border); border-radius:0 0 4px 4px; color:var(--danger); }
.ds-tooltip { position:fixed; z-index:40; max-width:240px; padding:5px 8px; background:var(--text); color:var(--surface); border-radius:5px; font-size:11px; line-height:1.5; pointer-events:none; box-shadow:0 2px 8px color-mix(in srgb,var(--text) 12%,transparent); }
.ds-dialog-backdrop { position:absolute; inset:0; z-index:20; background:color-mix(in srgb,var(--text) 25%,transparent); display:grid; place-items:center; padding:24px; }
.ds-dialog { position:relative; width:min(100%,880px); max-height:100%; overflow:auto; background:var(--surface); border-radius:10px; padding:24px; box-shadow:0 16px 64px color-mix(in srgb,var(--text) 15%,transparent); }
.ds-dialog h2 { margin:0 0 20px; font-size:16px; font-weight:600; }
.ds-dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:20px; }
.ds-library-dialog { width:min(100%,1120px); display:flex; flex-direction:column; overflow:hidden; }
.ds-library-dialog>h2,.ds-library-dialog>.ds-note,.ds-library-dialog>.ds-dialog-actions { flex-shrink:0; }
.ds-layout-card:focus-visible { outline:2px solid var(--text); outline-offset:4px; }
.ds-layout-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; }
.ds-layout-card { padding:0; border:0; border-radius:5px; background:transparent; text-align:left; min-width:0; }
.ds-layout-card .ds-thumb { border:1px solid var(--border); }
.ds-layout-card:hover .ds-thumb { outline:2px solid var(--text); outline-offset:2px; }
.ds-layout-card strong { display:block; margin:8px 0 0; font-size:12px; font-weight:500; }
.ds-layout-card small { display:none; }
.ds-data-scroll { max-height:360px; overflow:auto; }
.ds-data-table { border-collapse:collapse; width:100%; table-layout:fixed; }
.ds-data-table td { padding:0; border:1px solid var(--border); }
.ds-data-table input { width:100%; border:0; padding:10px; min-width:80px; background:var(--surface); }
.ds-error { color:var(--danger); font-size:12px; }
.ds-mobile { display:none; }
.ds-design-tabs { padding-bottom:16px; margin-bottom:16px; border-bottom:1px solid var(--border); }
.ds-preset-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-bottom:20px; }
.ds-preset { border:0; border-radius:4px; padding:0; text-align:left; background:transparent; font-size:12px!important; }
.ds-preset:hover .ds-swatch { outline:1px solid var(--text); outline-offset:2px; }
.ds-swatch { position:relative; isolation:isolate; overflow:hidden; display:flex; align-items:center; justify-content:center; height:64px; border:1px solid var(--border); border-radius:4px; font-size:22px; margin-bottom:6px; }
.ds-swatch-art { position:absolute; inset:0; z-index:-1; border-radius:inherit; }.ds-swatch-copy { position:relative; }
.ds-preset[aria-pressed=true] .ds-swatch { outline:2px solid var(--text); outline-offset:2px; }
.ds-insert-dialog { width:min(100%,400px); }
.ds-insert-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
.ds-insert-card { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; min-height:76px; padding:12px; border:1px solid var(--border); border-radius:6px; background:transparent; font-size:12px!important; }
.ds-insert-card:hover { background:var(--surface-sunken); border-color:var(--muted); }
.ds-section[data-section="image"] { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.ds-section[data-section="image"]>.ds-button:first-child,.ds-section[data-section="image"]>.ds-field { grid-column:1 / -1; }
.ds-guide-row { display:grid; grid-template-columns:140px 1fr; gap:16px; align-items:center; padding:12px 0; font-size:13px; border-bottom:1px solid var(--border); }
.ds-guide-row strong { font-weight:500; }.ds-guide-row>span { color:var(--muted); }
.ds-recovery { padding:12px; background:var(--surface-sunken); }
.ds-media-panel {
  grid-column:3; display:flex; flex-direction:column; min-width:0; min-height:0;
  background:var(--surface); border-left:1px solid var(--border); color:var(--text);
}
.deck-studio[data-media-open] .ds-inspector { display:none; }
.deck-studio[data-images-open] .ds-inspector { display:none; }
.deck-studio[data-images-open] .ds-workspace { grid-template-columns:var(--studio-left) minmax(0,1fr) 352px; }
.ds-image-panel { grid-column:3; display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; background:var(--surface); border-left:1px solid var(--border); }
.ds-image-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px 8px; }
.ds-image-header h2 { margin:0; font-size:16px; font-weight:600; }
.ds-image-header>.ds-button { width:32px; padding:0; color:var(--muted); }
.ds-image-tabs { display:flex; gap:4px; margin:0 20px 16px; padding:4px; border-radius:8px; background:var(--surface-sunken); }
.ds-image-tabs .ds-button { flex:1; min-width:0; font-size:13px; color:var(--muted); }
.ds-image-tabs [aria-selected=true] { background:var(--surface); color:var(--text); }
.ds-image-body { flex:1; min-height:0; overflow:hidden; }
.ds-image-body>[role=tabpanel] { height:100%; overflow:auto; padding:0 20px 20px; scrollbar-width:thin; }
.ds-image-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 12px; }
.ds-image-card { min-width:0; }
.ds-image-pick { display:grid; place-items:center; width:100%; aspect-ratio:4/3; border:0; border-radius:8px; padding:0; overflow:hidden; background:var(--surface-sunken); }
.ds-image-pick:hover { outline:2px solid var(--text); outline-offset:2px; }
.ds-image-pick img { display:block; width:100%; height:100%; object-fit:contain; }
.ds-image-caption { display:flex; flex-wrap:wrap; gap:2px 8px; margin-top:6px; color:var(--muted); font-size:12px; line-height:1.5; }
.ds-image-caption>:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }
.ds-image-caption a { color:inherit; text-decoration:none; }
.ds-image-caption a:hover { color:var(--text); }
.ds-image-caption>:last-child:not(:first-child) { font-variant-numeric:tabular-nums; }
.ds-image-empty { grid-column:1/-1; display:flex; flex-direction:column; align-items:center; gap:8px; padding:64px 8px; text-align:center; color:var(--muted); }
.ds-image-empty>.icon { width:32px; height:32px; margin-bottom:8px; }
.ds-image-empty>.icon svg { width:32px; height:32px; }
.ds-image-empty strong { font-size:14px; font-weight:500; color:var(--text); }
.ds-image-empty p { margin:0; font-size:12px; line-height:1.6; }
.ds-image-unavailable { font-size:12px; color:var(--muted); }
.ds-image-footer { flex:none; padding:12px 20px 16px; border-top:1px solid var(--border); }
.ds-image-transfers { max-height:160px; overflow:auto; }
.ds-image-transfer { display:flex; flex-wrap:wrap; align-items:center; gap:4px; padding:0 0 8px; font-size:12px; line-height:1.5; }
.ds-image-transfer p { flex:1; min-width:0; margin:0; }
.ds-image-transfer[data-state=failed] p { flex-basis:100%; }
.ds-image-transfer a { color:var(--muted); margin:0 8px; text-decoration:none; }
.ds-image-transfer .ds-button { font-size:12px; }
.ds-image-actions { display:flex; gap:8px; }
.ds-image-actions .ds-button { flex:1; height:40px; background:var(--surface-sunken); font-size:13px; }
.ds-image-rights { margin:10px 0 0; font-size:12px; line-height:1.5; color:var(--muted); }
.ds-image-skeleton { aspect-ratio:4/3; border-radius:8px; background:var(--surface-sunken); }
.ds-media-header { display:flex; align-items:center; justify-content:space-between; padding:var(--space-3) var(--space-4); gap:var(--space-2); }
.ds-media-header h2 { margin:0; font-size:var(--font-lg); font-weight:600; outline:none; }
.ds-media-header button,.ds-media-item-header button { width:var(--studio-control); padding:0; flex:none; color:var(--muted); }
.ds-media-overview { margin:0; padding:0 var(--space-4) var(--space-4); font-size:var(--font-sm); color:var(--muted); }
.ds-media-body { flex:1; min-height:0; overflow:auto; padding:var(--space-2) var(--space-4) var(--space-5); }
.ds-media-section { margin:0 0 var(--space-6); }
.ds-media-section h3 { margin:0 0 var(--space-4); font-size:var(--font-md); font-weight:600; }
.ds-media-item { min-width:0; margin:0 0 var(--space-6); font-size:var(--font-base); color:var(--text); }
.ds-media-item:last-child { margin-bottom:0; }
.ds-media-item-header { display:flex; align-items:center; gap:var(--space-2); min-width:0; margin-bottom:var(--space-2); }
.ds-media-item-header>.icon { flex:none; color:var(--muted); }
.ds-media-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:var(--font-base); font-weight:500; }
.ds-media-item-status { margin:0; font-size:var(--font-sm); color:var(--muted); overflow-wrap:anywhere; }
.ds-media-item[data-state=failed] .ds-media-item-status { font-size:var(--font-base); color:var(--text); }
.ds-media-explanation { margin:var(--space-2) 0 0; font-size:var(--font-sm); line-height:1.65; color:var(--muted); overflow-wrap:anywhere; }
.ds-media-actions { display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-2); margin-top:var(--space-3); }
.ds-media-actions:empty { display:none; }
.ds-media-actions .ds-primary { max-width:100%; }
.deck-studio .ds-media-quiet { color:var(--muted); }
.ds-media-action-error { margin:var(--space-2) 0 0; font-size:var(--font-sm); color:var(--text); }
.ds-media-action-error:empty { display:none; }
.ds-media-completed { color:var(--muted); font-size:var(--font-sm); }
.ds-media-completed summary { cursor:pointer; padding:var(--space-2) 0; }
.ds-media-completed[open]>div { padding-top:var(--space-4); }
.ds-media-empty { margin:var(--space-4) 0; font-size:var(--font-base); color:var(--muted); line-height:1.65; }
.ds-footer .ds-media-trigger { display:inline-flex; align-items:center; gap:var(--space-1); min-height:var(--studio-control); padding:0 var(--space-2); color:var(--text); font-size:var(--font-sm); white-space:nowrap; }
.ds-media-trigger[aria-expanded=true] { font-weight:600; }
.ds-media-count { font-variant-numeric:tabular-nums; }
.ds-media-short-status { color:var(--muted); }
.ds-media-dot { width:var(--size-dot); height:var(--size-dot); border-radius:50%; background:var(--danger); flex:none; }
.deck-studio[data-media-open] .ds-media-dot { display:none; }
.ds-media-announcement { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
@media(max-width:1023px) and (min-width:641px) {
  .deck-studio[data-images-open] .ds-workspace { grid-template-columns:minmax(0,1fr) 320px; }
  .ds-image-panel { grid-column:2; }
  .deck-studio[data-media-open] .ds-workspace { grid-template-columns:minmax(0,1fr) var(--studio-right); }
  .ds-media-panel { grid-column:2; }
}
@media(max-width:640px) {
  .deck-studio[data-images-open] .ds-workspace { grid-template-columns:minmax(0,1fr); }
  .deck-studio[data-images-open] .ds-image-panel { position:absolute; z-index:18; left:0; right:0; bottom:0; grid-column:auto; height:min(65%,520px); border-left:0; border-top:1px solid var(--border); border-radius:16px 16px 0 0; box-shadow:0 -12px 32px color-mix(in srgb,var(--text) 8%,transparent); }
  .ds-image-header,.ds-image-footer { padding:12px 16px; }
  .ds-image-tabs { margin:0 16px 12px; }
  .ds-image-tabs .ds-button,.ds-image-actions .ds-button { min-height:44px; }
  .ds-image-body>[role=tabpanel] { padding:0 16px 16px; }
  .ds-image-empty { padding:24px 8px; }
  .deck-studio[data-media-open] .ds-stage,.deck-studio[data-media-open] .ds-nav { display:none; }
  .ds-media-panel { grid-column:1; border-left:0; }
  .ds-media-short-status { display:none; }
  .deck-studio[data-media-open] .ds-footer>:not(.ds-media-trigger):not(.ds-spacer) { display:none; }
}
@media(max-width:1199px) { .deck-studio{--studio-left:184px;--studio-right:248px}.deck-studio .edit-title{max-width:180px} }
@media(max-width:1023px) {
  .ds-workspace{grid-template-columns:minmax(0,1fr)}
  .ds-nav,.ds-inspector{display:none;position:absolute;top:0;bottom:0;width:264px;z-index:3}
  .ds-nav{left:0}.ds-inspector{right:0}
  .deck-studio[data-panel=slides] .ds-nav{display:flex}.deck-studio[data-panel=inspector] .ds-inspector{display:flex}
  .ds-mobile{display:inline-flex}.deck-studio .deck-edit-bar{padding:0 8px}.deck-studio .edit-title{max-width:140px;margin-right:0}
  .ds-layout-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:640px) {
  .deck-studio .deck-edit-bar{height:auto;min-height:52px;flex-wrap:wrap;padding:6px 8px}
  .ds-history-tools{padding:0 4px;margin-right:0}.deck-edit-presence{display:none}
  .deck-edit-status,.deck-operation-status{max-width:120px}.ds-dialog-backdrop{padding:8px}.ds-dialog{padding:16px}
  .ds-footer{flex-wrap:wrap;height:auto;min-height:36px}.ds-guide-row{grid-template-columns:1fr;gap:4px}
}
@media(prefers-reduced-motion:reduce){.deck-studio button{transition:none}}
`;export{s as a,l as b};
