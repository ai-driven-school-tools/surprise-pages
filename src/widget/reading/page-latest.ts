import type { PageVersion } from "../../lib/comments/types";
import { loadLatestVersion } from "../shared/api";
import { t } from "../shared/i18n";
import { LatestBar, type LatestNotice } from "./latest-bar";
import { carryPlace } from "./position";
import { clockTime, fullTime, relativeTime } from "../shared/util";

/**
 * 清書を開いている間に「新しい版ができた」ことに気づかせる（上端の 1 行・latest-bar.ts）。
 *
 * **自分では聞きに行かない。** いつ聞くかはコメントの一覧の読み直し（src/widget/comments/live.ts）ただ 1 つが決める——
 * 見えていて・操作があって・編集中でない間だけ数秒ごとに読み直し、その答えに「いまの版の目印」が入っている
 * （`/api/comments` の currentVersion）。道具箱はその答えをここへ渡すだけ（`observe`）。
 * なので定期の問い合わせは 1 本も増えず、放置したタブで保存先（Neon Free）を起こし続けることもない。
 * 目印が開いたときと違っていたときだけ、誰がいつ更新したかを 1 度だけ聞く（`/api/history?latest=1`。門は版の一覧と同じ）。
 *
 * 入れ替えるのは人がボタンを押したときだけ（読んでいる位置が勝手に飛ばないように）。押したら、読んでいた
 * 段落を控えてから読み込み直し、新しい版でも同じ段落の位置へ戻す（控えと戻しは position.ts。戻すのは道具箱の立ち上げ）。
 * 送っていないコメントがあれば、同じ帯のボタンが 1 度だけ問いに変わる（読み込み直すと消えるので）。
 */

/** 「○分前」を進める間（聞きに行かない。字を書き直すだけ）。 */
const TICK_MS = 30 * 1000;

/** 読めない答え（ログインが切れた・見られなくなった・無くなった）。聞き直さない。 */
function gone(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

export type PageLatestHost = {
  slug: string;
  /** 本文が出している版。開いたときに決まり、押して読み込み直すまで変わらない。 */
  shownVersion: string;
  /** 読み込み直すと消えてしまう書きかけ（送っていないコメント）があるか。 */
  unsent: () => boolean;
};

/** 新しい版の 1 行を組む。名前が無ければ「更新」だけ。 */
export function pageNotice(version: Pick<PageVersion, "authorName" | "committedAt">, onAction: () => void, now: Date = new Date()): LatestNotice {
  const time = clockTime(version.committedAt, now);
  const ago = relativeTime(version.committedAt);
  const name = version.authorName.trim();
  const detail = time.length === 0 ? null
    : name.length > 0 ? t("toolbox.latest.pageDetailNamed", { time, name, ago })
    : t("toolbox.latest.pageDetail", { time, ago });
  return {
    text: t("toolbox.latest.pageNewer"),
    detail,
    title: time.length === 0 ? null : fullTime(version.committedAt),
    action: t("toolbox.latest.reload"),
    onAction,
  };
}

export class PageLatest {
  private readonly bar = new LatestBar();
  private disposed = false;
  private stopped = false;
  private newer: PageVersion | null = null;
  /** 聞きに行った目印。同じ目印で 2 度聞かない。 */
  private asked: string | null = null;
  private asking = false;
  /** 送っていないコメントがあると告げて、もう 1 度押すのを待っている。 */
  private confirming = false;
  private tickTimer: number | null = null;

  constructor(private readonly host: PageLatestHost) {}

  /** コメントの一覧を読み直した答えの「いまの版」。開いたときと違えば、誰がいつ更新したかを聞いて帯を出す。 */
  observe(currentVersion: string | null): void {
    if (this.disposed || this.stopped || this.asking || this.newer !== null) return;
    if (currentVersion === null || currentVersion === this.host.shownVersion || currentVersion === this.asked) return;
    void this.ask(currentVersion);
  }

  dispose(): void {
    this.disposed = true;
    this.stopTick();
    this.bar.hide();
  }

  private async ask(version: string): Promise<void> {
    this.asking = true;
    this.asked = version;
    const result = await loadLatestVersion(this.host.slug);
    this.asking = false;
    if (this.disposed) return;
    if (!result.ok) {
      if (gone(result.status)) this.stopped = true;
      // 聞けなかったら、次の読み直しの答えでもう 1 度聞く（知らせを出し間違えるより、出し遅れるほうがよい）
      else this.asked = null;
      return;
    }
    if (result.value === null || result.value.sha === this.host.shownVersion) return;
    this.newer = result.value;
    this.paint();
  }

  private paint(): void {
    if (this.disposed || this.newer === null) return;
    const notice = pageNotice(this.newer, () => this.reload());
    if (this.confirming) {
      this.bar.show({ ...notice, detail: t("toolbox.latest.unsent"), title: null });
    } else {
      this.bar.show(notice);
    }
    this.startTick();
  }

  private reload(): void {
    if (this.host.unsent() && !this.confirming) {
      // 書きかけのコメントは読み込み直すと戻せない。同じ帯のボタンの並びを問いに変え、もう 1 度押したら読み込み直す
      this.confirming = true;
      this.paint();
      return;
    }
    carryPlace();
    // 直しかけ（ページの編集）があれば、ブラウザがいつもの「このサイトを離れますか」を出す
    window.location.reload();
  }

  private startTick(): void {
    if (this.tickTimer !== null) return;
    this.tickTimer = window.setTimeout(() => {
      this.tickTimer = null;
      // 見えていない間は字を書き直さない（戻ってきた次の読み直しで進む）
      if (document.visibilityState === "visible") this.paint();
      else this.startTick();
    }, TICK_MS);
  }

  private stopTick(): void {
    if (this.tickTimer === null) return;
    window.clearTimeout(this.tickTimer);
    this.tickTimer = null;
  }
}
