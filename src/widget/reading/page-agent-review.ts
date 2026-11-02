import { z } from "zod";
import { defaultTranslate } from "../../lib/i18n/default";
import { localizeStored } from "../../lib/i18n/errors";
import { t, widgetLocale } from "../shared/i18n";
import { el } from "../shared/util";
const button = (label: string, fn: () => void) => {
  const node = el("button", undefined, label);
  node.type = "button";
  node.onclick = fn;
  return node;
};
import { agentVerificationSchema } from "../../lib/page-agent/model";
import { writeClipboardText } from "../../lib/workspace/clipboard";
import {
  inspectDeckLayout,
  waitDeckRender,
} from "../../lib/deck/render-inspection";
import { DECK_WORKSPACE_STYLES } from "../deck/workspace/styles";
import { deckIcon, styleDeckButton } from "../deck/ui";
const itemSchema = z.object({
  id: z.string().nullable().optional(),
  summary: z.string(),
  canUndo: z.boolean().default(false),
  versionId: z.string().optional(),
  baseVersionId: z.string().nullable().optional(),
});
const historySchema = z.object({
  latestVersionId: z.string(),
  currentSlideIds: z.array(z.string()).default([]),
  conflicts: z
    .array(
      z.object({
        target: z.string(),
        current: z.unknown(),
        proposed: z.unknown(),
      }),
    )
    .optional(),
  items: z.array(itemSchema).optional(),
  item: itemSchema.optional(),
  beforeHtml: z.string().optional(),
  afterHtml: z.string().optional(),
  slides: z
    .array(
      z.object({ id: z.string(), before: z.unknown(), after: z.unknown() }),
    )
    .optional(),
  verification: z.unknown().optional(),
});
const previewSchema = z.object({
  id: z.string(),
  summary: z.string(),
  baseVersionId: z.string(),
  digest: z.string(),
  slides: z.array(z.string()),
  beforeHtml: z.string(),
  afterHtml: z.string(),
  issues: z.array(z.string()),
});
async function api(page: string, action: string, extra: object = {}) {
  const response = await fetch("/api/pages/agent", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "accept-language": widgetLocale() },
    body: JSON.stringify({ page, action, ...extra }),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(value);
    throw new Error(
      parsed.success ? parsed.data.error : t("toolbox.agentReview.unreadable"),
    );
  }
  return value;
}
export function openAgentReview(
  host: ShadowRoot,
  page: string,
  id?: string,
): void {
  const returnFocus = host.activeElement;
  const modal = el("dialog");
  modal.className = "deck-studio agent-review";
  const style = el("style");
  style.textContent =
    DECK_WORKSPACE_STYLES +
    `
 .agent-review{width:min(1200px,calc(100vw - 48px));height:min(800px,calc(100dvh - 48px));max-width:none;max-height:none;border:0;border-radius:var(--radius-md);padding:0;background:var(--surface);color:var(--text);font-size:var(--font-base);overflow:hidden}
 .agent-review[open]{display:flex;flex-direction:column;pointer-events:auto}
 .agent-review::backdrop{background:color-mix(in srgb,var(--text) 28%,transparent)}
 .agent-review [hidden]{display:none!important}
 .agent-review header,.agent-review footer,.agent-review .review-preview-bar{display:flex;align-items:center;gap:var(--space-4)}
 .agent-review header{padding:var(--space-5);flex:none}
 .agent-review .review-heading{flex:1;min-width:0}
 .agent-review .review-eyebrow{font-size:var(--font-sm);color:var(--muted);margin:0 0 var(--space-1)}
 .agent-review h2{font-size:var(--font-lg);line-height:var(--leading-tight);margin:0;overflow-wrap:anywhere}
 .agent-review h2:focus{outline:none}
 .agent-review h3{font-size:var(--font-md);font-weight:var(--weight-bold);margin:0 0 var(--space-3)}
 .agent-review p{margin:0;line-height:var(--leading-normal);overflow-wrap:anywhere}
 .agent-review .review-meta{font-size:var(--font-sm);color:var(--muted)}
 .agent-review .review-status{display:flex;align-items:center;gap:var(--space-1);max-width:240px}
 .agent-review .review-body{display:grid;grid-template-columns:minmax(0,1fr) 288px;flex:1;min-height:0}
 .agent-review main{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--surface-sunken)}
 .agent-review .review-preview-bar{padding:var(--space-4) var(--space-5);justify-content:space-between;flex:none}
 .agent-review .review-switch{display:flex;gap:var(--space-1);padding:var(--space-1);border-radius:var(--radius-md);background:color-mix(in srgb,var(--text) 5%,transparent)}
 .agent-review .review-switch button{min-width:64px;text-align:center;justify-content:center}
 .agent-review .review-switch button[aria-pressed=true]{background:var(--surface);font-weight:var(--weight-bold)}
 .agent-review .review-canvas{flex:1;min-height:0;min-width:0;padding:var(--space-5);padding-top:0;display:flex;align-items:center;justify-content:center;container-type:size}
 .agent-review iframe.review-slide{border:0;display:block;width:min(100%,calc(100cqh * 16 / 9));height:auto;aspect-ratio:16/9;background:var(--surface);flex:none}
 .agent-review .review-sidebar{padding:var(--space-5);overflow:auto;min-width:0;min-height:0;overscroll-behavior:contain}
 .agent-review nav{display:flex;flex-direction:column;gap:var(--space-1);margin-bottom:var(--space-6)}
 .agent-review .review-nav-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-2)}
 .agent-review .review-count{font-size:var(--font-sm);font-weight:var(--weight-normal);color:var(--muted)}
 .agent-review nav button{height:auto;min-height:var(--size-touch);padding:var(--space-2);align-items:flex-start;gap:var(--space-2);width:100%}
 .agent-review .review-slide-number{font-size:var(--font-sm);color:var(--muted);flex:0 0 20px;font-variant-numeric:tabular-nums;line-height:var(--leading-normal)}
 .agent-review .review-slide-title{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:var(--leading-normal)}
 .agent-review nav button[aria-pressed=true]{background:var(--surface-sunken);font-weight:var(--weight-bold)}
 .agent-review nav button[aria-pressed=true] .review-slide-number{color:var(--text)}
 .agent-review button{display:inline-flex;align-items:center;gap:var(--space-2);flex-shrink:0;height:var(--size-control);border:0;border-radius:var(--radius-md);padding:0 var(--space-3);background:transparent;text-align:left;color:var(--text);font:inherit;cursor:pointer}
 .agent-review button:hover{background:var(--surface-sunken)}
 .agent-review button:focus-visible,.agent-review summary:focus-visible{outline:2px solid var(--text);outline-offset:2px}
 .agent-review button.review-close{width:var(--size-control);padding:0;justify-content:center}
 .agent-review .review-detail{display:flex;flex-direction:column;gap:var(--space-5)}
 .agent-review details>summary{cursor:pointer;font-weight:var(--weight-bold);line-height:var(--leading-normal)}
 .agent-review details[open]>summary{margin-bottom:var(--space-4)}
 .agent-review .review-text-pair{display:flex;flex-direction:column;gap:var(--space-4)}
 .agent-review .review-text-label{font-size:var(--font-sm);color:var(--muted);margin-bottom:var(--space-1)}
 .agent-review .review-text-content{white-space:pre-wrap}
 .agent-review del{color:var(--muted);text-decoration-thickness:1px}
 .agent-review ins{text-decoration:none;font-weight:var(--weight-bold);background:var(--surface-sunken);box-decoration-break:clone}
 .agent-review .review-check-summary{display:inline-flex;align-items:center;justify-content:space-between;width:calc(100% - 20px);gap:var(--space-2)}
 .agent-review .review-check-state{font-weight:var(--weight-normal);font-size:var(--font-sm);color:var(--muted);display:inline-flex;align-items:center;gap:var(--space-1)}
 .agent-review .review-check-body{display:flex;flex-direction:column;gap:var(--space-3)}
 .agent-review footer{padding:var(--space-4) var(--space-5);flex:none}
 .agent-review .review-undo{margin-right:auto;color:var(--muted)}
 .agent-review .review-primary{background:var(--text);color:var(--surface);font-weight:var(--weight-medium)}
 .agent-review .review-primary:hover{background:color-mix(in srgb,var(--text) 86%,var(--surface))}
 .agent-review .review-secondary{background:var(--surface-sunken)}
 .agent-review .review-alert{padding:var(--space-3) var(--space-5);white-space:pre-wrap;max-height:120px;overflow:auto;flex:none}
 .agent-review .review-alert:empty{display:none}
 .agent-review textarea{width:100%;min-height:96px}
 .agent-review .review-history{padding:var(--space-5);gap:var(--space-2);overflow:auto}
 .agent-review .review-history button{height:auto;min-height:var(--size-touch);background:var(--surface);padding:var(--space-3) var(--space-4)}
 .agent-review .review-body:has(.review-sidebar[hidden]){grid-template-columns:1fr}
 @media(max-width:800px){.agent-review{width:calc(100vw - 24px);height:calc(100dvh - 24px)}.agent-review .review-body{grid-template-columns:minmax(0,1fr) 256px}.agent-review header{padding:var(--space-4)}.agent-review .review-sidebar{padding:var(--space-4)}.agent-review .review-preview-bar{padding:var(--space-3)}.agent-review .review-canvas{padding:var(--space-3)}}
 @media(max-width:600px){.agent-review .review-body{display:flex;flex-direction:column;overflow:auto}.agent-review main{min-height:260px;flex:none}.agent-review .review-canvas{min-height:180px;container-type:inline-size}.agent-review iframe.review-slide{width:100%;max-height:none}.agent-review .review-sidebar{overflow:visible;flex:none}.agent-review header{flex-wrap:wrap;gap:var(--space-2)}.agent-review .review-heading{flex-basis:calc(100% - 48px)}.agent-review .review-status{order:3;max-width:none}.agent-review footer{padding:var(--space-3);gap:var(--space-1);flex-wrap:wrap;justify-content:flex-end}.agent-review footer button{font-size:var(--font-sm);padding:0 var(--space-2)}.agent-review nav{margin-bottom:var(--space-5)} }

 `;
  host.append(style, modal);
  const title = el("h2", undefined, t("toolbox.agentReview.title"));
  title.tabIndex = -1;
  title.id = `review-${crypto.randomUUID()}`;
  modal.setAttribute("aria-labelledby", title.id);
  const header = el("header"),
    heading = el("div", "review-heading"),
    close = styleDeckButton(button(t("toolbox.common.close"), () => modal.close()), "close", true);
  close.classList.add("review-close");
  heading.append(el("p", "review-eyebrow", t("toolbox.agentReview.eyebrow")), title);
  const status = el("p", "review-meta review-status");
  status.setAttribute("role", "status");
  header.append(heading, status, close);
  const body = el("div", "review-body"),
    nav = el("nav"),
    main = el("main"),
    sidebar = el("aside", "review-sidebar"),
    footer = el("footer"),
    alert = el("p", "review-alert");
  nav.setAttribute("aria-label", t("toolbox.agentReview.changedSlides"));
  sidebar.setAttribute("aria-label", t("toolbox.agentReview.details"));
  alert.setAttribute("role", "alert");
  sidebar.append(nav);
  body.append(main, sidebar);
  modal.append(header, alert, body, footer);
  let selected = "",
    side: "before" | "after" = "after",
    latest = "",
    activeId = id,
    generation = 0;
  let busy = false;
  const run = (fn: () => Promise<void>) => {
    alert.textContent = "";
    const work = fn(),
      turn = generation;
    void work.catch((error) => {
      if (turn !== generation) return;
      busy = false;
      footer.hidden = false;
      alert.textContent =
        error instanceof Error ? error.message : t("toolbox.agentReview.failed");
    });
  };
  modal.addEventListener("keydown", (event) => event.stopPropagation());
  modal.addEventListener(
    "close",
    () => {
      generation++;
      modal.remove();
      style.remove();
      if (returnFocus instanceof HTMLElement) returnFocus.focus();
    },
    { once: true },
  );
  modal.showModal();
  title.focus();
  async function show(requestId?: string) {
    if (busy) return;
    const turn = ++generation;
    footer.hidden = true;
    status.textContent = t("toolbox.common.loading");
    const result = historySchema.parse(
      await api(page, "history", {
        ...(requestId ? { id: requestId, view: "source" } : {}),
      }),
    );
    if (turn !== generation) return;
    if (!requestId) {
      sidebar.hidden = true;
      main.className = "review-history";
      nav.replaceChildren();
      main.replaceChildren();
      status.textContent = t("toolbox.agentReview.byRequest");
      for (const item of result.items ?? []) {
        if (!item.id) continue;
        const key = item.id;
        main.append(button(localizeStored(item.summary, t), () => run(() => show(key))));
      }
      if (!main.childNodes.length)
        main.append(el("p", undefined, t("toolbox.agentReview.empty")));
      return;
    }
    sidebar.hidden = false;
    main.className = "";
    let before = result.beforeHtml,
      after = result.afterHtml,
      slides = result.slides?.map((slide) => slide.id) ?? [];
    if (!before || !after) {
      const preview = previewSchema.parse(
        await api(page, "preview", { id: requestId }),
      );
      before = preview.beforeHtml;
      after = preview.afterHtml;
      slides = preview.slides;
    }
    if (turn !== generation) return;
    activeId = requestId;
    latest = result.latestVersionId;
    footer.hidden = false;
    title.textContent = result.item?.summary ? localizeStored(result.item.summary, t) : t("toolbox.agentReview.title");
    status.textContent = result.item?.versionId ? t("toolbox.agentReview.saved") : t("toolbox.agentReview.pending");
    if (result.conflicts?.length)
      alert.textContent = result.conflicts
        .map(
          (c) =>
            t("toolbox.agentReview.conflict", { current: JSON.stringify(c.current), proposed: JSON.stringify(c.proposed) }),
        )
        .join("\n");
    const beforeHtml = before,
      afterHtml = after;
    selected = slides.includes(selected) ? selected : (slides[0] ?? "");
    const toggle = el("div", "review-switch"),
      frame = el("iframe"),
      detail = el("div", "review-detail"),
      bar = el("div", "review-preview-bar"),
      position = el("span", "review-meta"),
      canvas = el("div", "review-canvas");
    toggle.setAttribute("role", "group");
    toggle.setAttribute("aria-label", t("toolbox.agentReview.toggle"));
    frame.className = "review-slide";
    frame.title = t("toolbox.agentReview.changedSlides");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    bar.append(position, toggle);
    canvas.append(frame);
    main.replaceChildren(bar, canvas);
    sidebar.replaceChildren(nav, detail);
    nav.replaceChildren();
    const go = button(t("toolbox.agentReview.goto"), () => {
      const url = new URL(location.href);
      url.searchParams.set("edit", "1");
      url.searchParams.delete("change");
      url.searchParams.set("target", selected);
      location.assign(url.href);
    });
    go.classList.add("review-primary");
    const showSlide = () => {
      const slideIndex = result.currentSlideIds.indexOf(selected);
      const originalIndex = [...beforeDoc.querySelectorAll("section[data-deck-slide]")].findIndex((slide) => slide.getAttribute("data-deck-node") === selected),
        changedIndex = [...afterDoc.querySelectorAll("section[data-deck-slide]")].findIndex((slide) => slide.getAttribute("data-deck-node") === selected);
      const removed = changedIndex < 0,
        pendingAddition = !result.item?.versionId && originalIndex < 0,
        labelIndex = slideIndex >= 0 ? slideIndex : changedIndex >= 0 ? changedIndex : originalIndex;
      const number = labelIndex >= 0 ? labelIndex + 1 : originalIndex >= 0 ? originalIndex + 1 : changedIndex + 1;
      position.textContent = removed
        ? result.item?.versionId
          ? t("toolbox.agentReview.slideRemoved", { number })
          : t("toolbox.agentReview.slideToRemove", { number })
        : pendingAddition
          ? t("toolbox.agentReview.slideToAdd", { number })
          : t("toolbox.agentReview.slide", { number });
      go.hidden = !result.currentSlideIds.includes(selected);
      const html = side === "before" ? beforeHtml : afterHtml;
      diff.replaceChildren(el("summary", undefined, t("toolbox.agentReview.textChanges")));
      const beforeText = text(beforeDoc), afterText = text(afterDoc);
      if (beforeText === afterText) {
        diff.open = false;
        diff.append(el("p", "review-meta", t("toolbox.agentReview.noTextChanges")));
      } else {
        diff.open = true;
        const pair = el("div", "review-text-pair");
        let start = 0, end = 0;
        const beforeChars = Array.from(beforeText), afterChars = Array.from(afterText);
        while (start < Math.min(beforeChars.length, afterChars.length) && beforeChars[start] === afterChars[start]) start++;
        while (end < Math.min(beforeChars.length, afterChars.length) - start && beforeChars[beforeChars.length - 1 - end] === afterChars[afterChars.length - 1 - end]) end++;
        for (const [label, chars, tag] of [[t("toolbox.agentReview.before"), beforeChars, "del"], [t("toolbox.agentReview.after"), afterChars, "ins"]] satisfies [string, string[], "del" | "ins"][]) {
          const group = el("div"), content = el("p", "review-text-content"), mark = el(tag);
          mark.textContent = chars.slice(start, chars.length - end).join("");
          const contextStart = Math.max(start > 0 ? chars.lastIndexOf("\n", start - 1) + 1 : 0, start - 24),
            lineEnd = chars.indexOf("\n", chars.length - end),
            contextEnd = Math.min(lineEnd < 0 ? chars.length : lineEnd, chars.length - end + 24);
          content.append((contextStart > 0 && chars[contextStart - 1] !== "\n" ? "…" : "") + chars.slice(contextStart, start).join(""), mark, chars.slice(chars.length - end, contextEnd).join("") + (contextEnd < chars.length && chars[contextEnd] !== "\n" ? "…" : ""));
          group.append(el("p", "review-text-label", label), content);
          pair.append(group);
        }
        diff.append(pair);
      }
      for (const b of nav.querySelectorAll("button"))
        b.setAttribute("aria-pressed", String(b.dataset.target === selected));
      frame.srcdoc = html;
      status.textContent = slideIndex < 0 && result.item?.versionId && !removed
        ? t("toolbox.agentReview.savedSlideGone")
        : result.item?.versionId ? t("toolbox.agentReview.saved") : t("toolbox.agentReview.pending");
      frame.onload = () => {
        const doc = frame.contentDocument;
        if (!doc) return;
        const slides = [
          ...doc.querySelectorAll<HTMLElement>("section[data-deck-slide]"),
        ];
        const found = slides.find(
          (slide) => slide.getAttribute("data-deck-node") === selected,
        );
        for (const slide of slides)
          if (slide !== found)
            (slide.closest<HTMLElement>("[data-deck-frame]") ?? slide).hidden =
              true;
        const css = doc.createElement("style");
        css.textContent =
          "body{margin:0!important;padding:0!important} [hidden],aside[data-deck-notes],[data-deck-toolbar],[data-deck-focus-supplement-pages]{display:none!important} [data-deck-frame]{margin:0!important}";
        doc.head.append(css);
        if (!found) {
          doc.body.textContent = t("toolbox.agentReview.noSlide");
          return;
        }
        frame.title = t("toolbox.agentReview.frameTitle", { side: side === "before" ? t("toolbox.agentReview.before") : t("toolbox.agentReview.after"), position: position.textContent ?? "" });
      };
      for (const b of toggle.querySelectorAll("button"))
        b.setAttribute(
          "aria-pressed",
          String(b.textContent === (side === "before" ? t("toolbox.agentReview.before") : t("toolbox.agentReview.after"))),
        );
    };
    toggle.append(
      button(t("toolbox.agentReview.before"), () => {
        side = "before";
        showSlide();
      }),
      button(t("toolbox.agentReview.after"), () => {
        side = "after";
        showSlide();
      }),
    );
    const beforeDoc = new DOMParser().parseFromString(beforeHtml, "text/html"),
      afterDoc = new DOMParser().parseFromString(afterHtml, "text/html");
    const text = (doc: Document) => {
      const slide = [...doc.querySelectorAll("section[data-deck-slide]")]
        .find((slide) => slide.getAttribute("data-deck-node") === selected)
        ?.cloneNode(true);
      if (!(slide instanceof Element)) return t("toolbox.agentReview.noSlide");
      slide
        .querySelectorAll("script,style,aside[data-deck-notes]")
        .forEach((node) => node.remove());
      slide.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,td,th").forEach((block) => block.append("\n"));
      return (slide.textContent ?? "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    };
    const diff = el("details");
    diff.open = true;
    detail.append(diff);
    const navTitle = el("h3", "review-nav-title", t("toolbox.agentReview.changedSlides"));
    navTitle.append(el("span", "review-count", t("toolbox.agentReview.slideCount", { count: slides.length })));
    nav.append(navTitle);
    const orderedSlides = [...slides].sort((a, b) => {
      const order = result.currentSlideIds;
      return (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length);
    });
    orderedSlides.forEach((slide, index) => {
      const node =
        [...afterDoc.querySelectorAll("section[data-deck-slide]")].find(
          (n) => n.getAttribute("data-deck-node") === slide,
        ) ??
        [...beforeDoc.querySelectorAll("section[data-deck-slide]")].find(
          (n) => n.getAttribute("data-deck-node") === slide,
        );
      const label =
        node?.querySelector("h1,h2,h3")?.textContent?.trim() ?? t("toolbox.agentReview.slideFallback");
      const b = button(`${index + 1} ${label}`, () => {
        selected = slide;
        showSlide();
      });
      b.dataset.target = slide;
      b.title = label;
      const currentIndex = result.currentSlideIds.indexOf(slide),
        documentIndex = currentIndex >= 0 ? currentIndex : [...(node?.ownerDocument.querySelectorAll("section[data-deck-slide]") ?? [])].findIndex((element) => element === node);
      b.replaceChildren(el("span", "review-slide-number", String(documentIndex >= 0 ? documentIndex + 1 : index + 1)), el("span", "review-slide-title", label));
      nav.append(b);
    });
    const report = agentVerificationSchema.safeParse(result.verification),
      checks = el("details"),
      checkSummary = el("summary"),
      checkHeading = el("span", "review-check-summary"),
      checkState = el("span", "review-check-state"),
      checkBody = el("div", "review-check-body");
    checkState.textContent = report.success
      ? { passed: t("toolbox.agentReview.check.passed"), failed: t("toolbox.agentReview.check.failed"), unverified: t("toolbox.agentReview.check.unverified") }[report.data.status]
      : t("toolbox.agentReview.check.unverified");
    if (report.success && report.data.status === "passed") checkState.prepend(deckIcon("check"));
    checkHeading.append(el("span", undefined, t("toolbox.agentReview.check.title")), checkState);
    checkSummary.append(checkHeading);
    checks.append(checkSummary, checkBody);
    detail.append(checks);
    if (report.success) {
      checks.open = report.data.status !== "passed" || report.data.unresolved.length > 0;
      checkBody.append(el("p", "review-meta", report.data.status === "passed" ? t("toolbox.agentReview.check.clean") : t("toolbox.agentReview.check.review")));
      for (const issue of report.data.issues) {
        const index = result.currentSlideIds.indexOf(issue.slideId ?? "");
        checkBody.append(el("p", undefined, index >= 0 ? t("toolbox.agentReview.check.issueOnSlide", { number: index + 1, message: localizeStored(issue.message, t) }) : localizeStored(issue.message, t)));
      }
      if (report.data.assessment) {
        const assessment = el("div");
        assessment.append(el("p", "review-text-label", t("toolbox.agentReview.check.assessment")), el("p", undefined, report.data.assessment));
        checkBody.append(assessment);
      }
      if (report.data.unresolved.length) {
        const unresolved = el("div");
        unresolved.append(el("h3", undefined, t("toolbox.agentReview.check.unresolved", { count: report.data.unresolved.length })), el("p", undefined, report.data.unresolved.join("\n")));
        checkBody.append(unresolved);
      }
    } else checkBody.append(el("p", "review-meta", t("toolbox.agentReview.check.none")));
    const undoButton = styleDeckButton(button(t("toolbox.agentReview.undo"), () => run(undo)), "undo");
    undoButton.classList.add("review-undo");
    footer.replaceChildren(
      ...(result.item?.versionId && result.item.canUndo
        ? [undoButton]
        : []),
      button(t("toolbox.agentReview.copyFollowUp"), () =>
        run(async () => {
          if(!activeId)throw new Error(t("toolbox.agentReview.pickChange"));
          const url=new URL(`${page.startsWith("public/")?"/public/":"/internal/"}${page.replace(/^(internal|public)\//,"")}`,location.origin);
          url.searchParams.set("edit","1");
          url.searchParams.set("change",activeId);
          const text = `${url.href}\n対象: ${selected}\n${result.item?.versionId?"保存した操作":"未反映の変更案"}: ${activeId}\n確認した内容: この操作の${side==="before"?"変更前":"変更後"}\nこの操作の個別履歴を取得して確認してください。\n追加の依頼: `; // i18n-keep: AI へ貼る依頼文（言語で変えない）
          if (await writeClipboardText(text)) {
            status.textContent = t("toolbox.agentReview.followUpCopied");
          } else {
            const area = el("textarea");
            area.value = text;
            footer.append(area);
            area.focus();
            area.select();
          }
        }),
      ),
    );
    const copyButton = footer.querySelector("button:last-child");
    if (copyButton instanceof HTMLButtonElement) {
      styleDeckButton(copyButton, "copy");
      copyButton.classList.add("review-secondary");
      if (!undoButton.isConnected) copyButton.style.marginLeft = "auto";
    }
    footer.append(go);
    showSlide();
  }
  async function undo() {
    if (!activeId || busy) return;
    busy = true;
    footer.hidden = true;
    status.textContent = t("toolbox.agentReview.undoing");
    const result = z.object({ id: z.string() }).parse(
      await api(page, "revert", {
        undoId: activeId,
        baseVersionId: latest,
        summary: defaultTranslate("toolbox.agentHistory.undo"),
        client: "browser-review",
      }),
    );
    const preview = previewSchema.parse(
      await api(page, "preview", { id: result.id }),
    );
    const measurements = [];
    for (const html of [preview.beforeHtml, preview.afterHtml]) {
      const frame = el("iframe");
      frame.style.cssText =
        "width:1280px;height:900px;position:absolute;left:-10000px";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
      modal.append(frame);
      try {
        await new Promise<void>((resolve) => {
          frame.onload = () => resolve();
          frame.srcdoc = html;
        });
        const doc = frame.contentDocument!;
        await waitDeckRender(doc);
        measurements.push(
          inspectDeckLayout(preview.slides, doc).flatMap(
            (slide) => slide.issues,
          ),
        );
      } finally {
        frame.remove();
      }
    }
    const known = new Set(
        measurements[0].map((issue) => JSON.stringify(issue)),
      ),
      issues = measurements[1].filter(
        (issue) => issue.kind === "asset" || !known.has(JSON.stringify(issue)),
      );
    const verification = {
      digest: preview.digest,
      baseVersionId: preview.baseVersionId,
      status: issues.length || preview.issues.length ? "failed" : "passed",
      slides: preview.slides,
      issues,
      assessment: "",
      unresolved: [],
    };
    await api(page, "verify", { id: result.id, verification });
    await api(page, "apply", { id: result.id });
    busy = false;
    footer.hidden = false;
    status.textContent = t("toolbox.agentReview.undone");
    footer.replaceChildren(
      button(t("toolbox.agentReview.seeLatest"), () => run(() => show(result.id))),
    );
  }
  run(() => show(id));
}
