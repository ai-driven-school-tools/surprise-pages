import {
  authorChart,
  authorTable,
  type BasicChart
} from "../../../lib/deck/authoring";
import { readDeckChartSource } from "../../../lib/deck/design/chart-source";
import {
  DECK_NODE_MARK,
  type DeckEditOperation
} from "../../../lib/deck/edit/model";
import {
  deckSourceFragment
} from "../../../lib/deck/edit/source";
import type { Input } from './types';
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";
import { deckErrorMessage } from "../../../lib/deck/edit/message";

/** Owns data behavior; receives only its required page/editor connections. */
type Host = {
  input: Input;
  modal: (title: string) => HTMLElement;
  selectField: (parent: HTMLElement, label: string, items: readonly (readonly [string, string])[], value: string, change: (value: string) => void) => HTMLDivElement | HTMLSelectElement;
  field: (parent: HTMLElement, label: string, value: string, change: (value: string) => void, type?: string) => HTMLInputElement;
  button: (label: string, fn: () => void, cls?: string) => HTMLButtonElement;
  actions: (box: HTMLElement, label: string, fn: () => void) => void;
  parse: (html: string) => Document;
  commit: (ops: DeckEditOperation[]) => boolean;
  closeDialog: () => void;
};

export function createDeckWorkspaceData(connections: Host) {
  const modal: Host['modal'] = (...args) => connections.modal(...args);
  const selectField: Host['selectField'] = (...args) => connections.selectField(...args);
  const field: Host['field'] = (...args) => connections.field(...args);
  const button: Host['button'] = (...args) => connections.button(...args);
  const actions: Host['actions'] = (...args) => connections.actions(...args);
  const parse: Host['parse'] = (...args) => connections.parse(...args);
  const commit: Host['commit'] = (...args) => connections.commit(...args);
  const closeDialog: Host['closeDialog'] = (...args) => connections.closeDialog(...args);


  function dataEditor(node: HTMLElement) {
    const isChart = node.hasAttribute("data-dd-chart"),
      id = node.getAttribute(DECK_NODE_MARK)!;
    const openedFragment = deckSourceFragment(connections.input.source(), id);
    if (isChart && !node.hasAttribute("data-deck-basic-chart")) {
      connections.input.fail(
        t("deckEditor.data.chartFromSource"),
      );
      return;
    }
    if (
      !isChart &&
      [...node.querySelectorAll("td,th")].some((cell) => cell.children.length)
    ) {
      connections.input.fail(
        t("deckEditor.data.styledTable"),
      );
      return;
    }
    const table = node.tagName === "TABLE" ? node : node.querySelector("table");
    let rows = table
      ? [...table.querySelectorAll("tr")].map((tr) =>
        [...tr.querySelectorAll("th,td")].map((td) => td.textContent ?? ""),
      )
      : [
        ["項目", "値"], // i18n-keep: 原稿に入る新しい表の見出し
        ["項目1", "10"], // i18n-keep: 原稿に入る新しい表の初期値
      ];
    let chart: BasicChart = "bar",
      unit = "",
      legend = node.getAttribute("data-deck-chart-legend") !== "false",
      labels = node.getAttribute("data-deck-chart-labels") !== "false";
    if (isChart) {
      const source = readDeckChartSource(
        node.querySelector("script[data-dd-chart-source]")?.textContent ?? "",
      );
      unit = source.unit;
      const kind = node.getAttribute("data-deck-basic-chart");
      chart =
        kind === "line" || kind === "pie" || kind === "donut" ? kind : "bar";
      rows = [
        ["項目", ...source.series.map((s) => s.label)], // i18n-keep: 原稿に入るグラフの表の見出し
        ...source.categories.map((label, index) => [
          label,
          ...source.series.map((s) => {
            const datum =
              s.data.find((d) => d.x === index) ??
              s.data.find((d) => d.label === label);
            return datum?.value === undefined ? "" : String(datum.value);
          }),
        ]),
      ];
    }
    if (!rows.length)
      rows = [
        ["項目", "値"], // i18n-keep: 原稿に入る新しい表の見出し
        ["", ""],
      ];
    const box = modal(isChart ? t("deckEditor.data.editChart") : t("deckEditor.data.editTable"));
    box.append(
      el(
        "p",
        "ds-note",
        t("deckEditor.data.pasteNote"),
      ),
    );
    if (isChart) {
      const controls = el("div", "ds-row");
      box.append(controls);
      selectField(
        controls,
        t("deckEditor.data.kind"),
        [
          ["bar", t("deckEditor.data.bar")],
          ["line", t("deckEditor.data.line")],
          ["pie", t("deckEditor.data.pie")],
          ["donut", t("deckEditor.data.donut")],
        ],
        chart,
        (v) => {
          if (v === "bar" || v === "line" || v === "pie" || v === "donut")
            chart = v;
        },
      );
      field(controls, t("deckEditor.data.unit"), unit, (v) => (unit = v));
      selectField(
        controls,
        t("deckEditor.data.legend"),
        [
          ["true", t("deckEditor.data.show")],
          ["false", t("deckEditor.data.hide")],
        ],
        String(legend),
        (v) => (legend = v === "true"),
      );
      selectField(
        controls,
        t("deckEditor.data.valueLabels"),
        [
          ["true", t("deckEditor.data.show")],
          ["false", t("deckEditor.data.hide")],
        ],
        String(labels),
        (v) => (labels = v === "true"),
      );
    }
    const scroll = el("div", "ds-data-scroll"),
      error = el("p", "ds-error");
    error.setAttribute("role", "alert");
    box.append(scroll, error);
    const draw = () => {
      scroll.replaceChildren();
      const grid = el("table", "ds-data-table");
      rows.forEach((row, r) => {
        const tr = el("tr");
        row.forEach((cell, c) => {
          const td = el("td"),
            field = el("input");
          field.value = cell;
          field.setAttribute("aria-label", t("deckEditor.data.cell",{row:r + 1,column:c + 1}));
          field.oninput = () => (rows[r][c] = field.value);
          field.onpaste = (event) => {
            const text = event.clipboardData?.getData("text/plain");
            if (!text || !/[\t\n]/.test(text)) return;
            event.preventDefault();
            const pasted = text
              .replace(/\r/g, "")
              .replace(/\n$/, "")
              .split("\n")
              .map((line) => line.split("\t"));
            if (
              pasted.length + r > 100 ||
              Math.max(...pasted.map((line) => line.length)) + c > 20
            ) {
              error.textContent = t("deckEditor.data.pasteLimit");
              return;
            }
            const cols = Math.max(
              rows[0].length,
              c + Math.max(...pasted.map((line) => line.length)),
            );
            while (rows.length < r + pasted.length)
              rows.push(Array.from({ length: cols }, () => ""));
            rows.forEach((row) => {
              while (row.length < cols) row.push("");
            });
            pasted.forEach((line, pr) =>
              line.forEach((value, pc) => (rows[r + pr][c + pc] = value)),
            );
            draw();
          };
          td.append(field);
          tr.append(td);
        });
        grid.append(tr);
      });
      scroll.append(grid);
    };
    draw();
    const controls = el("div", "ds-row");
    controls.append(
      button(t("deckEditor.data.addRow"), () => {
        if (rows.length < 100) {
          rows.push(rows[0].map(() => ""));
          draw();
        }
      }),
      button(t("deckEditor.data.addColumn"), () => {
        if (rows[0].length < 20) {
          rows.forEach((r) => r.push(""));
          draw();
        }
      }),
      button(t("deckEditor.data.deleteRow"), () => {
        if (rows.length > 2) {
          rows.pop();
          draw();
        }
      }),
      button(t("deckEditor.data.deleteColumn"), () => {
        if (rows[0].length > 2) {
          rows.forEach((r) => r.pop());
          draw();
        }
      }),
    );
    box.append(controls);
    actions(box, t("deckEditor.data.apply"), () => {
      try {
        let after = isChart
          ? authorChart(id, chart, rows, unit, legend, labels)
          : authorTable(id, rows);
        // Retain table identities at unchanged positions; append/remove only affects the trailing row/column.
        if (!isChart && table) {
          const updated = parse(`<body>${after}</body>`).querySelector(
            "table",
          )!;
          const old = [table, ...table.querySelectorAll("*")],
            next = [updated, ...updated.querySelectorAll("*")];
          const oldRows = [...table.querySelectorAll("tr")],
            newRows = [...updated.querySelectorAll("tr")];
          for (const name of table.getAttributeNames())
            if (name !== "data-deck-node")
              updated.setAttribute(name, table.getAttribute(name)!);
          newRows.forEach((tr, r) => {
            const previous = oldRows[r];
            if (!previous) return;
            for (const name of previous.getAttributeNames())
              tr.setAttribute(name, previous.getAttribute(name)!);
            [...tr.children].forEach((cell, c) => {
              const prev = previous.children[c];
              if (prev)
                for (const name of prev.getAttributeNames())
                  cell.setAttribute(name, prev.getAttribute(name)!);
            });
          });
          for (const tag of ["thead", "tbody"]) {
            const a = old.find((n) => n.tagName.toLowerCase() === tag),
              b = next.find((n) => n.tagName.toLowerCase() === tag);
            if (a && b)
              for (const name of a.getAttributeNames())
                b.setAttribute(name, a.getAttribute(name)!);
          }
          after = updated.outerHTML;
        }
        if (isChart) {
          const updated = parse(`<body>${after}</body>`).querySelector(
            "figure",
          )!;
          for (const name of node.getAttributeNames())
            if (
              ![
                "data-deck-basic-chart",
                "data-dd-chart",
                "data-dd-composition",
                "data-deck-chart-legend",
                "data-deck-chart-labels",
              ].includes(name)
            )
              updated.setAttribute(name, node.getAttribute(name)!);
          const oldSource = readDeckChartSource(
            node.querySelector("script[data-dd-chart-source]")!.textContent!,
          );
          const json = updated.querySelector("script[data-dd-chart-source]")!;
          const nextSource = readDeckChartSource(json.textContent!);
          nextSource.series.forEach((series, index) => {
            const old = oldSource.series[index];
            if (!old) return;
            series.id = old.id;
            series.data.forEach((point, i) => {
              const previous = old.data.find((p) => p.x === i) ?? old.data[i];
              if (previous) point.id = previous.id;
            });
          });
          json.textContent = JSON.stringify(nextSource).replace(
            /</g,
            "\\u003c",
          );
          after = updated.outerHTML;
        }
        if (openedFragment?.parentId && commit([{ kind: "fragment", target: id, parentId: openedFragment.parentId, beforeId: openedFragment.beforeId, before: openedFragment.html, after }])) closeDialog();
      } catch (e) {
        error.textContent =
          e instanceof Error ? deckErrorMessage(e, t) : t("deckEditor.data.checkInput");
      }
    });
  }
  return { dataEditor };
}
