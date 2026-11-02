import { readDeckChartSource, type ChartDatum, type ChartSeries, type DeckChartSource } from "../lib/deck/design/chart-source";
import { DECK_CANVAS } from "../lib/deck/deck";

type JsonObject = { [key: string]: unknown };

type EChartsInstance = {
  setOption(option: JsonObject, notMerge?: boolean): void;
  dispatchAction(payload: JsonObject): void;
  resize(): void;
  dispose(): void;
};

declare const echarts: {
  init(element: HTMLElement, theme?: string | null, options?: { renderer: "svg" }): EChartsInstance;
  getInstanceByDom(element: HTMLElement): EChartsInstance | undefined;
  registerMap(name: string, source: { svg: string }): void;
};

const instances = new WeakMap<HTMLElement, { chart: EChartsInstance; source: DeckChartSource; option: JsonObject }>();
const signatures = new WeakMap<HTMLElement, string>();
const optionSignatures = new WeakMap<HTMLElement, string>();

export function releaseDeckCharts(root: Element): void {
  const figures = [root, ...root.querySelectorAll<HTMLElement>("[data-dd-chart]")];
  for (const figure of figures) if (figure instanceof HTMLElement) {
    instances.get(figure)?.chart.dispose(); instances.delete(figure); signatures.delete(figure); optionSignatures.delete(figure);
  }
}

function objectOf(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function colorsFor(element: HTMLElement): { text: string; muted: string; border: string; accent: string; secondary: string; bg: string } {
  const style = getComputedStyle(element);
  return {
    text: style.getPropertyValue("--dd-text").trim(),
    muted: style.getPropertyValue("--dd-muted").trim(),
    border: style.getPropertyValue("--dd-border").trim(),
    accent: style.getPropertyValue("--dd-accent").trim(),
    secondary: style.getPropertyValue("--dd-secondary").trim(),
    bg: style.getPropertyValue("--dd-bg").trim(),
  };
}

function datumValue(datum: ChartDatum): number { return datum.value ?? 0; }
function labels(source: DeckChartSource): string[] {
  if (source.categories.length) return source.categories;
  return source.series[0]?.data.map((datum) => datum.label) ?? [];
}

function baseOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  const colors = colorsFor(element);
  return {
    animation: false,
    backgroundColor: "transparent",
    color: [colors.accent, colors.secondary, colors.muted],
    textStyle: { color: colors.text, fontSize: 20, textBorderWidth: 0, fontFamily: getComputedStyle(element).fontFamily },
    aria: { enabled: true, description: source.ariaDescription, decal: { show: false } },
    tooltip: { show: false },
  };
}

function axes(source: DeckChartSource, element: HTMLElement, horizontal = false): JsonObject {
  const colors = colorsFor(element);
  const category = { type: "category", data: labels(source), axisLabel: { color: colors.text, fontSize: 24, interval: 0 }, axisTick: { show: false }, axisLine: { lineStyle: { color: colors.border, width: 1 } } };
  const value = { type: "value", splitNumber: 4, name: "", nameTextStyle: { color: colors.muted, fontSize: 20 }, axisLabel: { color: colors.muted, fontSize: 20 }, splitLine: { lineStyle: { color: colors.border, width: 1 } }, axisLine: { show: false }, axisTick: { show: false } };
  return horizontal ? { xAxis: value, yAxis: category } : { xAxis: category, yAxis: value };
}

function seriesData(series: ChartSeries): JsonObject[] {
  return series.data.map((datum) => ({ id: datum.id, name: datum.label, value: datumValue(datum) }));
}

function focusState(focus: string, element: HTMLElement): JsonObject {
  const colors = colorsFor(element);
  return {
    emphasis: {
      focus,
      itemStyle: { borderColor: colors.accent, borderWidth: 3, opacity: 1 },
      lineStyle: { color: colors.accent, width: 4, opacity: 1 },
      label: { color: colors.text, opacity: 1 },
    },
    blur: { itemStyle: { opacity: .6 }, lineStyle: { opacity: .6 }, areaStyle: { opacity: .36 }, label: { opacity: .72 } },
  };
}

