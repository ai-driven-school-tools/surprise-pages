/**
 * 体感速度の合格ライン（tests/checks/browser/app-speed.mjs・理由は docs/design/app-speed.md の「合格ライン」）。
 *
 * 数はどれも「押した瞬間（新しいタブなら開き始め）から、その画面の中身が描かれるまで」の ms の中央値。
 *
 *   TARGET … 目標（爆速）。人が「待った」と感じない線。届いているかは毎回表に出す（外れても CI は赤にしない）
 *   GUARD  … CI の歯止め その 1（絶対の線）。「はっきり遅くなった」だけを捕まえる、厳しすぎない線。
 *            直す前の 2.6〜3.1 秒には必ず掛かり、CI の台のばらつきでは掛からない。**緩める方向には動かさない**
 *   RATIO  … CI の歯止め その 2（比例の線）。控え（app-speed-baseline.json・CI の台で測った中央値）の 1.5 倍を超え、
 *            しかも 150ms 以上遅くなったら外れ。絶対の線より手前で、じわじわ遅くなるのを捕まえる。
 *            小さい数（例: 切り替え 50ms）は 1.5 倍でも体感が変わらないので、差の下限で揺れを拾わない。
 *            いまの控えは会社版の CI の台（会社のデータ・HTTP の受け口の保存先）で測った数で、個人版では取り直していない
 *            （この配布版の CI には体感速度の計測が無い。取り直しは tests/support/app-speed-baseline.mjs・docs/design/app-speed.md の「合格ライン」）
 */
export const SCENES = ["home-open", "home-reopen", "library-open", "to-library", "to-home", "open-document", "back-home", "open-deck", "open-gallery"];

export const TARGET = {
  // 新しいタブで開く: 1 秒（人が「待った」と感じ始める境目）。2 回目は部品が手元にあるので 0.7 秒
  "home-open": { shown: 1000 },
  "home-reopen": { shown: 700 },
  "library-open": { shown: 1000 },
  // 画面の中の切り替え: 0.3 秒（押した手応えのまま中身が出る）
  "to-library": { shown: 300 },
  "to-home": { shown: 300 },
  // 資料を開く: 本文 0.5 秒・道具箱 1 秒
  "open-document": { body: 500, toolbox: 1000 },
  // 戻る: 0.3 秒（画面の切り替えと同じ）
  "back-home": { shown: 300 },
  // スライド: 最初の 1 枚 1 秒
  "open-deck": { deck: 1000, toolbox: 1500 },
  // 画像の多い資料（30 枚）を新しいタブで開く: 全部の画像まで 1 秒（新しいタブの目標と同じ）
  "open-gallery": { shown: 1000 },
};

/**
 * CI の歯止め（絶対の線）。CI の台は手元の Mac より遅く、2026-10-08 の CI では資料の道具箱が中央値 877ms（最遅 1090ms）・
 * 戻るが 320ms と、目標の線のすぐそばで揺れていた。目標そのものを歯止めにすると、遅くなっていないのに赤になる。
 * そこで「目標のおよそ 1.5〜2 倍」に置き、細かい後戻りは比例の線（RATIO）に任せる。
 * 直す前（2026-10-08・同じ条件）の 2.6〜3.1 秒は、どの場面でもこの線に掛かる。
 */
export const GUARD = {
  "home-open": { shown: 1500 },
  "home-reopen": { shown: 1200 },
  "library-open": { shown: 1500 },
  "to-library": { shown: 600 },
  "to-home": { shown: 600 },
  "open-document": { body: 800, toolbox: 1800 },
  "back-home": { shown: 750 },
  "open-deck": { deck: 1500, toolbox: 2200 },
  // 画像 1 枚ごとに見てよいかを保存先へ聞いていた頃（2026-10-08・同じ条件）は 1.85 秒。通行証（src/lib/pages/asset-pass.ts）で 0.36 秒
  "open-gallery": { shown: 1200 },
};

/** 比例の線: 控えの何倍まで・何 ms までの差は見逃すか。両方を超えたときだけ外れ。 */
export const RATIO = { times: 1.5, slackMs: 150 };

