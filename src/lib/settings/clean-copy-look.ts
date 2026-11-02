/**
 * 清書のページを、開いたときに**いまの清書の見た目**で出す（2026-10-08）。
 *
 * 清書（clean-copy）の変換器は、見た目の指定（Tailwind のクラス）を見出しや段落の 1 つずつに書き込む。
 * ページは保存したあと書き換えない（版は追記専用）ので、スキルで見た目を直しても過去のページには届かず、
 * 作った日ごとに見た目がばらついていた。そこで**字と見た目を分け、見た目は配信のときに付け替える**。
 *
 *   - 本文の要素のクラス … ページの印（`data-clean-copy-look`）から、組んだときの変換表を引き、要素の役目
 *     （段落・見出し・箇条書き…）を逆に引いて、いまの変換表のクラスへ置き換える。印の無い昔のページは、
 *     印を付ける前に配った変換表すべてから引く（同じクラスが別の役目を指すときは、引かずに残す）
 *   - 清書の文字組みと表示形式の指定（`<style data-clean-copy-style>`）… いまのものに置き換える（無ければ足す）
 *   - 額縁（色の名前を決める style と body のクラス）… いまの額縁のものに置き換える
 *
 * **字は 1 文字も変えない。** 触るのはクラスの値と head の style だけなので、コメントの引用の位置（本文の
 * 文字数）・書き出し・索引はそのまま。保管庫の HTML も書き換えない（直す画面・取り寄せは保存されたままを使う）。
 * 知らない印（Pages の写しより新しいスキルで組んだページ）は、古い見た目へ戻さないよう何もしない。
 * 清書の印（`data-clean-copy-document`）の無いページは 1 バイトも変えない。
 *
 * 一式の正本は同梱のスキル（`.claude/skills/clean-copy` の `cleancopy/convert.py` の `look()`）。ここが読むのは、
 * そこから書き出した `clean-copy-look.generated.json` だけで、値を書き写さない。
 */
import { z } from "zod";
import generated from "./clean-copy-look.generated.json";

const tableSchema = z.record(z.string(), z.string());
const stylesSchema = z.record(z.string(), tableSchema);
type Table = z.infer<typeof tableSchema>;
type Styles = z.infer<typeof stylesSchema>;

/** 写しの道具が書き出した一式。形が崩れていたら読み込みの時点で止める（黙って付け替えを外さない）。 */
const look = z.object({
  revision: z.string(),
  current: z.object({
    stamp: z.string(),
    styles: stylesSchema,
    css: z.object({ typography: z.string(), script: z.string(), manuscript: z.string() }),
  }),
  past: z.array(z.object({ commit: z.string(), stamp: z.string().nullable(), styles: stylesSchema })),
  body: z.object({ current: z.string(), past: z.array(z.string()) }),
  frameStyle: z.string(),
}).parse(generated);

/** 変換器が変換表の値に字を足して書く形（`<figure class="<引用の箱> text-center">`）。変換器と同じ字面。 */
const COMPOSED = [" text-center"] as const;
const DOCUMENT_MARK = "data-clean-copy-document";

/** 配信の照合（ETag）と描画前の指定の控えに混ぜる印。写しを上げると変わる。 */
export const CLEAN_COPY_LOOK_STAMP = `${look.current.stamp}${look.revision.slice(0, 7)}`;

function tableOf(styles: Styles, layout: string): Table | undefined {
  return styles[layout] ?? styles.default;
}

/** 元のクラス → いまのクラス。同じ元のクラスが別のクラスへ行き分かれるものは null（触らない）。 */
function reverseMap(sources: readonly Styles[], layout: string): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const current = tableOf(look.current.styles, layout);
  if (current === undefined) return map;
  for (const styles of sources) {
    const table = tableOf(styles, layout);
    if (table === undefined) continue;
    for (const [role, value] of Object.entries(table)) {
      const next = current[role];
      if (next === undefined) continue;
      for (const suffix of ["", ...COMPOSED]) {
        const from = `${value}${suffix}`;
        const to = `${next}${suffix}`;
        const was = map.get(from);
        map.set(from, was === undefined || was === to ? to : null);
      }
    }
  }
  return map;
}

