import { withCleanCopyLook } from "@/lib/settings/clean-copy-look";
import { currentOrganization, type OrganizationScope } from "@/lib/organization/scope";
import { imageAssetResponse } from "@/lib/page-images/response";
import { peekPageImage } from "@/lib/page-images/transform";
import { isPersonalEdition } from "../settings/site-settings";
import type { SlugVisibility } from "../comments/types";
import {
  splitVersionedAsset,
  withAssetBase,
  withCommentsWidget,
  widgetOrganizationStamp,
  withPageIcon,
  withVendorScripts,
  withVersionBanner,
  VERSION_MARK,
} from "@/lib/pages/content";
import { assetContentType, readArchivedAsset, readAsset } from "@/lib/pages/assets";
import { currentIdentity, currentSessionPerson, isMember, type Member } from "@/lib/identity/identity";
import { hasPendingRequest, openAssetPage, openToolsPage as openPage, type PageGate } from "@/lib/access/access";
import { noAccessResponse } from "@/lib/access/no-access";
import { readHtmlOf, readVersionNumberOf } from "@/lib/pages/store";
import {
  RESTRICTED_PAGE_CACHE,
  htmlResponse,
  ifFresh,
  cacheControlForDeckMedia,
  internalCacheControl,
  pageAssetTag,
  pageCacheTag,
  rememberPageHtml,
} from "@/lib/pages/cache";
import { isVersionSha, readFileAt } from "@/lib/revisions/revisions";
import { isVersionId } from "@/lib/revisions/version-id";
import { withOgTags } from "@/lib/pages/og";
import { withFastFirstPaint } from "@/lib/first-paint/delivery";
import { firstPaintLocale, withFirstPaintChrome } from "@/lib/first-paint/chrome";
import { scriptDeliveryFor, scriptsRestricted } from "@/lib/html/document-security";
import { organizationProfile, shareableOrganizationName } from "@/lib/organization/profile";
import { widgetOrganizationOf } from "@/lib/organization/look";
import { requestOrigin } from "@/lib/access/request-security";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { requestLocale, requestTranslate, rt } from "@/lib/i18n/request";
import { lockedCardPath, signInGateResponse } from "@/lib/access/signin-gate";
import { assetPassCookie, assetPassOf, isLeafPage, withAssetPass, type AssetPass } from "@/lib/pages/asset-pass";


