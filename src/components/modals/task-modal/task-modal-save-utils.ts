import type { ItemType, TaskVisibility } from '@/types/database';
import type { TaskPriority } from '@/lib/task-priority';
import {
  alignStatusWithFutureSchedule,
  promotedStatusForScheduledOnToday,
} from '@/lib/workspace-calendar';
import { formatScheduledTimeDisplay, scheduledTimeInputToPgValue } from '@/lib/task-scheduled-time';
import type { TaskActivityEntry } from '@/types/task-modal';
import { appendActivityForFieldChange } from '@/types/task-modal';

/** Snapshot used for dirty checks and save-time activity diffing (mirrors `originalRef` in TaskModal). */
export type TaskModalOriginalSnapshot = {
  title: string;
  description: string;
  status: string;
  priority: TaskPriority;
  scheduledOn: string | null;
  /** Normalized `HH:mm` or null */
  scheduledTime: string | null;
  itemType: ItemType;
  metadataJson: string;
  visibility: TaskVisibility;
  assignedTo: string | null;
  /** Card-based live video toggle (parallel to `metadata.live_session`). */
  liveStreamEnabled?: boolean;
};

export function parseScheduledDateFromInput(scheduledOn: string): string | null {
  const t = scheduledOn.trim();
  return t ? t.slice(0, 10) : null;
}

/** Time portion for save/create when a scheduled date is set; otherwise null. */
export function parseTimeHmFromScheduledInputs(
  scheduledOnValue: string | null,
  scheduledTime: string,
): string | null {
  if (!scheduledOnValue) return null;
  const tm = scheduledTime.trim();
  return tm ? tm.slice(0, 5) : null;
}

export function toPgScheduledTime(newTimeHm: string | null): string | null {
  return newTimeHm ? scheduledTimeInputToPgValue(newTimeHm) : null;
}

export function computeSchedulePatchFlags(
  orig: TaskModalOriginalSnapshot | null,
  scheduledOnValue: string | null,
  newTimeHm: string | null,
): { schedChanged: boolean; schedTimeChanged: boolean } {
  return {
    schedChanged: orig != null && (scheduledOnValue ?? null) !== (orig.scheduledOn ?? null),
    schedTimeChanged: orig != null && (newTimeHm ?? null) !== (orig.scheduledTime ?? null),
  };
}

export function computeEffectiveStatusForSchedule(args: {
  currentStatus: string;
  scheduledOnYmd: string | null;
  calendarTimezone: string | null;
  hasTodayBoardColumn: boolean;
  hasScheduledBoardColumn: boolean;
  itemType: ItemType;
}): string {
  let effectiveStatus = promotedStatusForScheduledOnToday({
    currentStatus: args.currentStatus,
    scheduledOnYmd: args.scheduledOnYmd,
    calendarTimezone: args.calendarTimezone,
    hasTodayBoardColumn: args.hasTodayBoardColumn,
  });
  effectiveStatus = alignStatusWithFutureSchedule({
    status: effectiveStatus,
    scheduledOnYmd: args.scheduledOnYmd,
    calendarTimezone: args.calendarTimezone,
    hasScheduledBoardColumn: args.hasScheduledBoardColumn,
    itemType: args.itemType,
  });
  return effectiveStatus;
}

/** Insert retry path when `scheduled_on` column is missing (DB cannot persist schedule). */
export function computeStatusWhenCreateScheduledDateUnsupported(args: {
  currentStatus: string;
  calendarTimezone: string | null;
  hasTodayBoardColumn: boolean;
}): string {
  return promotedStatusForScheduledOnToday({
    currentStatus: args.currentStatus,
    scheduledOnYmd: null,
    calendarTimezone: args.calendarTimezone,
    hasTodayBoardColumn: args.hasTodayBoardColumn,
  });
}

/**
 * Update retry path when `scheduled_on` is missing — only DB-backed date drives "today" promotion
 * (matches inline comment in TaskModal save path).
 */
