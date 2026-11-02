/**
 * ワークスペースの「場所」（一覧の画面）の正本。
 *
 * 読むのは 2 か所——サイドバーの目次（`src/app/_components/workspace-shell.tsx`）と、ページを開いたときに
 * 上端に出す現在地の行（`src/widget/reading/location-bar.ts`）。どちらも「この道筋は何という場所か」を
 * ここから引く。片方に書き写すと、名前を変えた日にページの上だけ古い名前が残る。
 *
 * 絵の名前は `src/app/_components/icons.tsx` の語彙。ここは React を知らないので字で持ち、型は使う側で照らす。
 * 名前の字は辞書（`src/lib/i18n/messages/`）にあり、ここは辞書の鍵を持つ。引く関数は使う側が渡す
 * （画面はその人の言語の辞書・道具箱は日本語の辞書）。
 *
 * 起動時はホーム（`/`）。ホームは「続きに戻る」画面で、最近開いたもの・自分あてのコメント・
 * 共有された資料・ほかの人の新しい資料を 1 枚に集める（`src/lib/workspace/home.ts`）。
 * お気に入りと自分の活動は**場所ではあるがサイドバーの項目ではない**——お気に入りは星を付けた
 * 資料の名前がサイドバーに直接並び（その「すべて」が `/favorites`）、自分の活動はホームの
 * 「最近開いたもの」の「すべて見る」から入る。現在地の行が「来た一覧」と読めるように、
 * 場所としては残す（`placeOfPath`）。
 */
import { defaultTranslate } from "../i18n/default";
import type { Translate } from "../i18n/translate";

type PlaceKey = "home" | "mine" | "favorites" | "activity" | "library";

export type WorkspacePlace = {
  readonly href: string;
  /** 名前の辞書の鍵（`workspace.places.<鍵>`）。 */
  readonly key: PlaceKey;
  readonly icon: "home" | "files" | "favorite" | "activity" | "company";
  /** その下の道筋も同じ場所として扱うか。 */
  readonly nested?: true;
};

export const HOME_PLACE = { href: "/", key: "home", icon: "home" } as const satisfies WorkspacePlace;
export const MINE_PLACE = { href: "/mine", key: "mine", icon: "files" } as const satisfies WorkspacePlace;
export const FAVORITES_PLACE = { href: "/favorites", key: "favorites", icon: "favorite" } as const satisfies WorkspacePlace;
export const ACTIVITY_PLACE = { href: "/activity", key: "activity", icon: "activity" } as const satisfies WorkspacePlace;
export const LIBRARY_PLACE = { href: "/library", key: "library", icon: "company" } as const satisfies WorkspacePlace;
/** サイドバーに並ぶ順。 */
export const WORKSPACE_PLACES: readonly WorkspacePlace[] = [
  HOME_PLACE,
  MINE_PLACE,
  LIBRARY_PLACE,
];

/** 場所の全部（現在地の行が「来た一覧」と読むもの）。サイドバーの項目でない場所も含む。 */
const ALL_PLACES: readonly WorkspacePlace[] = [
  ...WORKSPACE_PLACES,
  FAVORITES_PLACE,
  ACTIVITY_PLACE,
];

/**
 * 場所の名前。「みんなの資料」は要求の組織の名前で言う（「見本商事の資料」）。名前は引く関数に決めて渡してあり
 * （画面は外枠・道具箱は配信時の札）、ここは鍵を引くだけ。個人配布版も同じ 1 通りで、組織の名前が設置した本人の名前になる。
 * `organization` を渡すと、その名前で言う（サイドバーが短く切った名前を渡す・`sidebarOrganizationName`）。
 */
export function placeLabel(place: WorkspacePlace, t: Translate = defaultTranslate, organization?: string): string {
  return t(`workspace.places.${place.key}`, organization === undefined ? undefined : { organization });
}

/** サイドバーに並べるときの組織の名前の長さの上限（字数）。超えたら切って省略記号を付ける。現在地の行は切らない。 */
export const SIDEBAR_ORGANIZATION_LIMIT = 12;

/** サイドバー用に短くした組織の名前。字数は書記素（見えている 1 字）で数える。 */
export function sidebarOrganizationName(name: string): string {
  const letters = [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(name)].map((part) => part.segment);
  return letters.length <= SIDEBAR_ORGANIZATION_LIMIT ? name : `${letters.slice(0, SIDEBAR_ORGANIZATION_LIMIT).join("")}…`;
}

/** その道筋が、いまこの場所か。 */
export function isAtPlace(place: WorkspacePlace, pathname: string): boolean {
  return pathname === place.href || (place.nested === true && pathname.startsWith(`${place.href}/`));
}

/** 道筋から場所を引く。場所でない道筋（ページ本体・設定など）は null。 */
export function placeOfPath(pathname: string): WorkspacePlace | null {
  return ALL_PLACES.find((place) => isAtPlace(place, pathname)) ?? null;
}