function notFound(): Response {
  return new Response(rt("errors.delivery.pageMissing"), {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * 素材（画像・動画）を指す URL か。ページ本体か素材かで、断り方を変えるために使う。
 *
 * 見分け方をここで**発明しない**。下の 2 つの分岐がそれぞれ使っている見分け方
 * （当時の写しなら `splitVersionedAsset`、いまのファイルなら `assetContentType`）を
 * そのまま組み合わせる。写して書くと、拡張子を 1 つ足した日に片方だけが知らないままになる。
 */
function isAssetPath(slug: readonly string[]): boolean {
  return splitVersionedAsset(slug) !== null || assetContentType(slug[slug.length - 1]) !== null;
}

/** 素材を断るときは絵ではなく短い文で返す（画像の中に説明を描いても読めない）。 */
function assetForbidden(): Response {
  return new Response(rt("errors.delivery.pageForbidden"), {
    status: 403,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": RESTRICTED_PAGE_CACHE,
    },
  });
}

/**
 * 断られたときの行き先。
 *
 * 名乗っていない人はここへ来ない（手前で門の紙を返している）。
 * 残るのは「名簿に無い（403 と、見せてほしいの導線）」と「無い（404）」の 2 つ。
 */
async function refusePage(gate: PageGate, viewer: Member): Promise<Response> {
  if (gate.ok || gate.reason !== "restricted" || gate.page === null) return notFound();
  return noAccessResponse({ requested: await hasPendingRequest(gate.page.organization, gate.page.id, viewer.email) });
}

/**
 * 通行証で素材を配る。効かない（持ち主のページが違う・素材でない）ときは null（呼ぶ側は今までどおり門を通す）。
 * 通行証が言うのは「門がこのページを通した」ことだけ。過去の版の素材は、持ち主のページそのものの通行証でだけ配る。
 */
async function assetByPass(organization: OrganizationScope, request: Request, shelf: SlugVisibility, slug: readonly string[], pass: AssetPass): Promise<Response | null> {
  const versioned = splitVersionedAsset(slug);
  if (versioned !== null) {
    const owner = `${shelf}/${versioned.pageSlug.join("/")}`;
    if (pass.page !== owner) return null;
    const response = await imageAssetResponse(organization, request, {
      peek: peekPageImage(organization, request),
      load: () => readArchivedAsset(organization, shelf, versioned.pageSlug, versioned.sha, versioned.rel, request.signal),
      tags: [pageCacheTag(pass.pid), pageAssetTag(organization, owner)],
    }, { cacheControl: cacheControlForDeckMedia(slug, internalCacheControl(pass.restricted, "asset")), pageId: null });
    return response ?? notFound();
  }
  if (assetContentType(slug[slug.length - 1]) === null) return null;
  const response = await imageAssetResponse(organization, request, {
    load: () => readAsset(organization, shelf, slug, request.signal),
    tags: [pageCacheTag(pass.pid), pageAssetTag(organization, pass.page)],
  }, { cacheControl: cacheControlForDeckMedia(slug, internalCacheControl(pass.restricted, "asset")), pageId: null });
  return response ?? notFound();
}

/** 社内ページ。門を通った人だけに、ページ本体も画像も返す。 */
export async function servePrivatePage(
  request: Request,
  context: { params: Promise<{ slug: string[]; shelf?: SlugVisibility }> },
): Promise<Response> {
  // 社内ページの入口（src/app/internal・src/app/history が呼ぶ）。組織はここで 1 度だけ決めて下へ渡す
  const [{ slug, shelf = "internal" }, organization] = await Promise.all([context.params, currentOrganization()]);
  const route = new URL(request.url).pathname.startsWith("/history/") ? `/history/${shelf}` : "/internal";

  /*
   * 素材は、ページを開いたときの通行証があれば、名乗りの所属を引かずに配る。所属は要求ごとに名簿を引くので、
   * 画像が数十枚ある資料で 1 枚ごとに引くと保存先が混み合う。通行証は「10 分以内にこの人の門をこのページが通した」印で、
   * 本文の見せ方を変えたときと同じく、所属を外した人も最長 10 分は同じページの画像だけを読める（本文・ほかのページは次の要求から閉じる）。
   */
  if (route === "/internal" && isAssetPath(slug)) {
    const person = await currentSessionPerson();
    const pass = person === null ? null : assetPassOf(organization, request, person, `${shelf}/${slug.join("/")}`);
    const served = pass === null ? null : await assetByPass(organization, request, shelf, slug, pass);
    if (served !== null) return served;
  }

  const viewer = await currentIdentity();
  /*
   * ログインしているが、宛先の組織に所属の無い人（外した人・招かれていない外の人）には、ページがあることも
   * 教えない（無いのと同じ 404）。門の紙（ログインの案内）を返すと、ログイン済みなのに同じページへ戻る行き止まりの輪になる。
   * ここも保存先を 1 度も引かないので、在るページと無いページの区別は出ない。
   */
  if (viewer !== null && viewer.kind === "outsider") return notFound();

  if (!isMember(viewer)) {
    const asked = new URL(request.url);
    // 版の指定（?v= や ?from=）ごと持って帰る。比べに来た人が、
    // ログインしたあとに「ただのページ」へ着地しないように。
    // 制限つきかどうかは、名乗っていない人には教えない（行き先も文言も社内ページと同じ）
    const target = `${route}/${slug.join("/")}${asked.search}`;

    /*
     * 素材（画像・動画）はログインへ送る。ここは絵が入る場所なので、
     * HTML の紙を返しても読める形にならない（`<img>` の中で門の説明はできない）。
     */
    if (isAssetPath(slug)) {
      const signInUrl = new URL(`/signin?next=${encodeURIComponent(target)}`, request.url);
      return Response.redirect(signInUrl, 302);
    }

    /*
     * ページ本体は**同じ URL のまま**門の紙を返す。302 でログイン画面へ送ると、
     * 共有カードを作る相手（Slack など）が読むのはログイン画面になり、
     * どの社内ページを貼っても同じ札が出てしまう（src/lib/access/signin-gate.ts）。
     *
     * ここは保管庫を 1 度も引かない。だから在るページと無いページの区別も、
     * 制限つきかどうかも、今までどおり名乗っていない人には出ない。
     */
    // 札は要求の組織の名前で言う。組織の台帳だけを引き（60 秒覚える）、ページの保管庫は引かない
    // 名乗っていない人の紙なので、配布版では組織の名前（設置した本人の呼び方）を出さない
    const organizationName = await organizationProfile(organization).then(shareableOrganizationName, () => null);
    return signInGateResponse({
      next: target,
      cardUrl: new URL(lockedCardPath(organizationName), request.url).toString(),
      organization: organizationName,
    });
  }

  /*
   * 画像の通行証（src/lib/pages/asset-pass.ts）。ページ本体を返すときに「このページの素材を 10 分読んでよい」を cookie で渡し、
   * 素材はそれを確かめるだけで配る（1 枚ごとに保存先を引かない）。社内の入口でブラウザのログインのときだけ。
   * 通行証が言うのは「門がこのページを通した」ことだけで、ページが違えば効かない。効かなければ今までどおり門を通す。
   * 個人配布版も同じ。通行証を作るのは本文の門（openPage・招待の名簿も見る）が通したあとなので、通行証は
   * 素材ごとに openPage を通すのと同じ答えの控えになる（招待を外した人が画像だけを最長 10 分読めるのも会社の版と同じ）。
   */
  const passes = route === "/internal";

  // 当時の素材（/internal/<slug>/@v/<版>/<ファイル>）。写しが無ければ今の素材で代える。
  // 素材にも**本文とまったく同じ判定**を通す。ここを抜くと、制限つきのページの
  // 画像だけが URL を知っている人に読めてしまう
  const versioned = splitVersionedAsset(slug);
  if (versioned !== null) {
    const owner = `${shelf}/${versioned.pageSlug.join("/")}`;
    // 通行証は持ち主のページそのもののときだけ効く（その下の別のページの写しには効かない）
    const held = passes ? assetPassOf(organization, request, viewer, `${shelf}/${slug.join("/")}`) : null;
    const pass = held !== null && held.page === owner ? held : null;
    // 控えの下見は門と並べて走らせる（控えを読むだけ。返すのは門を通ってから・閉じたら捨てる）
    const peek = peekPageImage(organization, request);
    let restricted: boolean;
    let pageId: string;
    if (pass !== null) {
      restricted = pass.restricted;
      pageId = pass.pid;
    } else {
      const gate = await openPage(organization, viewer, owner);
      if (!gate.ok) return gate.reason === "restricted" ? assetForbidden() : notFound();
      restricted = (isPersonalEdition() || gate.page.visibility === "restricted");
      pageId = gate.page.id;
    }
    const cacheControl = cacheControlForDeckMedia(slug, internalCacheControl(restricted, "asset"));

    const response = await imageAssetResponse(organization, request, {
      peek,
      load: () => readArchivedAsset(organization, shelf, versioned.pageSlug, versioned.sha, versioned.rel, request.signal),
      tags: [pageCacheTag(pageId), pageAssetTag(organization, owner)],
    }, { cacheControl, pageId: null });
    return response ?? notFound();
  }

  // 拡張子付きはページに紐づく素材（ストレージから）
  if (assetContentType(slug[slug.length - 1]) !== null) {
    // 通行証のページの下の素材なら、門が通した答えで配る（下に別のページを持つページには通行証を出していない）
    const pass = passes ? assetPassOf(organization, request, viewer, `${shelf}/${slug.join("/")}`) : null;
    if (pass !== null) {
      const response = await imageAssetResponse(organization, request, {
        load: () => readAsset(organization, shelf, slug, request.signal),
        tags: [pageCacheTag(pass.pid), pageAssetTag(organization, pass.page)],
      }, { cacheControl: cacheControlForDeckMedia(slug, internalCacheControl(pass.restricted, "asset")), pageId: null });
      return response ?? notFound();
    }

    // 持ち主のページが台帳に無い置き去りの素材は、今までどおり会社の人に返す
    // （守るべきページが存在しない。ここで 404 にすると古い素材が黙って割れる）
    // 控えの下見は門と並べて走らせる（控えを読むだけ。返すのは門を通ってから・閉じたら捨てる）
    const peek = peekPageImage(organization, request);
    const gate = await openAssetPage(organization, viewer, shelf, slug);
    if (gate === null) return notFound();
    if (gate.ok && isPersonalEdition() && !(await openPage(organization, viewer, gate.page.pageSlug)).ok) return assetForbidden();
    if (!gate.ok) {
      return gate.reason === "restricted" ? assetForbidden() : notFound();
    }

    const restricted = gate !== null && (isPersonalEdition() || gate.page.visibility === "restricted");
    const cacheControl = cacheControlForDeckMedia(slug, internalCacheControl(restricted, "asset"));

    const response = await imageAssetResponse(organization, request, {
      peek,
      load: () => readAsset(gate.page.organization, shelf, slug, request.signal),
      tags: [pageCacheTag(gate.page.id), pageAssetTag(gate.page.organization, gate.page.pageSlug)],
    }, { cacheControl, pageId: null });
    return response ?? notFound();
  }

  const here = `${route}/${slug.join("/")}`;
  const pageSlug = `${shelf}/${slug.join("/")}`;
  // 素材の通行証を出してよい形か（下に別のページが無いか）を、門と同時に聞き始める（答えはサーバーの中に覚える）
  const leaf = passes ? isLeafPage(organization, pageSlug) : null;
  // 組織の設定（仕掛け入りの HTML の扱い、道具箱の札に書く名前とロゴ）も門と同時に聞き始める
  // （覚えは 60 秒・照合の札と実行制限と札に使う）
  const profile = organizationProfile(organization);
  profile.catch(() => {});
  const scriptMode = profile.then((found) => found.htmlScripts);
  scriptMode.catch(() => {});
  const gate = await openPage(organization, viewer, pageSlug);
  if (!gate.ok) return refusePage(gate, viewer);

  const restricted = (isPersonalEdition() || gate.page.visibility === "restricted");
  const pageCache = internalCacheControl(restricted, "page");
  // 素材の通行証は、門がこのページを通したここでだけ作る
  const passing = leaf === null ? Promise.resolve(null) : assetPassCookie(request, viewer, gate.page, restricted, leaf);
  const params = new URL(request.url).searchParams;
  const wanted = params.get("v");
  // 比べに来た人には、ウィジェットが「A → B」の帯を出す。同じことを 2 段重ねない
  const comparing = isVersionSha(params.get("from"));

  // 過去の版を見に来た場合だけ、保管庫から当時の本文を取り出す
  if (isVersionSha(wanted)) {
    /*
     * 過去の版の帯は見ている人の言語で書くので、照合の印も言語で分ける（言語を変えた人に、前の言語の帯を
     * 304 で出し続けない）。日本語は今までと同じ印のまま。
     */
    const locale = requestLocale();
    const pastEtag = isVersionId(wanted) ? (locale === DEFAULT_LOCALE ? wanted : `${wanted}-${locale}`) : null;
    const mode = await scriptMode;
    const look = widgetOrganizationOf(await profile);
    const fresh = pastEtag === null ? null : ifFresh(request, pageCache, null, pastEtag, "html", scriptsRestricted(mode), widgetOrganizationStamp(look));
    if (fresh !== null) return withAssetPass(fresh, await passing);

    // 帯に出す「何版目か」は本文と別に引く（本文は控えから出ることが多い）。往復は並べて 1 回ぶん
    const [past, number, pass] = await Promise.all([
      rememberPageHtml(gate.page.id, wanted, () => readFileAt(gate.page, wanted)),
      comparing ? null : readVersionNumberOf(gate.page, wanted),
      passing,
    ]);
    if (past === null) return notFound();

    const shown = withPageIcon(
      withOgTags(withAssetBase(withCleanCopyLook(past), `${here}/${VERSION_MARK}/${wanted}`), "internal", look.name),
    );
    const page = withVendorScripts(
      withCommentsWidget(
        comparing ? shown : withVersionBanner(shown, { shortSha: wanted.slice(0, 7), number }, here, requestTranslate()),
        gate.page.pageSlug,
        look,
      ),
    );
    return withAssetPass(htmlResponse(page, {
      cacheControl: pageCache,
      pageId: null,
      etag: pastEtag,
      origin: new URL(request.url).origin,
      organization: widgetOrganizationStamp(look),
      scripts: scriptDeliveryFor(mode, past, requestOrigin(request)),
    }), pass);
  }

  const current = gate.page.currentVersionId;
  const mode = await scriptMode;
  const look = widgetOrganizationOf(await profile);
  const fresh = ifFresh(request, pageCache, null, current, "html", scriptsRestricted(mode), widgetOrganizationStamp(look));
  if (fresh !== null) return withAssetPass(fresh, await passing);

  const [html, pass] = await Promise.all([
    current === null ? null : rememberPageHtml(gate.page.id, current, () => readHtmlOf(gate.page)),
    passing,
  ]);
  if (html === null || current === null) return notFound();

  // いま出ている版だけ、描画を待たせない形にする（過去の版は今までどおり）。
  // 道具箱が後から足す部品（現在地の行・目次）も、場所と姿を先に描く（src/lib/first-paint/chrome.ts）
  const page = withFirstPaintChrome(await withFastFirstPaint(
    withVendorScripts(
      withCommentsWidget(
        withPageIcon(withOgTags(withAssetBase(withCleanCopyLook(html), here), "internal", look.name)),
        gate.page.pageSlug,
        look,
      ),
    ),
    { pageId: gate.page.id, versionId: current },
  ), {
    url: request.url,
    // よその画面にはめ込まれた本文には、道具箱が現在地の行を出さない（src/widget/reading/location-bar.ts の mountLocationBar）。場所も空けない
    locationBar: request.headers.get("sec-fetch-dest") !== "iframe",
    locale: firstPaintLocale(request.headers.get("cookie")),
  });

  return withAssetPass(htmlResponse(page, {
    cacheControl: pageCache,
    pageId: null,
    etag: current,
    origin: new URL(request.url).origin,
    organization: widgetOrganizationStamp(look),
    scripts: scriptDeliveryFor(mode, html, requestOrigin(request)),
  }), pass);
}