const maps = new Map<string, Map<string, string | null>>();
/** 印ごと・表示形式ごとの対応表。印が無いページは null の鍵で引く。 */
function mapFor(stamp: string | null, layout: string): Map<string, string | null> | null {
  const key = `${stamp ?? ""}:${layout}`;
  const kept = maps.get(key);
  if (kept !== undefined) return kept;
  const sources = look.past.filter((entry) => entry.stamp === stamp).map((entry) => entry.styles);
  if (sources.length === 0) return null;
  const built = reverseMap(sources, layout);
  maps.set(key, built);
  return built;
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s>/])`).exec(tag);
  return match === null ? null : match[1] ?? "";
}

/** 清書の文字組みと表示形式の指定を、いまのものにそろえる（無ければ head の終わりに足す）。 */
function withCurrentStyles(html: string, layout: string): string {
  const wanted: Array<[string, string]> = [["typography", look.current.css.typography]];
  if (layout === "script") wanted.push(["script", look.current.css.script]);
  if (layout === "manuscript") wanted.push(["manuscript", look.current.css.manuscript]);
  let out = html;
  for (const [name, block] of wanted) {
    const pattern = new RegExp(`<style data-clean-copy-style="${name}">[\\s\\S]*?</style>`);
    if (pattern.test(out)) out = out.replace(pattern, () => block);
    else {
      const head = out.search(/<\/head>/i);
      if (head >= 0) out = `${out.slice(0, head)}${block}\n${out.slice(head)}`;
    }
  }
  return out;
}

/** 額縁の見た目（色の名前を決める style・body のクラス）を、いまの額縁にそろえる。 */
function withCurrentFrame(html: string): string {
  const head = html.search(/<\/head>/i);
  let out = html;
  if (head >= 0) {
    const frames = [...html.slice(0, head).matchAll(/<style>[\s\S]*?<\/style>/g)].filter((match) => match[0].includes("--ads-bg:"));
    if (frames.length === 1 && frames[0].index !== undefined && frames[0][0] !== look.frameStyle) {
      const at = frames[0].index;
      out = `${out.slice(0, at)}${look.frameStyle}${out.slice(at + frames[0][0].length)}`;
    }
  }
  return out.replace(/(<body\b[^>]*\bclass=")([^"]*)(")/, (whole: string, open: string, value: string, close: string) =>
    look.body.past.includes(value) ? `${open}${look.body.current}${close}` : whole,
  );
}

/**
 * 清書のページを、いまの清書の見た目で出す。清書でないページ・知らない印のページはそのまま返す。
 * 配信の差し込み（`<base>`・道具箱・描画前の指定）より前に呼ぶ——描画前の指定は、付け替えたあとの
 * クラスから作る必要がある。
 */
export function withCleanCopyLook(html: string): string {
  if (!html.includes(DOCUMENT_MARK)) return html;
  const main = /<main\b[^>]*>/i.exec(html);
  if (main === null || attribute(main[0], DOCUMENT_MARK) === null) return html;
  const stamp = attribute(main[0], "data-clean-copy-look");
  const layout = attribute(main[0], "data-clean-copy-layout") || "default";
  // いまの一式で組んだページは本文のクラスがすでに最新。額縁と指定だけそろえる
  const map = stamp === look.current.stamp ? null : mapFor(stamp, layout);
  if (map === null && stamp !== look.current.stamp) return html; // 知らない印: Pages の写しより新しい
  const start = main.index + main[0].length;
  const end = html.lastIndexOf("</main>");
  if (end < start) return html;
  const body = map === null
    ? html.slice(start, end)
    : html.slice(start, end).replace(/(<[a-zA-Z][^<>]*?\sclass=")([^"]*)(")/g, (whole: string, open: string, value: string, close: string) => {
      const next = map.get(value);
      return next === undefined || next === null ? whole : `${open}${next}${close}`;
    });
  return withCurrentFrame(withCurrentStyles(`${html.slice(0, start)}${body}${html.slice(end)}`, layout));
}
