import library from "./design/library.generated.json";
import { prepareDeckEdit, deckSourceFragment } from "./edit/source";
import { defaultTranslate } from "../i18n/default";
import { LocalizedError } from "../i18n/errors";
import type { MessageKey } from "../i18n/messages/types";

/**
 * 基本の型。名前と説明は辞書の鍵で持つ（画面はその人の言語で `t(labelKey)`）。`label`・`description` は
 * 日本語の正本の字で、言語を知らない所（見本の一覧の組み立てなど）が今までどおり読む。
 */
const layout = (id: string, labelKey: MessageKey, descriptionKey: MessageKey) => ({ id, labelKey, descriptionKey, label: defaultTranslate(labelKey), description: defaultTranslate(descriptionKey) });
export const AUTHORING_LAYOUTS = [
  layout("title", "deckEditor.layouts.title", "deckEditor.layouts.titleDescription"),
  layout("text", "deckEditor.layouts.text", "deckEditor.layouts.textDescription"),
  layout("comparison", "deckEditor.layouts.comparison", "deckEditor.layouts.comparisonDescription"),
  layout("image", "deckEditor.layouts.image", "deckEditor.layouts.imageDescription"),
  layout("process", "deckEditor.layouts.process", "deckEditor.layouts.processDescription"),
  layout("table", "deckEditor.layouts.table", "deckEditor.layouts.tableDescription"),
  layout("chart", "deckEditor.layouts.chart", "deckEditor.layouts.chartDescription"),
  layout("blank", "deckEditor.layouts.blank", "deckEditor.layouts.blankDescription"),
];
export const escapeDeckText = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function prepareAuthoringFragment(raw: string, id: string): string {
  const prepared = prepareDeckEdit(
    `<html><head></head><body data-deck><main data-deck-slides>${raw.startsWith("<section") ? raw : `<section data-deck-slide data-deck-node="temporary-slide">${raw}</section>`}</main></body></html>`,
  );
  const found = deckSourceFragment(prepared.html, id);
  if (!found) throw new LocalizedError("deckEditor.layouts.prepareFailed");
  return found.html;
}
export function authorTable(
  id: string,
  rows: readonly (readonly string[])[] = [
    ["項目", "案 A", "案 B"], // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
    ["使いやすさ", "簡単", "設定が必要"], // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
    ["導入期間", "1週間", "1か月"], // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
  ],
): string {
  return prepareAuthoringFragment(
    `<table data-deck-node="${id}" class="dd-table" style="width:100%"><thead><tr>${rows[0].map((cell, col) => `<th data-dd-column-id="${id}-col-${col}">${escapeDeckText(cell)}</th>`).join("")}</tr></thead><tbody>${rows
      .slice(1)
      .map(
        (row, r) =>
          `<tr data-dd-row-id="${id}-row-${r}">${row.map((cell, c) => `<td data-dd-cell-id="${id}-cell-${r}-${c}">${escapeDeckText(cell) || `<!--sp-deck-text:0-->`}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table>`,
    id,
  );
}
export type BasicChart = "bar" | "line" | "pie" | "donut";
export function authorChart(
  id: string,
  kind: BasicChart = "bar",
  rows: readonly (readonly string[])[] = [
    ["項目", "件数"], // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
    ["4月", "24"], // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
    ["5月", "38"], // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
    ["6月", "52"], // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
  ],
  unit = "",
  legend = true,
  labels = true,
): string {
  if ((kind === "pie" || kind === "donut") && rows[0].length !== 2)
    throw new LocalizedError("deckEditor.layouts.pieOneSeries");
  const purpose =
    kind === "line"
      ? "time"
      : kind === "pie" || kind === "donut"
        ? "composition"
        : "size";
  const source = {
    purpose: `chart-${purpose}`,
    unit,
    variant: kind,
    categories: rows.slice(1).map((r) => r[0]),
    series: rows[0].slice(1).map((label, col) => ({
      id: `${id}-series-${col}`,
      label,
      data: rows.slice(1).flatMap((row, index) => {
        const cell = row[col + 1]?.trim();
        if (!cell)
          return [
            {
              id: `${id}-point-${col}-${index}`,
              label: row[0] || String(index + 1),
              x: index,
            },
          ];
        const value = Number(cell);
        if (!Number.isFinite(value))
          throw new LocalizedError("deckEditor.layouts.rowNotNumber", { row: index + 2 });
        if ((kind === "pie" || kind === "donut") && value < 0)
          throw new LocalizedError("deckEditor.layouts.pieNegative");
        return [
          {
            id: `${id}-point-${col}-${index}`,
            label: row[0] || String(index + 1),
            x: index,
            value,
          },
        ];
      }),
    })),
    ariaDescription: "入力されたデータのグラフ", // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
  };
  if (source.series.some((s) => !s.data.some((point) => "value" in point)))
    throw new LocalizedError("deckEditor.layouts.seriesEmpty");
  const data = JSON.stringify(source).replace(/</g, "\\u003c");
  return prepareAuthoringFragment(
    `<figure class="dd-chart-figure" data-deck-node="${id}" data-dd-chart="${purpose}" data-dd-composition="${kind}" data-deck-basic-chart="${kind}" data-deck-chart-legend="${legend}" data-deck-chart-labels="${labels}" style="width:100%;height:380px"><div class="dd-chart-canvas" style="width:100%;height:340px"></div><script type="application/json" data-dd-chart-source>${data}</script><div class="dd-chart-fallback">${authorTable(`${id}-data`, rows)}</div></figure>`,
    id,
  );
}
export function authorSlide(
  layout: string,
  id: string,
  heading?: string,
): string {
  const e = escapeDeckText;
  const title =
    heading ??
    {
      title: "伝えたいことを、一枚から。", // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
      text: "この資料で伝えたいこと", // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
      comparison: "二つの案を、比べて考える。", // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
      image: "一枚の画像で伝える。", // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
      process: "進め方を、三つのステップで。", // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
      table: "判断に必要な情報を並べる。", // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
      chart: "変化を、数字で確かめる。", // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
    }[layout] ??
    "";
  const h = `<h1 class="dd-title" data-deck-role="title" data-deck-node="${id}-title" style="white-space:pre-wrap">${e(title)}</h1>`;
  const p = (text: string) =>
    `<p style="font-size:28px;line-height:1.6;white-space:pre-wrap">${e(text)}</p>`;
  const content =
    layout === "title"
      ? `<div class="dd-body">${p("現状を共有し、次の行動を決める。")}</div>` // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
      : layout === "comparison"
        ? `<div class="dd-body"><div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px"><div><h2 style="font-size:36px">案 A</h2>${p("良いところと、気になるところ")}</div><div><h2 style="font-size:36px">案 B</h2>${p("同じ視点で、違いを比べる")}</div></div></div>` // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
        : layout === "process"
          ? `<div class="dd-body"><ol style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px;padding-left:32px">${["準備する", "試してみる", "振り返る"].map((label) => `<li style="font-size:32px">${e(label)}${p(label === "準備する" ? "必要な情報を集める" : label === "試してみる" ? "一週間の運用で確かめる" : "結果を次の行動へつなぐ")}</li>`).join("")}</ol></div>` // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
          : layout === "table"
            ? `<div class="dd-body">${authorTable(`${id}-table`)}</div>`
            : layout === "chart"
              ? `<div class="dd-body">${authorChart(`${id}-chart`)}</div>`
              : layout === "image"
                ? `<div class="dd-body" style="height:380px">${library.basicImage}</div>`
                : layout === "blank"
                  ? ""
                  : `<div class="dd-body">${p("今ある仕事を見直し、集中できる時間を増やす。")}${p("小さく試し、結果を確かめながら改善します。")}</div>`; // i18n-keep: 新しい枚・表・グラフとして原稿に入る見本の文
  return prepareAuthoringFragment(
    `<section data-deck-slide data-deck-id="${id}" data-deck-node="${id}" data-deck-authoring-layout="${layout}" data-dd-logo-safe="top-right school-bottom-right${layout === "title" ? " school-cover" : ""}"${layout === "title" ? ' data-deck-brand-layout="cover"' : ""}${layout === "title" ? ' class="dd-hero"' : ""}>${layout === "blank" ? "" : h}${content}<aside data-deck-notes></aside></section>`,
    id,
  );
}
export function authorShape(id: string, shape: string): string {
  const circle = shape === "circle",
    line = shape === "line" || shape === "arrow";
  return prepareAuthoringFragment(
    `<div data-deck-node="${id}" data-deck-shape="${shape}" style="position:absolute;left:440px;top:260px;width:240px;height:${line ? 4 : 160}px;background-color:var(--dd-accent);border-radius:${circle ? "50%" : "0"}">${shape === "arrow" ? `<span style="position:absolute;right:-2px;top:-8px;width:20px;height:20px;background:inherit;clip-path:polygon(0 0,100% 50%,0 100%)"></span>` : ""}</div>`,
    id,
  );
}
