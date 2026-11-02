import { el } from "../shared/util";
import { t } from "../shared/i18n";
import { DECK_WORKSPACE_STYLES } from "../deck/workspace/styles";

/** Visible before any network or document work. No authored content is copied. */
export function createEditorOpening(host: ShadowRoot, cancel: () => void, retry: () => void, restoreFocus?: () => void) {
  const previous = host.activeElement ?? document.activeElement;
  const scroll = { x: scrollX, y: scrollY };
  const overflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  const screen = el("div", "edit-screen deck-studio");
  screen.dataset.editorOpening = "pending";
  screen.setAttribute("role", "dialog");
  screen.setAttribute("aria-modal", "true");
  screen.setAttribute("aria-label", t("toolbox.editorOpening.preparing"));
  const style = el("style");
  style.textContent = DECK_WORKSPACE_STYLES + `
    [data-editor-opening]{position:fixed;z-index:2147483001}
    .editor-opening-paper{width:100%;max-width:1280px;aspect-ratio:16/9;background:var(--surface);display:grid;place-content:center;gap:var(--space-3);padding:var(--space-5)}
    .editor-opening-stage{display:grid;place-items:center;background:var(--surface-sunken);min-height:0;padding:calc(var(--studio-inset)*2)}
    .editor-opening-message{font-size:var(--font-sm);color:var(--muted)}
  `;
  const bar = el("div", "edit-bar deck-edit-bar");
  const title = el("span", "edit-title", t("toolbox.editorOpening.title"));
  const back = el("button", "edit-button", t("toolbox.editorOpening.back")); back.type = "button";
  const again = el("button", "edit-button", t("toolbox.common.retry")); again.type = "button"; again.hidden = true;
  const message = el("p", "editor-opening-message", t("toolbox.editorOpening.preparingMessage"));
  message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
  const stage = el("div", "editor-opening-stage"), paper = el("div", "editor-opening-paper");
  const workspace = el("div", "ds-workspace"), nav = el("nav", "ds-nav"), inspector = el("aside", "ds-inspector"), footer = el("div", "ds-footer");
  nav.setAttribute("aria-hidden", "true"); inspector.setAttribute("aria-hidden", "true"); footer.setAttribute("aria-hidden", "true");
  paper.append(message, again); stage.append(paper); workspace.append(nav, stage, inspector); bar.append(title, back); screen.append(style, bar, workspace, footer);
  const lifetime = new AbortController();
  back.addEventListener("click", cancel, { signal: lifetime.signal });
  again.addEventListener("click", retry, { signal: lifetime.signal });
  screen.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
    if (event.key === "Tab") {
      event.preventDefault();
      (again.hidden || host.activeElement === again ? back : again).focus();
    }
  }, { signal: lifetime.signal });
  host.append(screen); back.focus({ preventScroll: true });
  performance.mark?.("deck:open-feedback-mounted");
  let disposed = false;
  let restored = false;
  return {
    async painted() {
      await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (!disposed) performance.mark?.("deck:open-feedback-painted");
    },
    fail(text: string) { screen.dataset.editorOpening = "failed"; message.textContent = text; again.hidden = false; },
    dispose(restore = false) {
      if (!disposed) { disposed = true; lifetime.abort(); screen.remove(); document.documentElement.style.overflow = overflow; }
      if (restore && !restored) { restored = true; if(scrollX!==scroll.x||scrollY!==scroll.y)scrollTo(scroll.x, scroll.y); if(restoreFocus)restoreFocus();else if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); }
    },
  };
}