function barOption(source: DeckChartSource, element: HTMLElement, sorted: boolean): JsonObject {
  const all = sorted ? [...source.series[0]?.data ?? []].sort((a, b) => datumValue(a) - datumValue(b)) : source.series[0]?.data ?? [];
  const adjusted = { ...source, categories: all.map((datum) => datum.label), series: [{ id: source.series[0]?.id ?? "value", label: source.series[0]?.label ?? "値", data: all }] };
  return {
    ...baseOption(adjusted, element), ...axes(adjusted, element, true), grid: { left: 176, right: 128, top: 24, bottom: 40 },
    series: adjusted.series.map((item) => ({ id: item.id, name: item.label, type: "bar", data: seriesData(item), barMaxWidth: 36,
      label: { show: true, position: "right", fontSize: 24, formatter: `{c}${source.unit}` }, ...focusState("series", element) })),
  };
}

function timeOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  return {
    ...baseOption(source, element), ...axes(source, element), grid: { left: 72, right: 40, top: 48, bottom: 56 },
    legend: { show: source.series.length > 1, top: 0, textStyle: { fontSize: 20, color: colorsFor(element).text } },
    series: source.series.map((item) => ({ id: item.id, name: item.label, type: "line", data: seriesData(item), symbolSize: 10, lineStyle: { width: 2 },
      label: { show: true, position: "top", fontSize: 20 }, ...focusState("series", element) })),
  };
}

function compositionOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  const item = source.series[0];
  const colors = colorsFor(element);
  const total = (item?.data ?? []).reduce((sum, datum) => sum + datumValue(datum), 0);
  return {
    ...baseOption(source, element),
    graphic: [{ type: "group", left: "center", top: "middle", children: [
      { type: "text", x: 0, y: -14, style: { text: String(total), fontSize: 40, fontWeight: 650, fontFamily: getComputedStyle(element).fontFamily, fill: colors.text, align: "center", verticalAlign: "middle" } },
      { type: "text", x: 0, y: 24, style: { text: source.unit, fontSize: 20, fontFamily: getComputedStyle(element).fontFamily, fill: colors.muted, align: "center", verticalAlign: "middle" } },
    ] }],
    series: [{ id: item?.id ?? "share", name: item?.label ?? "構成比", type: "pie", radius: ["46%", "72%"], center: ["50%", "50%"],
      data: item ? seriesData(item) : [], label: { show: true, fontSize: 20, lineHeight: 28, color: colors.text, formatter: (params: { name: string; value: number; percent: number }) => `${params.name}\n${Math.round(params.percent)}% · ${params.value}${source.unit}` }, labelLine: { length: 20, length2: 20 }, ...focusState("self", element) }],
  };
}

function changeOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  return {
    ...baseOption(source, element), ...axes(source, element), grid: { left: 72, right: 40, top: 40, bottom: 56 },
    series: source.series.map((item) => ({ id: item.id, name: item.label, type: "bar", data: item.data.map((datum) => ({ id: datum.id, name: datum.label,
      value: datumValue(datum) })), barMaxWidth: 36,
      label: { show: true, position: datumValue(item.data[0] ?? { id: "x", label: "x", value: 0 }) >= 0 ? "top" : "bottom", fontSize: 20 }, ...focusState("series", element) })),
  };
}

function contributionOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  const data = source.series[0]?.data ?? [];
  let running = 0;
  const base: number[] = [];
  const changes = data.map((datum) => {
    const value = datumValue(datum);
    if (datum.isTotal) { base.push(0); running = value; return value; }
    base.push(value >= 0 ? running : running + value); running += value; return Math.abs(value);
  });
  return {
    ...baseOption(source, element), ...axes(source, element), grid: { left: 72, right: 40, top: 40, bottom: 56 },
    series: [
      { id: `${source.series[0]?.id ?? "contribution"}--baseline`, type: "bar", stack: "total", stackStrategy: "all", data: base, itemStyle: { color: "transparent" }, silent: true },
      { id: source.series[0]?.id ?? "contribution", name: source.series[0]?.label ?? "寄与", type: "bar", stack: "total", stackStrategy: "all",
        data: data.map((datum, index) => ({ id: datum.id, name: datum.label, value: changes[index] })), label: { show: true, position: "top", fontSize: 20,
          formatter: (params: { dataIndex: number }) => `${datumValue(data[params.dataIndex] ?? { id: "x", label: "x", value: 0 })}${source.unit}` }, ...focusState("series", element) },
    ],
  };
}

function distributionOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  const item = source.series[0];
  return {
    ...baseOption(source, element), ...axes(source, element), grid: { left: 72, right: 40, top: 40, bottom: 56 },
    series: [{ id: item?.id ?? "distribution", name: item?.label ?? "分布", type: "boxplot", data: item?.data.map((datum) => ({ id: datum.id, name: datum.label,
      value: [datum.low ?? 0, datum.q1 ?? 0, datum.median ?? 0, datum.q3 ?? 0, datum.high ?? 0] })) ?? [],
      label: { show: true, position: "top", fontSize: 20, formatter: (params: { dataIndex: number }) => `${item?.data[params.dataIndex]?.median ?? 0}${source.unit}` }, ...focusState("series", element) }],
  };
}

function correlationOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  const colors = colorsFor(element);
  return {
    ...baseOption(source, element), xAxis: { type: "value", name: source.xAxisLabel ?? "", nameLocation: "middle", nameGap: 40, nameTextStyle: { fontSize: 20, color: colors.muted }, axisLabel: { color: colors.muted, fontSize: 20 }, splitLine: { lineStyle: { color: colors.border } } },
    yAxis: { type: "value", name: source.yAxisLabel ?? "", nameTextStyle: { fontSize: 20, color: colors.muted }, axisLabel: { color: colors.muted, fontSize: 20 }, splitLine: { lineStyle: { color: colors.border } } },
    grid: { left: 80, right: 112, top: 48, bottom: 72 }, series: source.series.map((item) => ({ id: item.id, name: item.label, type: "scatter", symbolSize: 18,
      data: item.data.map((datum) => ({ id: datum.id, name: datum.label, value: [datum.x ?? 0, datum.y ?? 0] })), label: { show: true, position: "right", fontSize: 20, formatter: "{b}" }, ...focusState("series", element) })),
  };
}

function targetOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  const item = source.series[0];
  const data = item?.data ?? [];
  const colors = colorsFor(element);
  const commonTarget = data.length > 0 && data[0].target !== undefined && data.every(datum => datum.target === data[0].target) ? data[0].target : null;
  const number = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
  const marker = commonTarget === null
    ? { markPoint: { symbol: "rect", symbolSize: [2, 30], label: { show: false }, data: data.filter(datum => datum.target !== undefined).map(datum => ({ coord: [datum.target, data.indexOf(datum)] })) } }
    : { markLine: { silent: true, symbol: "none", lineStyle: { color: colors.muted, type: "dashed", width: 1.5 }, label: { show: true, rotate: 0, position: "end", formatter: `目標 ${number.format(commonTarget)}${source.unit}`, fontSize: 20, color: colors.muted }, data: [{ xAxis: commonTarget }] } };
  return {
    ...baseOption(source, element), ...axes(source, element, true), grid: { left: 176, right: 184, top: 48, bottom: 40 },
    series: [{ id: item?.id ?? "actual", name: item?.label ?? "実績", type: "bar", barMaxWidth: 24,
      data: data.map(datum => ({ id: datum.id, name: datum.label, value: datumValue(datum), itemStyle: { color: datum.target !== undefined && datumValue(datum) < datum.target ? colors.accent : colors.secondary } })),
      label: { show: true, position: "right", fontSize: 20, color: colors.text, formatter: (params: { dataIndex: number }) => {
        const datum = data[params.dataIndex]; if (!datum) return "";
        const value = `${number.format(datumValue(datum))}${source.unit}`;
        if (datum.target === undefined) return value;
        if (commonTarget === null) return `${value} / 目標${number.format(datum.target)}${source.unit}`;
        return datumValue(datum) < datum.target ? `${value}（−${number.format(datum.target - datumValue(datum))}${source.unit === "%" ? "pt" : source.unit}）` : value;
      } }, ...marker, ...focusState("series", element) }],
  };
}

function flowOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  const nodes = source.series.flatMap((item) => item.data).map((datum) => ({ id: datum.id, name: datum.id, value: datumValue(datum), label: { formatter: `${datum.label}\n${datumValue(datum)}${source.unit}` } }));
  return {
    ...baseOption(source, element), series: [{ id: source.series[0]?.id ?? "flow", type: "sankey", left: 16, right: 160, top: 24, bottom: 24, nodeWidth: 18, nodeGap: 32, layoutIterations: 32,
      data: nodes, links: source.links.map((link) => ({ id: link.id, source: link.source, target: link.target, value: link.value })),
      label: { show: true, fontSize: 20, lineHeight: 28, color: colorsFor(element).text, distance: 12 }, lineStyle: { color: "source", opacity: .25 }, ...focusState("adjacency", element) }],
  };
}

function heatmapOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  const colors = colorsFor(element);
  const item = source.series[0];
  const values = item?.data.map((datum) => datumValue(datum)) ?? [0];
  return {
    ...baseOption(source, element), xAxis: { type: "category", data: source.categories, axisLabel: { color: colors.muted, fontSize: 20 } },
    yAxis: { type: "category", data: [...new Set(item?.data.map((datum) => String(datum.y ?? "")) ?? [])], axisLabel: { color: colors.muted, fontSize: 20 } },
    grid: { left: 112, right: 40, top: 32, bottom: 56 }, visualMap: { show: false, min: Math.min(...values), max: Math.max(...values), inRange: { color: [colors.accent], colorAlpha: [.05, .28] } },
    series: [{ id: item?.id ?? "heatmap", type: "heatmap", data: item?.data.map((datum) => ({ id: datum.id, name: datum.label, value: [datum.x ?? 0, datum.y ?? 0, datumValue(datum)] })) ?? [],
      label: { show: true, color: colors.text, fontSize: 20, formatter: (params: { value: unknown[] }) => String(params.value[2] ?? "") }, ...focusState("self", element) }],
  };
}

function geographyOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  const item = source.series[0];
  const colors = colorsFor(element);
  return {
    ...baseOption(source, element), geo: { map: source.mapName ?? "", roam: false, label: { show: false }, itemStyle: { areaColor: colors.bg, borderColor: colors.border, borderWidth: 1.5 } },
    series: [{ id: item?.id ?? "geography", type: "scatter", coordinateSystem: "geo", symbolSize: 1, itemStyle: { color: "transparent" },
      data: item?.data.map(datum => ({ id: datum.id, name: datum.label, value: [datum.x ?? 0, datum.y ?? 0, datumValue(datum)] })) ?? [],
      label: { show: true, position: "inside", color: colors.text, fontSize: 20, lineHeight: 30, formatter: (params: { name: string; value: unknown[] }) => `${params.name}\n${String(params.value[2] ?? "")}${source.unit}` }, ...focusState("series", element) }],
  };
}

