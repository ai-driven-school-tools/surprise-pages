import { LocalizedError } from "../i18n/errors";
import { defaultTranslate } from "../i18n/default";
import type { MessageKey } from "../i18n/messages/types";
import type { Translate } from "../i18n/translate";

/**
 * 設置の不足。配布版で「サイトは動いているが、設定か保存先が足りない」ときにだけ使う。
 *
 * 画面に出すのは、何が足りないかと導入ガイドのどの章を見るかだけ。設定の値・接続先・
 * 保存先の中身は出さない（本番ではサーバーの例外の文面が画面へ届かないので、画面は
 * 例外ではなく `problem` の種類から文を引く）。章の名前は README.md の見出しと
 * 一致させる（check-distribution.mjs が見る）。手引きが日本語だけなので、章の名前は訳さない。
 *
 * 章が null のものは配布版の導入ガイドに載らない、社内版だけの止まり方。
 */
const SERVE_SETTINGS = "3-9. サイトへ設定を渡し、起動する"; // i18n-keep: 導入ガイド（日本語だけ）の見出しをそのまま指す
const INIT_STORAGE = "3-7. 本文の保管庫を初期化する"; // i18n-keep: 導入ガイド（日本語だけ）の見出しをそのまま指す

export const SETUP_PROBLEMS = {
  missing: { titleKey: "errors.setup.problems.missing", chapter: SERVE_SETTINGS },
  "owner-email": { titleKey: "errors.setup.problems.ownerEmail", chapter: SERVE_SETTINGS },
  "site-url": { titleKey: "errors.setup.problems.siteUrl", chapter: SERVE_SETTINGS },
  "database-url": { titleKey: "errors.setup.problems.databaseUrl", chapter: INIT_STORAGE },
  "database-unreachable": { titleKey: "errors.setup.problems.databaseUnreachable", chapter: INIT_STORAGE },
  "not-initialized": { titleKey: "errors.setup.problems.notInitialized", chapter: INIT_STORAGE },
  "owner-mismatch": { titleKey: "errors.setup.problems.ownerMismatch", chapter: SERVE_SETTINGS },
  /** 本番の配備でないサーバーが本番の保管庫を指している。つなぐ前に止めた。 */
} as const satisfies Record<string, { titleKey: MessageKey; chapter: string | null }>;

export type SetupProblemKind = keyof typeof SETUP_PROBLEMS;
export type SetupProblem = { kind: SetupProblemKind; names?: readonly string[] };

/** 足りないものの題（辞書を引く関数を渡さなければ日本語）。 */
export function setupProblemTitle(kind: SetupProblemKind, t: Translate = defaultTranslate): string {
  return t(SETUP_PROBLEMS[kind].titleKey);
}

export class SetupError extends LocalizedError {
  readonly kind: SetupProblemKind;
  constructor(kind: SetupProblemKind) {
    super(SETUP_PROBLEMS[kind].titleKey);
    this.name = "SetupError";
    this.kind = kind;
  }
}
