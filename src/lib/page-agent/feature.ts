/**
 * 手元の AI（bin/pages-agent.mjs）の口が受ける資料の指し方。画面のリンク（/i・/p・/h）と
 * 呼び名のどちらでも受ける。/p は公開の道筋なので呼び名を引き直す。
 * 口を開けるかどうかは src/lib/settings/features.ts の "page-agent" が決める。
 */
export function agentPagePath(path: string): { kind: "public"; segments: string[] } | { kind: "slug"; slug: string } {
  if (path.startsWith("/public/")) return { kind: "public", segments: path.slice("/public/".length).split("/") };
  if (path.startsWith("/internal/")) return { kind: "slug", slug: `internal/${path.slice("/internal/".length)}` };
  const history = /^\/history\/(internal|public)\/(.+)$/.exec(path);
  if (history) return { kind: "slug", slug: `${history[1]}/${history[2]}` };
  return { kind: "slug", slug: path };
}
