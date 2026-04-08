import { describe, expect, it } from 'vitest';
import {
  compareScheduledTime,
  formatScheduledTimeDisplay,
  scheduledTimeInputToPgValue,
  scheduledTimeToInputValue,
} from '@/lib/task-scheduled-time';
import { sortTasksByScheduledOn } from '@/lib/task-date-filter';
import type { TaskRow } from '@/types/database';

describe('scheduledTimeToInputValue', () => {
  it('normalizes Postgres time strings to HH:mm', () => {
    expect(scheduledTimeToInputValue('14:30:00')).toBe('14:30');
    expect(scheduledTimeToInputValue('9:05:00')).toBe('09:05');
  });

  it('returns empty for null/empty', () => {
    expect(scheduledTimeToInputValue(null)).toBe('');
    expect(scheduledTimeToInputValue('')).toBe('');
  });
});

describe('scheduledTimeInputToPgValue', () => {
  it('pads hours and appends seconds', () => {
    expect(scheduledTimeInputToPgValue('9:05')).toBe('09:05:00');
    expect(scheduledTimeInputToPgValue('14:30')).toBe('14:30:00');
  });
});

describe('formatScheduledTimeDisplay', () => {
  it('formats 12h clock', () => {
    expect(formatScheduledTimeDisplay('14:30:00')).toBe('2:30 PM');
    expect(formatScheduledTimeDisplay('09:00:00')).toBe('9:00 AM');
    expect(formatScheduledTimeDisplay('00:00:00')).toBe('12:00 AM');
    expect(formatScheduledTimeDisplay('12:00:00')).toBe('12:00 PM');
  });

  it('returns null when unset', () => {
    expect(formatScheduledTimeDisplay(null)).toBeNull();
  });
});

describe('compareScheduledTime', () => {
  it('orders earlier before later; nulls last', () => {
    expect(compareScheduledTime('09:00:00', '10:00:00')).toBeLessThan(0);
    expect(compareScheduledTime('10:00:00', '09:00:00')).toBeGreaterThan(0);
    expect(compareScheduledTime(null, '10:00:00')).toBeGreaterThan(0);
    expect(compareScheduledTime('10:00:00', null)).toBeLessThan(0);
  });
});

function taskStub(partial: Partial<TaskRow> & { id: string }): TaskRow {
  return {
    bubble_id: 'b1',
    title: 't',
    description: null,
    status: 'todo',
    position: 0,
    priority: 'medium',
    assigned_to: null,
    created_at: new Date().toISOString(),
    scheduled_on: null,
    scheduled_time: null,
    archived_at: null,
    subtasks: [],
    comments: [],
    activity_log: [],
    attachments: [],
    item_type: 'task',
    metadata: {},
    ...partial,
  } as TaskRow;
}

describe('sortTasksByScheduledOn', () => {
  it('tie-breaks same date by scheduled_time; null time last', () => {
    const a = taskStub({
      id: 'a',
      scheduled_on: '2026-04-05',
      scheduled_time: '14:00:00',
    });
    const b = taskStub({
      id: 'b',
      scheduled_on: '2026-04-05',
      scheduled_time: '09:00:00',
    });
    const c = taskStub({
      id: 'c',
      scheduled_on: '2026-04-05',
      scheduled_time: null,
    });
    const sorted = sortTasksByScheduledOn([a, b, c], 'asc').map((t) => t.id);
    expect(sorted).toEqual(['b', 'a', 'c']);
  });
});