/**
 * スマホ（`--phone`・幅 390px・4G 相当・処理 4 倍遅い）の目標。画面の中の切り替えは測らない（サイドバーが畳まれている）。
 * 回線の往復が 1 回 165ms あるので、新しいタブは 2 秒（Core Web Vitals の「良い」2.5 秒より速い側）・資料は 1 秒。
 */
export const PHONE_TARGET = {
  "home-open": { shown: 2000 },
  "home-reopen": { shown: 1500 },
  "library-open": { shown: 2000 },
  "open-document": { body: 1000, toolbox: 2000 },
  "back-home": { shown: 1500 },
  "open-deck": { deck: 1500, toolbox: 2500 },
};
/** スマホの CI の歯止め（いまは測るだけ。値が出たら実測にゆとりを足して置く）。 */
export const PHONE_GUARD = PHONE_TARGET;

/**
 * 場面ごと・項目ごとの中央値と最遅。真偽の項目（先読みで開けたか・そのまま戻れたか）は、真だった回数と全体の回数。
 */
export function summarize(samples) {
  const out = {};
  for (const [scene, runs] of Object.entries(samples)) {
    const keys = [...new Set(runs.flatMap((one) => Object.keys(one)))];
    out[scene] = {};
    for (const key of keys) {
      const flags = runs.map((one) => one[key]).filter((value) => typeof value === "boolean");
      if (flags.length > 0) { out[scene][key] = { hits: flags.filter(Boolean).length, total: flags.length }; continue; }
      const values = runs.map((one) => one[key]).filter((value) => typeof value === "number").sort((a, b) => a - b);
      if (values.length === 0) continue;
      out[scene][key] = { median: values[Math.floor(values.length / 2)], worst: values[values.length - 1] };
    }
  }
  return out;
}

/** 表の 1 項目の書き方。 */
export function formatMetric(key, value) {
  return "hits" in value ? `${key} ${value.hits}/${value.total}` : `${key} ${value.median}（最遅 ${value.worst}）`;
}

/** 合格ラインの外れ。測れなかった項目も外れとして数える（欠けを合格にしない）。 */
export function judge(summary, budget = GUARD) {
  const misses = [];
  for (const [scene, limits] of Object.entries(budget)) {
    for (const [key, limit] of Object.entries(limits)) {
      const value = summary[scene]?.[key]?.median;
      if (typeof value !== "number") misses.push(`${scene} の ${key}: 測れていません`);
      else if (value > limit) misses.push(`${scene} の ${key}: 中央値 ${value}ms > ${limit}ms`);
    }
  }
  return misses;
}

/**
 * 比例の線の外れ。比べるのは目標（TARGET）に挙がっている項目だけ（応答の頭・バイト数などの補助の数は比べない）。
 * 控えに無い場面・項目は比べない（新しく足した場面は、控えを取り直すまで絶対の線だけで守る）。
 */
export function judgeRatio(summary, baseline, ratio = RATIO) {
  const misses = [];
  for (const [scene, limits] of Object.entries(TARGET)) {
    for (const key of Object.keys(limits)) {
      const before = baseline?.[scene]?.[key];
      if (typeof before !== "number") continue;
      const value = summary[scene]?.[key]?.median;
      if (typeof value !== "number") { misses.push(`${scene} の ${key}: 測れていません（控え ${before}ms）`); continue; }
      if (value > before * ratio.times && value - before > ratio.slackMs) {
        misses.push(`${scene} の ${key}: 中央値 ${value}ms が控え ${before}ms の ${(value / before).toFixed(1)} 倍（${ratio.times} 倍・+${ratio.slackMs}ms まで）`);
      }
    }
  }
  return misses;
}

/** CI の結果（speed.json の summary）から、比例の線の控えを作る。目標に挙がった項目の中央値だけを残す。 */
export function baselineFrom(summary) {
  const out = {};
  for (const [scene, limits] of Object.entries(TARGET)) {
    for (const key of Object.keys(limits)) {
      const value = summary[scene]?.[key]?.median;
      if (typeof value !== "number") continue;
      out[scene] = { ...out[scene], [key]: value };
    }
  }
  return out;
}
