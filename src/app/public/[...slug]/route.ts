import { withCleanCopyLook } from "@/lib/settings/clean-copy-look";
import { withDeferredPosters } from "@/lib/deck/delivery";
import { currentOrganization } from "@/lib/organization/scope";
import { withFastFirstPaint } from "@/lib/first-paint/delivery";
import { firstPaintLocale, withFirstPaintChrome } from "@/lib/first-paint/chrome";
import { imageAssetResponse } from "@/lib/page-images/response";
import { peekPageImage } from "@/lib/page-images/transform";
import { isPersonalEdition } from "@/lib/settings/site-settings";
import { referencedAsset, scriptDeliveryFor, scriptsRestricted } from "@/lib/html/document-security";
import { organizationProfile, shareableOrganizationName } from "@/lib/organization/profile";
import { requestOrigin } from "@/lib/access/request-security";
import {
  splitVersionedAsset,
  withAssetBase,
  withCommentsWidget,
  widgetOrganizationStamp,
  withPageIcon,
  withVendorScripts,
  withoutDeckNotes,
} from "@/lib/pages/content";
import { assetContentType, readAsset } from "@/lib/pages/assets";
import { deckCardImageUrl } from "@/lib/deck/card/card";
import { openPublicAssetPage, openPublicPage } from "@/lib/access/access";
import { pageRefOf, readHtmlOf, type StoredPage } from "@/lib/pages/store";
import type { SlugVisibility } from "@/lib/comments/types";
import {
  htmlResponse,
  ifFresh,
  pageAssetTag,
  pageCacheTag,
  publicCacheControl,
  rememberPageHtml,
} from "@/lib/pages/cache";
import { isVersionSha } from "@/lib/revisions/revisions";
import { publicMetaFor, withOgTags, type PublicPageMeta } from "@/lib/pages/og";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";

/** 切り替えでやめられるページか（呼び名が internal のまま公開になっているもの）。 */
function switchable(shelf: SlugVisibility): boolean {
  return shelf === "internal";
}

