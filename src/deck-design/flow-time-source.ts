import { z } from "zod";
import type { DeckFlowTimeSource } from "../lib/deck/design/flow-time";
import { deckMermaidValue, parseDeckMermaid } from "./flow-source";

const taskSchema = z.object({
  id: z.string().min(1), task: z.string().trim().min(1), section: z.string(),
  startTime: z.date(), endTime: z.date(), processed: z.literal(true),
  classes: z.array(z.unknown()).max(0),
  active: z.literal(false).optional(), done: z.literal(false).optional(), crit: z.literal(false).optional(), milestone: z.literal(false).optional(),
});
function calendarDay(date: Date): number { return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()); }

/** Resolve dates using the same pinned parser as the graph adapter; do not implement date syntax twice. */
export async function readDeckFlowTimeSource(mermaid: unknown, source: string): Promise<DeckFlowTimeSource | null> {
  if (/^\s*(?:click|excludes|includes|todayMarker|axisFormat|tickInterval|weekday|weekend|inclusiveEndDates|topAxis|displayMode)\b/im.test(source)) return null;
  const diagram = await parseDeckMermaid(mermaid, source);
  if (!diagram || diagram.type !== "gantt") return null;
  try {
    if (deckMermaidValue(diagram.db, "getDateFormat") !== "YYYY-MM-DD") return null;
    const title = z.string().safeParse(deckMermaidValue(diagram.db, "getDiagramTitle"));
    const parsed = z.array(taskSchema).min(1).max(24).safeParse(deckMermaidValue(diagram.db, "getTasks"));
    if (!title.success || !parsed.success || /<[^>]*>|`/.test(title.data)) return null;
    const tasks: DeckFlowTimeSource["tasks"] = [];
    for (const task of parsed.data) {
      if (/<[^>]*>|`/.test(task.task + task.section) || task.startTime.getHours() || task.startTime.getMinutes() || task.endTime.getHours() || task.endTime.getMinutes()) return null;
      const start = calendarDay(task.startTime), end = calendarDay(task.endTime);
      if (end <= start) return null;
      tasks.push({ id: task.id, label: task.task, section: task.section, start, end });
    }
    if (new Set(tasks.map(task => task.id)).size !== tasks.length) return null;
    return { title: title.data, tasks };
  } catch { return null; }
}
