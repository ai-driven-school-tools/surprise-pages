// i18n-keep-file: 保存済みページに貼る実行部（src/templates/deck-design.html）に束ねる。1 字も変えない
import { z } from "zod";

const number = z.number().finite();
const datumSchema = z.object({
  id: z.string().min(1), label: z.string().min(1),
  value: number.optional(), x: z.union([number, z.string()]).optional(), y: z.union([number, z.string()]).optional(),
  low: number.optional(), q1: number.optional(), median: number.optional(), q3: number.optional(), high: number.optional(),
  target: number.optional(), rangeId: z.string().min(1).optional(), isTotal: z.boolean().optional(),
});
const seriesSchema = z.object({ id: z.string().min(1), label: z.string().min(1), data: z.array(datumSchema).min(1) });
const sourceSchema = z.object({
  purpose: z.string().min(1), unit: z.string().default(""), categories: z.array(z.string()).default([]),
  series: z.array(seriesSchema).min(1),
  links: z.array(z.object({ id: z.string().min(1), source: z.string().min(1), target: z.string().min(1), value: number.nonnegative() })).default([]),
  xAxisLabel: z.string().min(1).optional(), yAxisLabel: z.string().min(1).optional(), forecastFrom: z.string().min(1).optional(),
  mapName: z.string().min(1).optional(), mapSvg: z.string().min(1).optional(), ariaDescription: z.string().min(1),
});

export type ChartDatum = z.infer<typeof datumSchema>;
export type ChartSeries = z.infer<typeof seriesSchema>;
export type DeckChartSource = z.infer<typeof sourceSchema>;

/** Validate the authored data before rendering; never silently lose an edge or range. */
export function readDeckChartSource(text: string): DeckChartSource {
  const source = sourceSchema.parse(JSON.parse(text));
  const points = source.series.flatMap(series => series.data);
  if (source.purpose === "chart-forecast" && source.series.length !== 1) throw new Error("予測は一つの指標ごとに示してください。複数の指標は図を分けてください");
  for (const [name, ids] of [
    ["系列", source.series.map(series => series.id)], ["点", points.map(point => point.id)], ["流れ", source.links.map(link => link.id)],
  ] satisfies [string, string[]][]) {
    if (new Set(ids).size !== ids.length) throw new Error(`${name}の目印が重複しています`);
  }
  if (source.forecastFrom !== undefined && !points.some(point => point.id === source.forecastFrom)) throw new Error("予測を始める点が見つかりません");
  for (const point of points) {
    if (source.purpose === "chart-forecast" && (point.value === undefined || (point.low !== undefined && point.low > point.value) || (point.high !== undefined && point.high < point.value))) throw new Error("予測の中心値と、その上下にある想定幅を確認してください");
    if (point.low !== undefined && point.high !== undefined && (point.low > point.high || (point.value !== undefined && (point.value < point.low || point.value > point.high)))) throw new Error("予測の下限・中心・上限の順番を確認してください");
    if (source.purpose === "chart-distribution") {
      const values = [point.low, point.q1, point.median, point.q3, point.high];
      if (values.some(value => value === undefined) || values.some((value, index) => index > 0 && value !== undefined && value < (values[index - 1] ?? value))) throw new Error("分布の最小値・四分位・中央値・最大値を確認してください");
    }
  }
  if (source.purpose === "chart-flow") {
    const ids = new Set(points.map(point => point.id));
    const endpoint = (value: string): string => {
      if (ids.has(value)) {
        if (points.some(point => point.label === value && point.id !== value)) throw new Error(`流れの目印と別の点の名前が重複しています: ${value}`);
        return value;
      }
      // Earlier examples used a visible name. Accept only an unambiguous name;
      // current authors use IDs so a renamed label cannot disconnect the flow.
      const matches = points.filter(point => point.label === value);
      if (matches.length !== 1) throw new Error(`流れの接続先が見つからないか、名前が重複しています: ${value}`);
      return matches[0].id;
    };
    source.links = source.links.map(link => ({ ...link, source: endpoint(link.source), target: endpoint(link.target) }));
    if (!source.links.length) throw new Error("流量のつながりがありません");
    const degrees = new Map(points.map(point => [point.id, 0]));
    source.links.forEach(link => degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1));
    const ready = points.filter(point => degrees.get(point.id) === 0).map(point => point.id);
    for (let at = 0; at < ready.length; at++) for (const link of source.links.filter(link => link.source === ready[at])) {
      degrees.set(link.target, (degrees.get(link.target) ?? 0) - 1);
      if (degrees.get(link.target) === 0) ready.push(link.target);
    }
    if (ready.length !== points.length) throw new Error("流量図には循環を含められません。戻り道は関係図で示してください");
  }
  return source;
}