function forecastOption(source: DeckChartSource, element: HTMLElement): JsonObject {
  const item = source.series[0];
  const data = item?.data ?? [];
  const explicit = source.forecastFrom === undefined ? -1 : data.findIndex(datum => datum.id === source.forecastFrom);
  const bounded = data.findIndex(datum => datum.low !== undefined || datum.high !== undefined);
  const start = explicit >= 0 ? explicit : Math.max(0, bounded);
  const bridge = Math.max(0, start - 1);
  const colors = colorsFor(element);
  const sourceId = item?.id ?? "forecast";
  const coordinateAxes = axes(source, element);
  if (objectOf(coordinateAxes.yAxis)) coordinateAxes.yAxis = { ...coordinateAxes.yAxis, scale: true };
  const shown = (datum: ChartDatum, index: number, observed: boolean) => ({ id: datum.id, name: datum.label, value: (observed ? index < start : index >= bridge) ? datumValue(datum) : null });
  return {
    ...baseOption(source, element), ...coordinateAxes, grid: { left: 80, right: 136, top: 52, bottom: 48 },
    legend: { data: start > 0 ? ["実績", "予測"] : ["予測"], top: 0, textStyle: { color: colors.text, fontSize: 20 } },
    series: [
      { id: `${sourceId}--low`, type: "line", stack: "forecast-band", stackStrategy: "all", data: data.map((datum, index) => index < bridge ? null : index < start ? datumValue(datum) : datum.low ?? datumValue(datum)), symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, silent: true },
      { id: `${sourceId}--band`, type: "line", stack: "forecast-band", stackStrategy: "all", data: data.map((datum, index) => index < bridge ? null : index < start ? 0 : (datum.high ?? datumValue(datum)) - (datum.low ?? datumValue(datum))), symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: colors.accent, opacity: .16 }, silent: true },
      ...(start > 0 ? [{ id: `${sourceId}-observed`, deckSourceId: sourceId, name: "実績", type: "line", data: data.map((datum, index) => shown(datum, index, true)), symbolSize: 9, lineStyle: { color: colors.muted, width: 2 }, itemStyle: { color: colors.muted }, label: { show: true, position: "top", fontSize: 20 }, ...focusState("series", element) }] : []),
      { id: sourceId, deckSourceId: sourceId, name: "予測", type: "line", data: data.map((datum, index) => shown(datum, index, false)), symbolSize: 9,
        lineStyle: { type: "dashed", color: colors.accent, width: 3 }, itemStyle: { color: colors.accent },
        label: { show: true, position: "top", fontSize: 20, formatter: (params: { dataIndex: number; value: unknown }) => params.dataIndex < start ? "" : String(params.value) },
        markPoint: { silent: true, symbolSize: 0, label: { show: true, position: "right", color: colors.muted, fontSize: 20, formatter: `{c}${source.unit}` },
          data: [data.at(-1)?.low, data.at(-1)?.high].flatMap(value => value === undefined ? [] : [{ coord: [data.length - 1, value], value }]) },
        markLine: { silent: true, symbol: "none", lineStyle: { color: colors.muted, type: "dotted", width: 1 }, label: { show: false }, data: start > 0 ? [{ xAxis: start }] : [] },
        ...focusState("series", element) },
    ],
  };
}

function optionFor(source: DeckChartSource, element: HTMLElement): JsonObject {
  const basic = element.getAttribute("data-deck-basic-chart");
  if (basic === "bar" || basic === "line" || basic === "pie" || basic === "donut") {
    const colors = colorsFor(element), showLabel = element.getAttribute("data-deck-chart-labels") !== "false";
    const legend = { show: element.getAttribute("data-deck-chart-legend") !== "false", bottom: 0, textStyle: { color: colors.text, fontSize: 20 } };
    if (basic === "pie" || basic === "donut") return {
      ...baseOption(source, element), legend,
      series: [{ id: source.series[0].id, name: source.series[0].label, type: "pie", radius: basic === "pie" ? "64%" : ["38%", "64%"],
        data: seriesData({ ...source.series[0], data: source.series[0].data.filter(point => point.value !== undefined) }), label: { show: showLabel, color: colors.text, fontSize: 20, formatter: `{b}: {c}${source.unit}` }, ...focusState("self", element) }],
    };
    return {
      ...baseOption(source, element), ...axes(source, element), legend,
      grid: { left: 64, right: 32, top: 40, bottom: 72, containLabel: true },
      series: source.series.map(series => ({ id: series.id, name: series.label, type: basic,
        data: source.categories.map((label, index) => { const datum = series.data.find(point => point.x === index) ?? series.data.find(point => point.label === label); return datum ? { id: datum.id, name: label, value: datum.value ?? null } : null; }),
        connectNulls: false, label: { show: showLabel, position: "top", color: colors.text, fontSize: 20, formatter: `{c}${source.unit}` }, ...focusState("series", element) })),
    };
  }
  if (source.purpose === "chart-size") return barOption(source, element, false);
  if (source.purpose === "chart-rank") return barOption(source, element, true);
  if (source.purpose === "chart-time") return timeOption(source, element);
  if (source.purpose === "chart-composition") return compositionOption(source, element);
  if (source.purpose === "chart-change") return changeOption(source, element);
  if (source.purpose === "chart-contribution") return contributionOption(source, element);
  if (source.purpose === "chart-distribution") return distributionOption(source, element);
  if (source.purpose === "chart-correlation") return correlationOption(source, element);
  if (source.purpose === "chart-target") return targetOption(source, element);
  if (source.purpose === "chart-flow") return flowOption(source, element);
  if (source.purpose === "chart-heatmap") return heatmapOption(source, element);
  if (source.purpose === "chart-geography") return geographyOption(source, element);
  if (source.purpose === "chart-forecast") return forecastOption(source, element);
  throw new Error(`未対応のグラフ用途です: ${source.purpose}`);
}

