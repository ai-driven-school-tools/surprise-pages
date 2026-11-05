import {
  AUTHORING_LAYOUTS
} from "../../../lib/deck/authoring";
import {
  DECK_NODE_MARK,
  type DeckEditOperation,
  type DeckEditStyleProperty,
} from "../../../lib/deck/edit/model";
import {
  inspectDeckNode
} from "../../../lib/deck/edit/source";
import { DECK_LIBRARY } from "../../../lib/deck/design/library";
import { deckIcon, styleDeckButton } from "../ui";
import type { Input } from './types';
import { el } from "../../shared/util";
import { layerOrderOperations } from "../edit/layer-order";
import { t } from "../../shared/i18n";

type Align = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** Owns inspector behavior; receives only its required page/editor connections. */
type Host = {
  closeMedia:()=>void;
  input: Input;
  selection: string[];
  commit: (ops: DeckEditOperation[]) => boolean;
  sourceSelected: () => HTMLElement[];
  run: (fn: () => void) => void;
  button: (label: string, fn: () => void, cls?: string) => HTMLButtonElement;
  inspector: HTMLElement;
  screen: HTMLElement;
  cropOriginal: { id: string; style: Record<string, string>; } | null;
  design: boolean;
  renderDesign: () => void;
  labelOf: (node: Element) => string;
  current: string;
  find: (doc: Document, id: string) => HTMLElement | undefined;
  sourceDoc: () => Document;
  layouts: (replace: boolean) => void;
  attached: Document | null;
  replaceMedia: (type: "image" | "video") => void;
  dataEditor: (node: HTMLElement) => void;
  distribute: (vertical: boolean) => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  elementCommand: (command: string) => void;
  /** 右の欄の下端のレイヤーの一覧を描き直す（選択・枚・中身が変わるたび。次の描画の前に 1 回だけ） */
  refreshLayers: () => void;
};

