/** Work the editor postponed past an input so the input could paint first:
 * the repaint of the edited document, the slide list refresh, slide previews and
 * indexing of the current source. The owner marks its own element while such
 * work is scheduled or running. Nothing in the product reads the mark; the speed
 * checks' browser probe waits for it before each action, so one action's
 * postponed work is not measured as the next action's input delay. */
export const DECK_DEFERRED_WORK = "data-deck-deferred";

export function markDeferredWork(element: Element, pending: boolean): void {
  if (element.hasAttribute(DECK_DEFERRED_WORK) !== pending) element.toggleAttribute(DECK_DEFERRED_WORK, pending);
}