function showError(figure: HTMLElement, message: string): void {
  const canvas = figure.querySelector<HTMLElement>(".dd-chart-canvas");
  if (!canvas) return;
  canvas.replaceChildren();
  const error = document.createElement("p");
  error.className = "dd-chart-error";
  error.textContent = message;
  canvas.append(error);
  figure.setAttribute("data-dd-chart-error", "");
}

export function renderDeckCharts(root: ParentNode = document): void {
  if (typeof echarts === "undefined") return;
  for (const figure of root.querySelectorAll<HTMLElement>("[data-dd-chart]")) {
    const canvas = figure.querySelector<HTMLElement>(".dd-chart-canvas");
    const json = figure.querySelector<HTMLScriptElement>('script[type="application/json"][data-dd-chart-source]');
    const fallback = figure.querySelector<HTMLElement>(".dd-chart-fallback");
    if (!canvas || !json || !fallback) { showError(figure, "グラフの材料または読み表示が不足しています"); continue; }
    let restoreLayout = () => {};
    try {
      const signature = JSON.stringify([json.textContent, colorsFor(figure), getComputedStyle(figure).fontFamily]);
      if (signatures.get(figure) === signature) continue;
      const source = readDeckChartSource(json.textContent ?? "");
      if (source.mapName && source.mapSvg) echarts.registerMap(source.mapName, { svg: source.mapSvg });
      const option = optionFor(source, figure);
      const optionSignature=JSON.stringify(option);
      // Background-only changes need not rebuild a transparent bar/line chart.
      // Keep its source/target metadata fresh even when the visible options agree.
      const previous=instances.get(figure);
      if(previous && optionSignatures.get(figure)===optionSignature && previous.source.mapSvg===source.mapSvg && echarts.getInstanceByDom(canvas)===previous.chart){instances.set(figure,{chart:previous.chart,source,option});signatures.set(figure,signature);continue;}
      // A newly inserted or remotely changed slide may not be selected yet.
      // Measure its real fixed paper without showing it or moving other slides.
      const frame = figure.closest<HTMLElement>("[data-deck-frame]");
      if (frame && getComputedStyle(frame).display === "none") {
        const originalStyle = frame.getAttribute("style");
        restoreLayout = () => { if (originalStyle === null) frame.removeAttribute("style"); else frame.setAttribute("style", originalStyle); };
        for (const [property, value] of Object.entries({ display: "block", position: "absolute", visibility: "hidden", "pointer-events": "none", width: `${DECK_CANVAS.width}px`, height: `${DECK_CANVAS.height}px` })) frame.style.setProperty(property, value, "important");
      }
      figure.setAttribute("data-dd-rendering", "");
      const chart = echarts.getInstanceByDom(canvas) ?? echarts.init(canvas, null, { renderer: "svg" });
      chart.setOption(option, true);
      instances.set(figure, { chart, source, option });
      signatures.set(figure, signature);
      optionSignatures.set(figure, optionSignature);
      figure.setAttribute("data-dd-rendered", "true");
      figure.removeAttribute("data-dd-rendering");
    } catch (error) { figure.removeAttribute("data-dd-rendering"); showError(figure, error instanceof Error ? error.message : "グラフを描けませんでした"); }
    finally { restoreLayout(); }
  }
}