export function createDeckWorkspaceInspector(connections: Host) {
  const commit: Host['commit'] = (...args) => connections.commit(...args);
  const sourceSelected: Host['sourceSelected'] = (...args) => connections.sourceSelected(...args);
  const run: Host['run'] = (...args) => connections.run(...args);
  const button: Host['button'] = (...args) => connections.button(...args);
  const renderDesign: Host['renderDesign'] = (...args) => connections.renderDesign(...args);
  const labelOf: Host['labelOf'] = (...args) => connections.labelOf(...args);
  const find: Host['find'] = (...args) => connections.find(...args);
  const sourceDoc: Host['sourceDoc'] = (...args) => connections.sourceDoc(...args);
  const layouts: Host['layouts'] = (...args) => connections.layouts(...args);
  const replaceMedia: Host['replaceMedia'] = (...args) => connections.replaceMedia(...args);
  const dataEditor: Host['dataEditor'] = (...args) => connections.dataEditor(...args);
  const distribute: Host['distribute'] = (...args) => connections.distribute(...args);
  const groupSelection: Host['groupSelection'] = (...args) => connections.groupSelection(...args);
  const ungroupSelection: Host['ungroupSelection'] = (...args) => connections.ungroupSelection(...args);
  const elementCommand: Host['elementCommand'] = (...args) => connections.elementCommand(...args);


  const inspectNode=(id:string)=>connections.input.inspectNode?connections.input.inspectNode(id):inspectDeckNode(connections.input.source(),id);

  function setStyle(property: DeckEditStyleProperty, value: string | null) {
    const ops: DeckEditOperation[] = connections.selection.flatMap((id) => {
      const node = inspectNode(id);
      return node
        ? [
          {
            kind: "style",
            target: id,
            property,
            before: node.style[property] ?? null,
            after: value,
          },
        ]
        : [];
    });
    commit(ops);
  }

  /**
   * 揃えの 2 行（左右の 3 つ・上下の 3 つ）。複数なら選んだ範囲に、1 つ（グループ 1 つ）ならスライドに揃える。
   * 行の中の真ん中は字を「中央」に縮め、読み上げの名前は左右中央・上下中央のまま（1 つのときは「スライドの〜に揃える」）。
   */
  function alignRows(parent: HTMLElement, count: number) {
    const rows: [string, [Align, string, string][]][] = [
      [t("deckEditor.align.horizontal"), [["left", t("deckEditor.inspector.left"), t("deckEditor.inspector.left")], ["center", t("deckEditor.align.centerShort"), t("deckEditor.inspector.center")], ["right", t("deckEditor.inspector.right"), t("deckEditor.inspector.right")]]],
      [t("deckEditor.align.vertical"), [["top", t("deckEditor.inspector.top"), t("deckEditor.inspector.top")], ["middle", t("deckEditor.align.middleShort"), t("deckEditor.inspector.middle")], ["bottom", t("deckEditor.inspector.bottom"), t("deckEditor.inspector.bottom")]]],
    ];
    for (const [label, modes] of rows) {
      const row = el("div", "ds-row ds-align-row");
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", label);
      row.append(el("span", "ds-property-label", label));
      for (const [mode, short, name] of modes) {
        const one = button(short, () => connections.input.canvas()?.align(mode));
        one.setAttribute("aria-label", count === 1 ? t("deckEditor.align.toSlide", { action: name }) : name);
        row.append(one);
      }
      parent.append(row);
    }
  }

  /** 前面へ・背面へ。重なっている相手と同じ土俵の外側の箱で順番を変える（../edit/layer-order.ts）。1 回の操作で取り消せる */
  function reorderLayers(direction: "front" | "back") {
    const live = connections.attached ? find(connections.attached, connections.selection[0]) : null;
    const slide = live?.closest("section[data-deck-slide]");
    if (!slide) return;
    commit(layerOrderOperations(slide, connections.selection, direction, (id, property) => {
      const target = inspectNode(id);
      return target ? target.style[property] ?? null : undefined;
    }));
  }

  function attribute(
    name: Extract<DeckEditOperation, { kind: "attribute" }>["name"],
    value: string | null,
  ) {
    const ops: DeckEditOperation[] = sourceSelected().map((node) => ({
      kind: "attribute",
      target: node.getAttribute(DECK_NODE_MARK)!,
      name,
      before: node.getAttribute(name),
      after: value,
    }));
    commit(ops);
  }

  function field(
    parent: HTMLElement,
    label: string,
    value: string,
    change: (value: string) => void,
    type = "text",
  ) {
    const wrap = el("label", "ds-field"),
      caption = el("span", undefined, label),
      control = el("input");
    control.type = type;
    if (type === "color") wrap.classList.add("ds-color-field");
    control.value = value;
    control.addEventListener("change", () => run(() => change(control.value)));
    wrap.append(caption, control);
    parent.append(wrap);
    return control;
  }

  function selectField(
    parent: HTMLElement,
    label: string,
    items: readonly (readonly [string, string])[],
    value: string,
    change: (value: string) => void,
  ) {
    if (label === t("deckEditor.inspector.textAlign")) {
      const row = el("div", "ds-segment");
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", label);
      for (const [id, text] of items) {
        const b = button(text, () => {
          change(id);
          for (const sibling of row.querySelectorAll("button"))
            sibling.setAttribute("aria-pressed", String(sibling === b));
        });
        styleDeckButton(
          b,
          id === "left" ? "left" : id === "right" ? "right" : "center",
          true,
        );
        b.setAttribute("aria-pressed", String(id === value));
        row.append(b);
      }
      parent.append(row);
      return row;
    }
    const wrap = el("label", "ds-field"),
      control = el("select");
    for (const [id, name] of items) {
      const o = el("option");
      o.value = id;
      o.textContent = name;
      control.append(o);
    }
    control.value = value;
    control.onchange = () => run(() => change(control.value));
    wrap.append(el("span", undefined, label), control);
    parent.append(wrap);
    return control;
  }

  function section(label: string) {
    if (label === t("deckEditor.inspector.arrange")) {
      const group = el("details", "ds-section ds-placement");
      group.open =
        connections.selection.length > 1 ||
        Boolean(sourceSelected()[0]?.hasAttribute("data-deck-group"));
      group.append(el("summary", undefined, label));
      connections.inspector.append(group);
      return group;
    }
    const group = el(
      "section",
      label === t("deckEditor.inspector.actions") ? "ds-selection-actions" : "ds-section",
    );
    group.setAttribute("aria-label", label);
    if (
      label !== t("deckEditor.inspector.actions") &&
      connections.inspector.querySelector("h2")?.textContent !== label
    )
      group.append(el("h3", undefined, label));
    connections.inspector.append(group);
    return group;
  }

  function togglePanel(name: string) {
    connections.closeMedia();
    connections.screen.dataset.panel = connections.screen.dataset.panel === name ? "" : name;
  }

  function startCrop(id: string) {
    connections.selection = [id];
    if (!connections.input.canvas()?.isCropping()) {
      const state = inspectNode(id);
      if (state) connections.cropOriginal = { id, style: { ...state.style } };
      connections.input.canvas()?.crop();
    }
    refreshInspector();
  }

  function refreshInspector() {
    connections.refreshLayers();
    connections.input.bar
      .querySelector("[data-studio-design]")
      ?.setAttribute("aria-pressed", String(connections.design));
    const expanded = [...connections.inspector.querySelectorAll("details")].filter(n => n.open).map(n => n.querySelector("summary")?.textContent);
    queueMicrotask(() => { for (const detail of connections.inspector.querySelectorAll("details")) if (expanded.includes(detail.querySelector("summary")?.textContent)) detail.open = true; });
    connections.inspector.replaceChildren();
    if (connections.design) {
      renderDesign();
      return;
    }
    const chosen = sourceSelected(),
      node = chosen[0];
    connections.inspector.append(
      el(
        "h2",
        undefined,
        chosen.length > 1
          ? t("deckEditor.inspector.selectedCount",{count:chosen.length})
          : node
            ? node.matches(
              "img,video,[data-deck-youtube],table,[data-dd-chart],[data-deck-shape],[data-deck-group]",
            )
              ? labelOf(node)
              : t("deckEditor.inspector.text")
            : t("deckEditor.inspector.slide"),
      ),
    );
    if (!node) {
      if (connections.current) {
        const slide = find(sourceDoc(), connections.current),
          layout = AUTHORING_LAYOUTS.find(
            (item) =>
              item.id === slide?.getAttribute("data-deck-authoring-layout"),
          );
        const layoutButton = button(
          t("deckEditor.inspector.changeType"),
          () => layouts(true),
          "ds-property-row",
        );
        layoutButton.setAttribute("aria-label", t("deckEditor.inspector.changeType"));
        layoutButton.replaceChildren(
          el("span", "ds-property-label", t("deckEditor.inspector.layout")),
          el("span", "ds-property-value", (layout ? t(layout.labelKey) : undefined) ?? DECK_LIBRARY.templates.find(item => item.id === slide?.getAttribute("data-deck-template"))?.name ?? t("deckEditor.inspector.custom")),
          deckIcon("chevron"),
        );
        const background = button(
          t("deckEditor.inspector.changeBackground"),
          () => {
            connections.design = true;
            refreshInspector();
          },
          "ds-property-row",
        );
        background.setAttribute("aria-label", t("deckEditor.inspector.changeBackground"));
        const swatch = el("span", "ds-property-swatch");
        const painted = connections.attached?.querySelector<HTMLElement>("section[data-studio-active]");
        // The standard renderer already writes this value inline. Reading the
        // computed style immediately after switching slides forces layout for
        // the entire preview. Verify custom CSS only after the next paint.
        swatch.style.background = painted?.style.getPropertyValue("--dd-bg") || "#ffffff";
        if (painted) requestAnimationFrame(() => setTimeout(() => {
          if (!swatch.isConnected || !painted.isConnected) return;
          const value = painted.ownerDocument.defaultView?.getComputedStyle(painted).getPropertyValue("--dd-bg");
          if (value) swatch.style.background = value;
        }, 0));
        background.replaceChildren(
          el("span", "ds-property-label", t("deckEditor.inspector.background")),
          swatch,
          deckIcon("chevron"),
        );
        connections.inspector.append(layoutButton, background);
      }
      return;
    }
    const mediaSlot = node.getAttribute("data-deck-media-slot");
    if (mediaSlot) {
      connections.inspector.append(el("p", "ds-note", node.hasAttribute("data-deck-sample-image") ? t("deckEditor.inspector.sampleImage") : t("deckEditor.inspector.slotHint")));
      if (mediaSlot === "video")
        connections.inspector.append(button(t("deckEditor.inspector.addVideo"), () => replaceMedia(mediaSlot)));
      else if (mediaSlot === "image")
        connections.inspector.append(button(node.hasAttribute("data-deck-sample-image") ? t("deckEditor.inspector.replaceImage") : t("deckEditor.inspector.addImage"), () => replaceMedia(mediaSlot)));
      else connections.inspector.append(el("p", "ds-note", t("deckEditor.inspector.audioFromSource")));
      return;
    }
    if (node.hasAttribute("data-deck-locked")) {
      connections.inspector.append(
        el("p", "ds-note", t("deckEditor.inspector.locked")),
        button(t("deckEditor.inspector.unlock"), () => attribute("data-deck-locked", null)),
      );
      return;
    }
    const live = connections.attached ? find(connections.attached, connections.selection[0]) : null,
      css = live ? connections.attached?.defaultView?.getComputedStyle(live) : null;
    if (chosen.length === 1) {
      if (node.tagName === "IMG") {
        const group = section(t("deckEditor.inspector.image"));
        group.dataset.section = "image"; // 見た目の決まりは字面（言語で変わる）でなく、この印で当てる
        group.append(
          button(t("deckEditor.inspector.replaceImage"), () => replaceMedia("image")),
          button(connections.input.canvas()?.isCropping() ? t("deckEditor.inspector.cropping") : t("deckEditor.inspector.crop"), () =>
            startCrop(connections.selection[0]),
          ),
          button(t("deckEditor.inspector.showAll"), () => {
            setStyle("object-fit", "contain");
            setStyle("clip-path", null);
          }),
        );
        field(group, t("deckEditor.inspector.altText"), node.getAttribute("alt") ?? "", (value) =>
          attribute("alt", value),
        );
        group.append(button(t("deckEditor.inspector.decorative"),()=>attribute("alt","")),el("p","ds-note",t("deckEditor.inspector.decorativeNote")));
        if (connections.input.canvas()?.isCropping()) {
          const cropGroup = section(t("deckEditor.inspector.cropRange"));
          const range = field(
            cropGroup,
            t("deckEditor.inspector.cropEdges"),
            String(parseFloat(node.style.clipPath.replace("inset(", "")) || 0),
            (v) => connections.input.canvas()?.cropInset(Number(v)),
            "range",
          );
          range.min = "0";
          range.max = "45";
          range.step = "1";
          cropGroup.append(
            el(
              "p",
              "ds-note",
              t("deckEditor.inspector.cropHint"),
            ),
            button(t("deckEditor.inspector.confirm"), () => {
              connections.input.canvas()?.crop();
              connections.cropOriginal = null;
              refreshInspector();
            }),
            button(t("deckEditor.inspector.cancel"), () => {
              if (connections.cropOriginal) {
                const state = inspectNode(connections.cropOriginal.id);
                const original = connections.cropOriginal;
                const properties: DeckEditStyleProperty[] = [
                  "object-fit",
                  "object-position",
                  "clip-path",
                ];
                commit(
                  properties.map((property) => ({
                    kind: "style",
                    target: original.id,
                    property,
                    before: state?.style[property] ?? null,
                    after: original.style[property] ?? null,
                  })),
                );
              }
              connections.input.canvas()?.crop();
              connections.cropOriginal = null;
              refreshInspector();
            }),
          );
        }
      } else if (node.hasAttribute("data-deck-youtube")) {
        const group=section(t("deckEditor.inspector.youtube"));
        group.append(el("p",undefined,t("deckEditor.inspector.youtubeNote")));
      } else if (node.tagName === "VIDEO") {
        const group = section(t("deckEditor.inspector.video"));
        group.append(
          button(t("deckEditor.inspector.checkPlayback"), () => connections.input.canvas()?.editSelected()),
        );
        field(group, t("deckEditor.inspector.description"), node.getAttribute("aria-label") ?? "", (value) =>
          attribute("aria-label", value),
        );
      } else if (
        node.tagName === "TABLE" ||
        node.hasAttribute("data-dd-chart")
      ) {
        const group = section(t("deckEditor.inspector.content"));
        if (
          node.tagName === "TABLE" ||
          node.hasAttribute("data-deck-basic-chart")
        )
          group.append(
            button(
              node.tagName === "TABLE"
                ? t("deckEditor.inspector.editTable")
                : t("deckEditor.inspector.editChart"),
              () => dataEditor(node),
            ),
          );
        else
          group.append(
            el("p", "ds-note", t("deckEditor.inspector.chartFromSource")),
          );
      } else if (node.hasAttribute("data-deck-shape")) {
        const group = section(t("deckEditor.inspector.shape"));
        field(
          group,
          t("deckEditor.inspector.fill"),
          toHex(css?.backgroundColor ?? ""),
          (v) => setStyle("background-color", v),
          "color",
        );
        field(
          group,
          t("deckEditor.inspector.strokeColor"),
          toHex(css?.borderColor ?? ""),
          (v) => setStyle("border-color", v),
          "color",
        );
        field(
          group,
          t("deckEditor.inspector.strokeWidth"),
          String(parseFloat(css?.borderWidth ?? "0")),
          (v) => {
            if (!Number.isFinite(Number(v)) || Number(v) < 0) return;
            setStyle("border-width", `${v}px`);
            setStyle("border-style", "solid");
          },
          "number",
        );
      } else if (
        node.textContent?.trim() &&
        !node.hasAttribute("data-deck-group")
      ) {
        const group = section(t("deckEditor.inspector.text"));
        selectField(
          group,
          t("deckEditor.inspector.font"),
          [
            ["inherit", t("deckEditor.inspector.fontInherit")],
            ["sans-serif", t("deckEditor.inspector.fontSans")],
            ["serif", t("deckEditor.inspector.fontSerif")],
            ["monospace", t("deckEditor.inspector.fontMono")],
          ],
          node.style.fontFamily || "inherit",
          (v) => setStyle("font-family", v),
        );
        const row = el("div", "ds-row");
        group.append(row);
        const size = field(
          row,
          t("deckEditor.inspector.size"),
          String(parseFloat(css?.fontSize ?? "32")),
          (v) => {
            if (Number(v) >= 8 && Number(v) <= 240)
              setStyle("font-size", `${v}px`);
          },
          "number",
        );
        size.min = "8";
        size.max = "240";
        const line = field(
          row,
          t("deckEditor.inspector.lineHeight"),
          String(
            Math.round(
              (parseFloat(css?.lineHeight ?? "48") /
                parseFloat(css?.fontSize ?? "32")) *
              100,
            ) / 100 || 1.5,
          ),
          (v) => {
            if (Number(v) >= 0.8 && Number(v) <= 4) setStyle("line-height", v);
          },
          "number",
        );
        line.step = "0.1";
        const format = el("div", "ds-row"),
          bold = button(t("deckEditor.inspector.bold"), () =>
            setStyle(
              "font-weight",
              parseInt(css?.fontWeight ?? "400") >= 600 ? "400" : "700",
            ),
          ),
          italic = button(t("deckEditor.inspector.italic"), () =>
            setStyle(
              "font-style",
              css?.fontStyle === "italic" ? "normal" : "italic",
            ),
          );
        bold.setAttribute(
          "aria-pressed",
          String(parseInt(css?.fontWeight ?? "400") >= 600),
        );
        italic.setAttribute(
          "aria-pressed",
          String(css?.fontStyle === "italic"),
        );
        format.append(bold, italic);
        group.append(format);
        field(
          group,
          t("deckEditor.inspector.textColor"),
          toHex(css?.color ?? ""),
          (v) => setStyle("color", v),
          "color",
        );
        selectField(
          group,
          t("deckEditor.inspector.textAlign"),
          [
            ["left", t("deckEditor.inspector.alignLeft")],
            ["center", t("deckEditor.inspector.alignCenter")],
            ["right", t("deckEditor.inspector.alignRight")],
          ],
          node.style.textAlign || "left",
          (v) => setStyle("text-align", v),
        );
      }
    }
    const placement = section(t("deckEditor.inspector.arrange"));
    alignRows(placement, chosen.length);
    if (chosen.length > 1) {
      placement.append(
        button(t("deckEditor.inspector.distributeHorizontal"), () => distribute(false)),
        button(t("deckEditor.inspector.distributeVertical"), () => distribute(true)),
        button(t("deckEditor.inspector.group"), groupSelection),
      );
    } else {
      const row = el("div", "ds-row");
      placement.append(row);
      field(
        row,
        t("deckEditor.inspector.width"),
        String(Math.round(live?.offsetWidth ?? 0)),
        (v) => {
          if (Number(v) > 0) setStyle("width", `${v}px`);
        },
        "number",
      );
      field(
        row,
        t("deckEditor.inspector.height"),
        String(Math.round(live?.offsetHeight ?? 0)),
        (v) => {
          if (Number(v) > 0) setStyle("height", `${v}px`);
        },
        "number",
      );
      if (node.hasAttribute("data-deck-group"))
        placement.append(button(t("deckEditor.inspector.ungroup"), ungroupSelection));
    }
    placement.append(
      button(t("deckEditor.inspector.bringForward"), () => reorderLayers("front")),
      button(t("deckEditor.inspector.sendBackward"), () => reorderLayers("back")),
      button(t("deckEditor.inspector.resetLayout"), () => {
        const props: DeckEditStyleProperty[] = [
          "translate",
          "scale",
          "transform-origin",
        ];
        commit(
          connections.selection.flatMap((id) => {
            const n = inspectNode(id);
            return props.flatMap((property) =>
              n?.style[property]
                ? [
                  {
                    kind: "style",
                    target: id,
                    property,
                    before: n.style[property],
                    after: null,
                  } satisfies DeckEditOperation,
                ]
                : [],
            );
          }),
        );
      }),
    );
    const more = section(t("deckEditor.inspector.actions"));
    more.append(
      button(t("deckEditor.inspector.duplicate"), () => elementCommand("duplicate")),
      button(t("deckEditor.inspector.delete"), () => elementCommand("delete")),
      button(t("deckEditor.inspector.lock"), () => attribute("data-deck-locked", "true")),
    );
  }

  function toHex(value: string) {
    if (/^#[\da-f]{6}$/i.test(value)) return value;
    const parts = value.match(/[\d.]+/g);
    return parts && parts.length >= 3
      ? `#${parts
        .slice(0, 3)
        .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
        .join("")}`
      : "#242424";
  }
  return {
    field,
    selectField,
    reorderLayers,
    togglePanel,
    startCrop,
    refreshInspector
  };
}
