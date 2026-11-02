import type { DeckFlowLayoutOptions } from "./flow-layout";

export type DeckFlowTimeTask = { id: string; label: string; section: string; start: number; end: number };
/** start/end are UTC midnight for the authored local calendar day, not instants in time. */
export type DeckFlowTimeSource = { title: string; tasks: DeckFlowTimeTask[] };
export type DeckFlowTimeLayout = {
  width: number; height: number; title: string;
  plot: { x: number; y: number; width: number; height: number };
  tasks: (DeckFlowTimeTask & { x: number; y: number; width: number; height: number; labelX: number; labelY: number; labelWidth: number })[];
  sections: { label: string; x: number; y: number }[];
  ticks: { time: number; x: number; label: string }[];
};
export const DECK_FLOW_TIME_METRICS = { taskFontSize: 28, sectionFontSize: 20, axisFontSize: 20, labelWidth: 220, rowHeight: 56, sectionHeight: 36, barHeight: 24, margin: 32 };
const M = DECK_FLOW_TIME_METRICS;
const DAY = 86400000;

/** Calendar duration controls only bar length; rows and lettering never shrink to fit. */
export function layoutDeckFlowTime(source: DeckFlowTimeSource, options: DeckFlowLayoutOptions): DeckFlowTimeLayout | null {
  if (!source.tasks.length || source.tasks.length > 24 || !Number.isFinite(options.width) || !Number.isFinite(options.height)) return null;
  if (new Set(source.tasks.map(task => task.id)).size !== source.tasks.length || source.tasks.some(task => !Number.isFinite(task.start) || !Number.isFinite(task.end) || task.end <= task.start)) return null;
  const start = Math.min(...source.tasks.map(task => task.start));
  const end = Math.max(...source.tasks.map(task => task.end));
  const span = end - start;
  const measure = options.measureText ?? ((text: string, fontSize: number) => [...text].length * fontSize);
  if (source.tasks.some(task => measure(task.label, M.taskFontSize) > M.labelWidth - 16 || measure(task.section, M.sectionFontSize) > M.labelWidth)) return null;
  const plotX = M.margin + M.labelWidth;
  const plotWidth = options.width - plotX - M.margin;
  if (plotWidth < 240 || options.height < 160) return null;
  const tasks: DeckFlowTimeLayout["tasks"] = [];
  const sections: DeckFlowTimeLayout["sections"] = [];
  let y = M.margin;
  let previousSection: string | null = null;
  for (const task of source.tasks) {
    if (task.section !== previousSection && task.section) {
      sections.push({ label: task.section, x: M.margin, y: y + 20 });
      y += M.sectionHeight;
    }
    previousSection = task.section;
    const width = (task.end - task.start) / span * plotWidth;
    if (width < 3) return null;
    tasks.push({ ...task, x: plotX + (task.start - start) / span * plotWidth, y: y + (M.rowHeight - M.barHeight) / 2, width, height: M.barHeight, labelX: plotX - 16, labelY: y + M.rowHeight / 2, labelWidth: M.labelWidth - 16 });
    y += M.rowHeight;
  }
  const axisHeight = 40;
  if (y + axisHeight + M.margin > options.height) return null;
  const maxIntervals = Math.max(1, Math.floor(plotWidth / 112));
  const intervalDays = Math.max(1, Math.ceil(span / DAY / maxIntervals));
  const ticks: DeckFlowTimeLayout["ticks"] = [];
  for (let time = start; time <= end; time += intervalDays * DAY) {
    const date = new Date(time);
    ticks.push({ time, x: plotX + (time - start) / span * plotWidth, label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}` });
  }
  const last = ticks[ticks.length - 1];
  if (last && last.time !== end && plotX + plotWidth - last.x >= 100) {
    const date = new Date(end);
    ticks.push({ time: end, x: plotX + plotWidth, label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}` });
  }
  return { width: options.width, height: options.height, title: source.title, plot: { x: plotX, y: M.margin, width: plotWidth, height: y - M.margin }, tasks, sections, ticks };
}
