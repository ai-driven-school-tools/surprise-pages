/** Pause the covered reader without measuring layout in the opening click.
 * The preparation screen gets its first paint before optional containment work. */
export function pauseDeckReader() {
  const previous = document.deckEditorOpen;
  document.deckEditorOpen = true;
  const layout = () => document.deckLayout?.suspend?.();
  const properties = ["content-visibility", "contain-intrinsic-size"];
  let main: HTMLElement | null = null;
  let styles: {name:string;value:string;priority:string}[] = [];
  let prepared = false, resumed = false;
  return {
    prepare() {
      if (prepared || resumed) return; prepared = true;
      const firstPaper = document.querySelector<HTMLElement>("section[data-deck-slide]");
      const viewportContained = document.deckReaderCanPause && firstPaper && getComputedStyle(firstPaper).contentVisibility === "auto";
      document.deckRenderer?.suspend?.(); layout();
      // Retain modern papers' existing layout. Legacy readers must finish
      // measuring diagrams before their common measuring surface is hidden.
      main = !viewportContained && (document.deckReaderCanPause || document.deckRenderer?.suspend || document.body.hasAttribute("data-deck-design-ready"))
        ? document.querySelector<HTMLElement>("main[data-deck-slides]") : null;
      const container=main;
      styles = container ? properties.map(name => ({name,value:container.style.getPropertyValue(name),priority:container.style.getPropertyPriority(name)})) : [];
      if (main) {
        const height = main.getBoundingClientRect().height;
        main.style.setProperty("contain-intrinsic-size", `auto ${height}px`);
        main.style.setProperty("content-visibility", "hidden");
      }
    },
    resume() {
      if (resumed) return; resumed = true;
      for (const {name,value,priority} of styles) {
        if (value) main?.style.setProperty(name,value,priority); else main?.style.removeProperty(name);
      }
      document.deckEditorOpen = previous;
      document.deckRenderer?.suspend?.(); layout();
    },
  };
}
