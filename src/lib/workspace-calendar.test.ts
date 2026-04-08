import { describe, expect, it } from 'vitest';
import {
  alignStatusWithFutureSchedule,
  getCalendarDateInTimeZone,
  promotedStatusForScheduledOnToday,
  scheduledOnRelativeToWorkspaceToday,
} from '@/lib/workspace-calendar';

describe('getCalendarDateInTimeZone', () => {
  it('returns YYYY-MM-DD for America/New_York (DST)', () => {
    const d = new Date('2026-07-04T07:00:00.000Z');
    expect(getCalendarDateInTimeZone('America/New_York', d)).toBe('2026-07-04');
  });

  it('matches UTC date for UTC zone', () => {
    const d = new Date('2026-01-10T12:00:00.000Z');
    expect(getCalendarDateInTimeZone('UTC', d)).toBe('2026-01-10');
  });
});

describe('scheduledOnRelativeToWorkspaceToday', () => {
  it('classifies relative to workspace today', () => {
    const now = new Date('2026-03-20T15:00:00.000Z');
    expect(scheduledOnRelativeToWorkspaceToday('2026-03-19', 'UTC', now)).toBe('past');
    expect(scheduledOnRelativeToWorkspaceToday('2026-03-20', 'UTC', now)).toBe('today');
    expect(scheduledOnRelativeToWorkspaceToday('2026-03-21', 'UTC', now)).toBe('future');
    expect(scheduledOnRelativeToWorkspaceToday(null, 'UTC', now)).toBe('none');
  });
});

describe('promotedStatusForScheduledOnToday', () => {
  it('moves scheduled → today when date is workspace today and board has today column', () => {
    const now = new Date('2026-03-20T15:00:00.000Z');
    expect(
      promotedStatusForScheduledOnToday({
        currentStatus: 'scheduled',
        scheduledOnYmd: '2026-03-20',
        calendarTimezone: 'UTC',
        hasTodayBoardColumn: true,
        now,
      }),
    ).toBe('today');
  });

  it('leaves status when date is not today', () => {
    const now = new Date('2026-03-20T15:00:00.000Z');
    expect(
      promotedStatusForScheduledOnToday({
        currentStatus: 'scheduled',
        scheduledOnYmd: '2026-03-21',
        calendarTimezone: 'UTC',
        hasTodayBoardColumn: true,
        now,
      }),
    ).toBe('scheduled');
  });

  it('no-ops without today column', () => {
    const now = new Date('2026-03-20T15:00:00.000Z');
    expect(
      promotedStatusForScheduledOnToday({
        currentStatus: 'scheduled',
        scheduledOnYmd: '2026-03-20',
        calendarTimezone: 'UTC',
        hasTodayBoardColumn: false,
        now,
      }),
    ).toBe('scheduled');
  });
});

describe('alignStatusWithFutureSchedule', () => {
  const now = new Date('2026-04-07T12:00:00.000Z');

  it('moves planning/todo/today → scheduled for a future date when board has scheduled column', () => {
    expect(
      alignStatusWithFutureSchedule({
        status: 'planning',
        scheduledOnYmd: '2026-07-04',
        calendarTimezone: 'UTC',
        hasScheduledBoardColumn: true,
        now,
      }),
    ).toBe('scheduled');
    expect(
      alignStatusWithFutureSchedule({
        status: 'today',
        scheduledOnYmd: '2026-07-04',
        calendarTimezone: 'UTC',
        hasScheduledBoardColumn: true,
        now,
      }),
    ).toBe('scheduled');
  });

  it('no-ops without scheduled column or non-future date', () => {
    expect(
      alignStatusWithFutureSchedule({
        status: 'planning',
        scheduledOnYmd: '2026-07-04',
        calendarTimezone: 'UTC',
        hasScheduledBoardColumn: false,
        now,
      }),
    ).toBe('planning');
    expect(
      alignStatusWithFutureSchedule({
        status: 'planning',
        scheduledOnYmd: '2026-04-07',
        calendarTimezone: 'UTC',
        hasScheduledBoardColumn: true,
        now,
      }),
    ).toBe('planning');
  });
});