function notFound(): Response {
  return new Response(rt("errors.delivery.pageMissing"), {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * 素材をどちらの棚から読むか。
 *
 * **URL の頭ではなく、持ち主のページの呼び名で決める。** 公開に切り替えたページは
 * 呼び名が `internal/…` のままなので、素材も `internal/…` の棚に置いてある。
 * ここを URL の頭（いつも `public`）で決めると、切り替えた瞬間に画像だけが割れる。
 *
 * 台帳の呼び名は必ず `<頭>/<場所>` の形だが、読み取れなかったときに
 * 別の棚へ倒さない（黙って社内の棚を公開の URL から読ませない）。
 */
function shelfOf(page: StoredPage): SlugVisibility | null {
  return pageRefOf(page.pageSlug)?.slugPrefix ?? null;
}

/**
 * 見出しカードの文言を、**読まれたときに初めて**組み立てる。
 *
 * 差し込み側（src/lib/pages/og.ts）は「ページが自分で書いていない札」だけを足す。投稿の道具が
 * 作るページは題名も説明も自分で書いているので、そこは読まれない——先に作ると、
 * 本文を頭から最後まで舐めて要約を切り出す処理が 1 枚ぶん丸ごと無駄になる。
 *
 * 「自分で書いてあるか」の決まりは差し込み側が持っている。ここへ写すと、
 * 片方だけ直したときに静かに食い違うので、**読まれたら作る**形にして判断を任せる
 * （読まれなければ 1 度も走らない）。2 回読まれても組み立ては 1 回だけ。
 */
function lazyPublicMeta(html: string, pageUrl: string, imageUrl: string): PublicPageMeta {
  let made: PublicPageMeta | null = null;
  const meta = (): PublicPageMeta => {
    if (made === null) made = publicMetaFor(html, pageUrl, imageUrl);
    return made;
  };

  return {
    get title() {
      return meta().title;
    },
    get description() {
      return meta().description;
    },
    pageUrl,
    imageUrl,
  };
}

/**
 * 公開ページ。門なしで誰でも開ける（社外共有用）。
 *
 * 門は**「名乗っていない人」として**通す。ここで手形を読まないのは、
 * 応答が人によって変わらないことを守るため——配信網に載せる紙（s-maxage）に、
 * ある人だけに見せてよい中身が焼き付いてはいけない。
 * 通るのは見せ方が公開のページだけで、社内限定も制限つきもここでは断られる。
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string[] }> },
): Promise<Response> {
  return routeLog("/public/[...slug]", request, async () => {
    const organization = await currentOrganization();
    const { slug } = await context.params;

    // 当時の素材（/public/<slug>/@v/<版>/<ファイル>）
    const versioned = splitVersionedAsset(slug);
    if (versioned !== null) {
      const gate = await openPublicPage(organization, versioned.pageSlug);
      if (!gate.ok) return notFound();

      const shelf = shelfOf(gate.page);
      if (shelf === null) return notFound();
      return Response.redirect(new URL(`/history/${shelf}/${slug.join("/")}`, request.url), 302);


    }

    // 拡張子付きはページに紐づく素材（ストレージから）。
    // 配信網に載せて 2 回目以降を速くするが、持たせるのは 1 時間まで。
    // 長く持たせると、消したはずの画像がしばらく見えてしまう。
    if (assetContentType(slug[slug.length - 1]) !== null) {
      // 素材にも本文と同じ判定を通す。持ち主が台帳に無い置き去りの素材は今までどおり返す
      // 控えの下見は門と並べて走らせる（控えを読むだけ。返すのは門を通ってから・閉じたら捨てる）
      const peek = peekPageImage(organization, request);
      const gate = await openPublicAssetPage(organization, slug);
      if (gate === null || !gate.ok) return notFound();

      // 置き去りの素材（持ち主が台帳に無い）は、今までどおり公開の棚から読む
      const shelf = gate === null ? "public" : shelfOf(gate.page);
      if (shelf === null) return notFound();

      if (isPersonalEdition()) {
        const html = await readHtmlOf(gate.page);
        const prefix = pageRefOf(gate.page.pageSlug)?.slug ?? [];
        if (html === null || !referencedAsset(withoutDeckNotes(html), slug.slice(prefix.length).join("/"))) return notFound();
      }
      const cacheControl = publicCacheControl(switchable(shelf), "asset");
      const pageId = gate === null ? null : gate.page.id;

      const response = await imageAssetResponse(organization, request, {
        peek,
        load: () => readAsset(gate.page.organization, shelf, slug, request.signal),
        tags: [pageCacheTag(gate.page.id), pageAssetTag(gate.page.organization, gate.page.pageSlug)],
      }, { cacheControl, pageId });
      return response ?? notFound();
    }

    const here = `/public/${slug.join("/")}`;
    // 組織の設定（仕掛け入りの HTML の扱い、道具箱の札に書く名前）も門と同時に聞き始める（覚えは 60 秒）
    const profile = organizationProfile(organization);
    profile.catch(() => {});
    const scriptMode = profile.then((found) => found.htmlScripts);
    scriptMode.catch(() => {});
    const gate = await openPublicPage(organization, slug);
    if (!gate.ok) return notFound();

    // 本体の控えも、切り替えでやめられるページだけ短くする
    const shelf = shelfOf(gate.page);
    if (shelf === null) return notFound();
    const pageCache = publicCacheControl(switchable(shelf), "page");

    const origin = new URL(request.url).origin;
    const params = new URL(request.url).searchParams;
    const wanted = params.get("v");
    // 比べに来た人には、ウィジェットが「A → B」の帯を出す。同じことを 2 段重ねない

    if (isVersionSha(wanted)) {
      return Response.redirect(new URL(`/history/${shelf}/${slug.join("/")}${new URL(request.url).search}`, request.url), 302);

    }

    const current = gate.page.currentVersionId;
    const mode = await scriptMode;
    // 門なし公開は誰にでも同じ 1 通りの記事なので、札には名前だけを書き、所属の人にだけ配るロゴの行き先は書かない。
    // 配布版は組織の名前（設置した本人の呼び方）も書かない（社外の人にも届く紙・src/lib/organization/profile.ts の shareableOrganizationName）
    const shareable = shareableOrganizationName(await profile);
    const look = shareable === null ? null : { name: shareable, logo: null };
    const fresh = ifFresh(request, pageCache, gate.page.id, current, "html", scriptsRestricted(mode), widgetOrganizationStamp(look));
    if (fresh !== null) return fresh;

    const stored =
      current === null
        ? null
        : await rememberPageHtml(gate.page.id, current, () => readHtmlOf(gate.page));
    if (stored === null || current === null) return notFound();

    // 差し込むのは読み込みタグと見出しカードの指定だけで、誰が見ても同じ中身。
    // コメント本体はブラウザから別途取りに行くので、配信網に載せたままでよい。
    // スライドの発表者のメモ（aside）だけは**取り除く**——門なし公開はただの記事で、
    // 誰に対しても同じ 1 通りしか配れないので、見る人が会社の人かで分けない
    // 清書は、開いたときにいまの清書の見た目で出す（字は変えない・src/lib/settings/clean-copy-look.ts）
    // OGP の URL は開いた宛先のまま
    const sharedOrigin = requestOrigin(request);
    // 見出しカードの宛先は**引き当てたページの呼び名**で渡す。URL から組み直すと、
    // 公開に切り替えたページ（呼び名は internal のまま）のカードだけが引けなくなる。
    // 版の目印を添えて、直したあとに古い絵が配信網と Slack に残らないようにする（src/lib/deck/card/card.ts）
    const cardUrl = deckCardImageUrl(sharedOrigin, gate.page.pageSlug, gate.page.currentVersionId, null);
    const html = withCleanCopyLook(withDeferredPosters(withoutDeckNotes(stored)));
    // 目次の写しも先に描く（src/lib/first-paint/chrome.ts）。公開の紙は誰にでも同じ 1 通りを配網に控えさせるので、
    // 写しの字は既定の言語で書く（ほかの言語の人には、道具箱が届いた時点で目次の見出しの字だけが替わる）。
    // 現在地の行は社外の人には出さないので、場所は空けない
    const page = withFirstPaintChrome(await withFastFirstPaint(
      withVendorScripts(
        withCommentsWidget(
          withPageIcon(
            withOgTags(
              withAssetBase(html, here),
              "public",
              lazyPublicMeta(html, `${sharedOrigin}${here}`, cardUrl),
            ),
          ),
          gate.page.pageSlug,
          look,
        ),
      ),
      { pageId: gate.page.id, versionId: current },
    ), { url: request.url, locationBar: false, locale: firstPaintLocale(null) });

    return htmlResponse(page, {
      cacheControl: pageCache,
      pageId: gate.page.id,
      etag: current,
      origin,
      scripts: scriptDeliveryFor(mode, stored, requestOrigin(request)),
      organization: widgetOrganizationStamp(look),
    });
  });
}

/** HEAD shares every view gate with GET, but media metadata never opens its body. */
export async function HEAD(request: Request, context: { params: Promise<{ slug: string[] }> }): Promise<Response> {
  return routeLog("/public/[...slug]", request, async () => {
    const response = await GET(request, context);
    await response.body?.cancel();
    return new Response(null, { status: response.status, headers: response.headers });
  });
}