export function resizeDeckCharts(root: ParentNode = document): void {
  for (const figure of root.querySelectorAll<HTMLElement>("[data-dd-chart]")) {
    const canvas = figure.querySelector<HTMLElement>(".dd-chart-canvas");
    // Hidden editor/presentation slides have no measurable box. Keep the last
    // real geometry instead of replacing it with ECharts' zero-size fallback.
    if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) instances.get(figure)?.chart.resize();
  }
}

export type DeckChartFocus = { kind: string; ids: readonly string[]; action: string };

/** Reset a chart once, then combine every selection belonging to the same presentation step. */
export function focusDeckChartTargets(figure: HTMLElement, actions: readonly DeckChartFocus[]): void {
  const state = instances.get(figure);
  if (!state) return;
  const selections = actions.filter((action) => action.action !== "overview" && action.ids.length > 0);
  const selectedRanges = new Set(selections.filter((action) => action.kind === "range").flatMap((action) => [...action.ids]));
  let option = state.option;
  if (selectedRanges.size > 0) {
    const baseSeries = Array.isArray(state.option.series) ? state.option.series.filter(objectOf) : [];
    const colors = colorsFor(figure);
    const overlays = state.source.series.map((series) => ({
      id: `deck-focus-range-${series.id}`,
      name: `${series.label}の選択範囲`,
      type: "line",
      data: series.data.map((datum) => datum.rangeId !== undefined && selectedRanges.has(datum.rangeId) ? datumValue(datum) : null),
      connectNulls: false,
      symbol: "circle",
      symbolSize: 14,
      showSymbol: true,
      silent: true,
      z: 100,
      lineStyle: { color: colors.accent, width: 4, opacity: 1 },
      itemStyle: { color: colors.accent, borderColor: colors.bg, borderWidth: 2, opacity: 1 },
      label: { show: false },
    })).filter((series) => series.data.some((value) => value !== null));
    option = { ...state.option, series: [...baseSeries, ...overlays] };
  }
  state.chart.setOption(option, true);
  state.chart.dispatchAction({ type: "downplay", seriesIndex: "all" });
  const seriesIds = new Set(selections.filter((action) => action.kind === "series").flatMap((action) => [...action.ids]));
  const pointIds = new Set(selections.filter((action) => action.kind === "point").flatMap((action) => [...action.ids]));
  const renderedSeries = Array.isArray(state.option.series) ? state.option.series.filter(objectOf) : [];
  const sourcePoints = new Map(state.source.series.flatMap(series => series.data.map(datum => [datum.id, datum] satisfies [string, ChartDatum])));
  for (const series of renderedSeries) {
    if (typeof series.id !== "string" || series.silent === true) continue;
    const sourceId = typeof series.deckSourceId === "string" ? series.deckSourceId : series.id;
    if (seriesIds.has(sourceId)) state.chart.dispatchAction({ type: "highlight", seriesId: series.id });
    const data = Array.isArray(series.data) ? series.data : [];
    data.forEach((value: unknown, dataIndex: number) => {
      if (!objectOf(value) || typeof value.id !== "string" || value.value === null) return;
      const datum = sourcePoints.get(value.id);
      if (datum && (pointIds.has(datum.id) || (datum.rangeId !== undefined && selectedRanges.has(datum.rangeId)))) {
        state.chart.dispatchAction({ type: "highlight", seriesId: series.id, dataIndex });
      }
    });
  }
}

/** Existing single-action callers share the same final-state renderer. */
export function focusDeckChart(figure: HTMLElement, kind: string, ids: readonly string[], action: string): void {
  focusDeckChartTargets(figure, [{ kind, ids, action }]);
}
