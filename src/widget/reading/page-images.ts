import { imageDisplaySize } from "../../lib/html/image-display-size";
/** Reader-only enhancement. Original documents and the editor's source stay untouched. */
const selector = "img[data-sp-image]";
const initialized = new WeakSet<HTMLImageElement>();
const backgrounds = new WeakMap<HTMLImageElement, {name: string; value: string; priority: string}[]>();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting || !(entry.target instanceof HTMLImageElement)) continue;
    const image = entry.target;
    observer.unobserve(image);
    if (image.complete && image.naturalWidth) continue;
    const blur = image.getAttribute("data-sp-image-blur");
    const style = getComputedStyle(image);
    if (blur && style.backgroundImage === "none" && ["cover", "contain", "fill"].includes(style.objectFit)) {
      backgrounds.set(image, ["background-image", "background-size", "background-position", "background-repeat"].map(name => ({name, value: image.style.getPropertyValue(name), priority: image.style.getPropertyPriority(name)})));
      image.style.backgroundImage = `url(${JSON.stringify(blur)})`;
      image.style.backgroundSize = style.objectFit === "fill" ? "100% 100%" : style.objectFit;
      image.style.backgroundPosition = style.objectPosition;
      image.style.backgroundRepeat = "no-repeat";
      image.setAttribute("data-sp-image-placeholder", "");
    }
  }
}, {rootMargin: "800px"});

function setup(image: HTMLImageElement) {
  if (initialized.has(image)) return;
  initialized.add(image);
  // Upgrade CSS-sized images before their first decode. Intrinsically sized
  // article images retain their original pixel dimensions and never shrink.
  const candidates = image.getAttribute("data-sp-image-candidates");
  let fallback = false;
  let knownRatio = 0;
  // The widest presentation that has actually been decoded. Only a decoded picture
  // sets a floor: an image that has not loaded yet follows its current box, so a
  // slide overview requests thumbnails instead of the width measured for the list.
  let decodedWidth = 0;
  let wantedWidth = 0;
  let managed = false;
  const resize = () => {
    if (!candidates || fallback || image.parentElement?.tagName === "PICTURE") return;
    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    // An intrinsically sized article image must keep its original layout.
    if (!managed && image.naturalWidth && image.offsetWidth === image.naturalWidth && image.offsetHeight === image.naturalHeight) return;
    managed = true;
    const style = getComputedStyle(image);
    const ratio = knownRatio || (image.naturalHeight ? image.naturalWidth / image.naturalHeight : 0);
    const width = ratio ? imageDisplaySize(rect.width, rect.height, ratio, 1, style.objectFit).width : rect.width;
    // Never downgrade a decoded presentation when the user returns to the list.
    wantedWidth = Math.max(decodedWidth, Math.ceil(width));
    image.sizes = `${wantedWidth}px`;
    image.srcset = candidates;
  };
  const resizing = new ResizeObserver(resize);
  resizing.observe(image);
  window.addEventListener("resize", resize);
  window.addEventListener("beforeprint", resize);
  // A slide can grow via transform without resizing its layout box.
  const mode = new MutationObserver(resize);
  mode.observe(document.documentElement, {attributes:true, attributeFilter:["data-deck-mode", "data-deck-overview"]});
  window.addEventListener("pagehide", event => { if (!event.persisted) {resizing.disconnect();mode.disconnect();window.removeEventListener("resize",resize);window.removeEventListener("beforeprint",resize);} });
  if (!image.naturalWidth) resize();
  let decoding = "";
  const ready = async () => {
    if (!image.naturalWidth || !image.currentSrc || decoding === image.currentSrc) return;
    knownRatio = image.naturalWidth / image.naturalHeight;
    resize();
    const source = image.currentSrc;
    decoding = source;
    try { await image.decode(); } catch { return; }
    if (image.currentSrc !== source || !image.isConnected) return;
    decodedWidth = Math.max(decodedWidth, wantedWidth);
    observer.unobserve(image);
    if (image.hasAttribute("data-sp-image-placeholder")) {
      for (const property of backgrounds.get(image) ?? []) {
        if (property.value) image.style.setProperty(property.name, property.value, property.priority);
        else image.style.removeProperty(property.name);
      }
      backgrounds.delete(image);
      image.removeAttribute("data-sp-image-placeholder");
      if (!reducedMotion.matches && getComputedStyle(image).filter === "none") {
        image.animate([{filter: "blur(2px)"}, {filter: "blur(0px)"}], {duration: 160, easing: "ease-out"});
      }
    }
    image.setAttribute("data-sp-image-ready", "");
  };
  image.addEventListener("load", () => { void ready(); });
  const restoreOriginal = () => {
    if (fallback) return;
    fallback = true;
    const original = image.getAttribute("data-sp-image-original");
    if (!original) return;
    image.srcset = image.getAttribute("data-sp-image-original-srcset") ?? `${original} 1x`;
    // Picture sources authored by the page are restored by the browser's fallback
    // only if they are absent; keep a failed optimizer from repeatedly winning.
    if (image.parentElement?.tagName === "PICTURE") {
      for (const source of image.parentElement.querySelectorAll("source[data-sp-image-original-srcset]")) {
        const originalSet = source.getAttribute("data-sp-image-original-srcset");
        if (originalSet) source.setAttribute("srcset", originalSet);
      }
    }
    image.src = original;
  };
  image.addEventListener("error", restoreOriginal);
  if (image.complete && image.naturalWidth) void ready();
  else {
    if (image.complete && image.getAttribute("src")) restoreOriginal();
    observer.observe(image);
  }
}
function scan(root: ParentNode) {
  if (root instanceof HTMLImageElement && root.matches(selector)) setup(root);
  root.querySelectorAll<HTMLImageElement>(selector).forEach(setup);
}
scan(document);
const changes = new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) scan(node);
});
changes.observe(document.documentElement, {childList: true, subtree: true});
window.addEventListener("beforeprint", () => {
  document.querySelectorAll<HTMLImageElement>(selector).forEach(image => { image.loading = "eager"; });
});
window.addEventListener("pagehide", event => { if (!event.persisted) { observer.disconnect(); changes.disconnect(); } });
