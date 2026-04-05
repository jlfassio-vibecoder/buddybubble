import { getCalendarDateInTimeZone } from '@/lib/workspace-calendar';

export type BoardColumnSlugRow = { slug: string };

/**
 * Returns true if this workspace's board has both `scheduled` and `today` columns (automation applies).
 */
export function boardSupportsScheduledToToday(
  columns: BoardColumnSlugRow[] | null | undefined,
): boolean {
  if (!columns?.length) return false;
  const slugs = new Set(columns.map((c) => c.slug));
  return slugs.has('scheduled') && slugs.has('today');
}

export type PromotionBatch = {
  workspaceId: string;
  calendarTimezone: string;
  localToday: string;
  bubbleIds: string[];
};

/**
 * Build batches of workspaces that need cron promotion: has both columns + bubbles to scan.
 */
export function buildPromotionBatches(
  workspaces: { id: string; calendar_timezone: string }[],
  boardColumnsByWorkspace: Map<string, BoardColumnSlugRow[]>,
  bubblesByWorkspace: Map<string, { id: string }[]>,
  now: Date = new Date(),
): PromotionBatch[] {
  const out: PromotionBatch[] = [];
  for (const w of workspaces) {
    const cols = boardColumnsByWorkspace.get(w.id);
    if (!boardSupportsScheduledToToday(cols)) continue;
    const bubbles = bubblesByWorkspace.get(w.id);
    if (!bubbles?.length) continue;
    const tz = w.calendar_timezone?.trim() || 'UTC';
    out.push({
      workspaceId: w.id,
      calendarTimezone: tz,
      localToday: getCalendarDateInTimeZone(tz, now),
      bubbleIds: bubbles.map((b) => b.id),
    });
  }
  return out;
}
