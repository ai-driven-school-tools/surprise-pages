/**
 * 部品の脆弱性の検査の判断。通信はしない。
 *
 * 赤にするのは「この PR が持ち込んだ」指摘だけ。いまある指摘や、部品を変えていないのに今日公表された指摘では
 * 赤にしない——関係の無い全員の PR が止まるため（そちらは更新の提案が PR で届ける）。
 * 持ち込んだかどうかは、取り込み先と PR の両方を同じ時刻に調べて、PR の側にだけある
 * 「部品の名前・版・指摘の番号」の組で決める。
 */

/** 深刻度の並び（軽い順）。知らない深刻度は一番重い扱いにする（読めないものを軽く読まない）。 */
export const SEVERITIES = ["info", "low", "moderate", "high", "critical"];

/**
 * ここから上を持ち込んだ PR は赤。
 * 2026-10-01 の実測で、いまある指摘は 重大 1・高 14・中 17・低 7。中より下は開発用の道具の
 * 「止まりうる」が大半で、赤にすると更新のたびに止まる。中と低は警告で見せる。
 */
export const BLOCKING_FROM = "high";

/** 固定ファイルの置き場。 */
export const LOCKFILES = [
  { directory: ".", name: "本体" },
];

const rank = (severity) => {
  const index = SEVERITIES.indexOf(severity);
  return index === -1 ? SEVERITIES.length : index;
};

export const blocks = (severity) => rank(severity) >= rank(BLOCKING_FROM);

/** `pnpm audit --json` の出力を、1 行 1 指摘（部品の版ごと）に開く。形が違えば投げる（空の成功にしない）。 */
export function findingsOf(report) {
  if (report === null || typeof report !== "object" || report.advisories === null || typeof report.advisories !== "object") {
    throw new Error("脆弱性の検査の結果が読めません");
  }
  const rows = [];
  for (const advisory of Object.values(report.advisories)) {
    const id = advisory.github_advisory_id || String(advisory.id ?? "");
    if (!id || typeof advisory.module_name !== "string" || !Array.isArray(advisory.findings)) {
      throw new Error("脆弱性の検査の結果が読めません");
    }
    for (const finding of advisory.findings) {
      rows.push({
        key: `${advisory.module_name}@${finding.version}#${id}`,
        module: advisory.module_name,
        version: finding.version,
        severity: advisory.severity,
        id,
        title: advisory.title ?? "",
        patched: advisory.patched_versions ?? "",
        path: finding.paths?.[0] ?? "",
      });
    }
  }
  return rows.sort((a, b) => rank(b.severity) - rank(a.severity) || a.key.localeCompare(b.key));
}

/** PR の側にだけある指摘。 */
export function introduced(head, base) {
  const known = new Set(base.map((row) => row.key));
  return head.filter((row) => !known.has(row.key));
}

/** 持ち込んだ指摘を、赤にするものと警告にとどめるものに分ける。 */
export function verdict(rows) {
  return { blocking: rows.filter((row) => blocks(row.severity)), warnings: rows.filter((row) => !blocks(row.severity)) };
}

export function countBySeverity(rows) {
  return Object.fromEntries([...SEVERITIES].reverse().map((severity) => [severity, rows.filter((row) => row.severity === severity).length]));
}

export const describe = (row) =>
  `${row.severity} ${row.module}@${row.version} ${row.id} ${row.title}（直った版: ${row.patched || "なし"}・経路: ${row.path}）`;
