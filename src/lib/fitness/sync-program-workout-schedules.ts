import { addDays, format, parseISO } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgramWeek } from '@/lib/item-metadata';
import { asProgramSchedule, parseTaskMetadata } from '@/lib/item-metadata';
import { getProgramDaysForWeek } from '@/lib/fitness/program-schedule';
import { resolveTaskStatusForScheduleFields } from '@/lib/workspace-calendar';

/**
 * Week-1 session keys (trimmed `ProgramDay.name`) → calendar YMD.
 * First day in plan order is anchored to `anchorYmd`; other days use Mon–Sun offsets (1–7).
 */
export function buildWeekOneSessionYmdMap(
  anchorYmd: string,
  schedule: ProgramWeek[],
): Map<string, string> {
  const map = new Map<string, string>();
  const days = getProgramDaysForWeek(schedule, 1);
  if (days.length === 0 || !anchorYmd.trim()) return map;

  const trimmedAnchor = anchorYmd.trim().slice(0, 10);
  const first = days[0]!;
  const anchorDate = parseISO(`${trimmedAnchor}T12:00:00`);

  for (const d of days) {
    const key = d.name.trim();
    if (!key) continue;
    const offsetDays = (d.day - first.day + 7) % 7;
    const ymd = format(addDays(anchorDate, offsetDays), 'yyyy-MM-dd');
    if (!map.has(key)) map.set(key, ymd);
  }
  return map;
}

export type SyncProgramLinkedWorkoutSchedulesParams = {
  supabase: SupabaseClient;
  programTaskId: string;
  calendarTimezone: string | null | undefined;
  hasTodayBoardColumn: boolean;
  hasScheduledBoardColumn: boolean;
};

/**
 * Mirrors program `scheduled_on` / `scheduled_time` onto linked `workout` tasks (week 1 only,
 * by `program_session_key`). When program has no start date, clears schedule fields on those tasks.
 */
export async function syncProgramLinkedWorkoutSchedules(
  params: SyncProgramLinkedWorkoutSchedulesParams,
): Promise<{ error?: string }> {
  const {
    supabase,
    programTaskId,
    calendarTimezone,
    hasTodayBoardColumn,
    hasScheduledBoardColumn,
  } = params;

  const { data: programRow, error: programErr } = await supabase
    .from('tasks')
    .select('scheduled_on, scheduled_time, metadata')
    .eq('id', programTaskId)
    .eq('item_type', 'program')
    .maybeSingle();

  if (programErr) return { error: programErr.message };
  if (!programRow) return {};

  const scheduledOn =
    programRow.scheduled_on != null && String(programRow.scheduled_on).trim() !== ''
      ? String(programRow.scheduled_on).trim().slice(0, 10)
      : null;
  const scheduledTime = (programRow as { scheduled_time?: string | null }).scheduled_time ?? null;

  const { data: workoutRows, error: wErr } = await supabase
    .from('tasks')
    .select('id, program_session_key, status')
    .eq('program_id', programTaskId)
    .eq('item_type', 'workout');

  if (wErr) return { error: wErr.message };
  const rows = (workoutRows ?? []) as {
    id: string;
    program_session_key: string | null;
    status: string | null;
  }[];

  if (rows.length === 0) return {};

  if (!scheduledOn) {
    const { error: clearErr } = await supabase
      .from('tasks')
      .update({ scheduled_on: null, scheduled_time: null })
      .eq('program_id', programTaskId)
      .eq('item_type', 'workout');
    if (clearErr) return { error: clearErr.message };
    return {};
  }

  const meta = parseTaskMetadata((programRow as { metadata?: unknown }).metadata) as Record<
    string,
    unknown
  >;
  const schedule = asProgramSchedule(meta.schedule);
  const ymdBySession = buildWeekOneSessionYmdMap(scheduledOn, schedule);

  for (const row of rows) {
    const key = row.program_session_key?.trim() ?? '';
    if (!key) continue;
    const ymd = ymdBySession.get(key);
    if (!ymd) continue;

    const effectiveStatus = resolveTaskStatusForScheduleFields({
      currentStatus: row.status ?? 'todo',
      scheduledOnYmd: ymd,
      calendarTimezone,
      hasTodayBoardColumn,
      hasScheduledBoardColumn,
      itemType: 'workout',
    });

    const { error: uErr } = await supabase
      .from('tasks')
      .update({
        scheduled_on: ymd,
        scheduled_time: scheduledTime,
        status: effectiveStatus,
      })
      .eq('id', row.id);
    if (uErr) return { error: uErr.message };
  }

  return {};
}