export function computeStatusWhenUpdateScheduledDateUnsupported(args: {
  currentStatus: string;
  persistedScheduledOnYmd: string | null;
  calendarTimezone: string | null;
  hasTodayBoardColumn: boolean;
}): string {
  return promotedStatusForScheduledOnToday({
    currentStatus: args.currentStatus,
    scheduledOnYmd: args.persistedScheduledOnYmd,
    calendarTimezone: args.calendarTimezone,
    hasTodayBoardColumn: args.hasTodayBoardColumn,
  });
}

export function buildActivityLogForCoreFieldChanges(args: {
  orig: TaskModalOriginalSnapshot | null;
  activityLog: TaskActivityEntry[];
  uid: string | null;
  titleTrimmed: string;
  description: string;
  effectiveStatus: string;
  priority: TaskPriority;
  visibility: TaskVisibility;
  scheduledOnValue: string | null;
  newTimeHm: string | null;
  assignedTo: string | null;
}): TaskActivityEntry[] {
  const {
    orig,
    activityLog,
    uid,
    titleTrimmed,
    description,
    effectiveStatus,
    priority,
    visibility,
    scheduledOnValue,
    newTimeHm,
    assignedTo,
  } = args;
  let nextActivity = [...activityLog];
  if (!orig) return nextActivity;

  if (titleTrimmed !== orig.title) {
    nextActivity = appendActivityForFieldChange(nextActivity, {
      userId: uid,
      field: 'title',
      from: orig.title,
      to: titleTrimmed,
    });
  }
  if ((description ?? '').trim() !== (orig.description ?? '').trim()) {
    nextActivity = appendActivityForFieldChange(nextActivity, {
      userId: uid,
      field: 'description',
      from: orig.description ?? '',
      to: description ?? '',
    });
  }
  if (effectiveStatus !== orig.status) {
    nextActivity = appendActivityForFieldChange(nextActivity, {
      userId: uid,
      field: 'status',
      from: orig.status,
      to: effectiveStatus,
    });
  }
  if (priority !== orig.priority) {
    nextActivity = appendActivityForFieldChange(nextActivity, {
      userId: uid,
      field: 'priority',
      from: orig.priority,
      to: priority,
    });
  }
  if (visibility !== orig.visibility) {
    nextActivity = appendActivityForFieldChange(nextActivity, {
      userId: uid,
      field: 'visibility',
      from: orig.visibility,
      to: visibility,
    });
  }
  const nextSched = scheduledOnValue;
  const prevSched = orig.scheduledOn;
  if (nextSched !== prevSched) {
    nextActivity = appendActivityForFieldChange(nextActivity, {
      userId: uid,
      field: 'scheduled_on',
      from: prevSched ?? '',
      to: nextSched ?? '',
    });
  }
  const prevTimeHm = orig.scheduledTime ?? null;
  if ((newTimeHm ?? null) !== (prevTimeHm ?? null)) {
    nextActivity = appendActivityForFieldChange(nextActivity, {
      userId: uid,
      field: 'scheduled_time',
      from: prevTimeHm ? (formatScheduledTimeDisplay(`${prevTimeHm}:00`) ?? prevTimeHm) : '',
      to: newTimeHm
        ? (formatScheduledTimeDisplay(scheduledTimeInputToPgValue(newTimeHm)) ?? newTimeHm)
        : '',
    });
  }
  const nextAssign = assignedTo ?? null;
  const prevAssign = orig.assignedTo ?? null;
  if (nextAssign !== prevAssign) {
    nextActivity = appendActivityForFieldChange(nextActivity, {
      userId: uid,
      field: 'assigned_to',
      from: prevAssign ?? '',
      to: nextAssign ?? '',
    });
  }
  return nextActivity;
}

/** Normalized schedule fields for task insert (create path). */
export function parseCreateScheduleInputs(
  scheduledOn: string,
  scheduledTime: string,
): {
  sched: string | null;
  createTimeHm: string | null;
  scheduledTimeInsert: string | null;
} {
  const sched = parseScheduledDateFromInput(scheduledOn);
  const createTimeHm = sched && scheduledTime.trim() ? scheduledTime.trim().slice(0, 5) : null;
  const scheduledTimeInsert = createTimeHm ? scheduledTimeInputToPgValue(createTimeHm) : null;
  return { sched, createTimeHm, scheduledTimeInsert };
}
