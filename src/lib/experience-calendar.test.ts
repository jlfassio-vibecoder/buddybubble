import { describe, expect, it } from 'vitest';
import type { TaskRow } from '@/types/database';
import { experienceEndYmd, experienceOverlapsYmdRange } from '@/lib/experience-calendar';

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
    program_id: null,
    program_session_key: null,
    attachments: [],
    item_type: 'task',
    metadata: {},
    visibility: 'private',
    ...partial,
  } as TaskRow;
}

describe('experienceEndYmd', () => {
  it('returns empty for non-experience item_type', () => {
    expect(
      experienceEndYmd(
        taskStub({ id: '1', item_type: 'task', scheduled_on: '2026-06-01', metadata: {} }),
      ),
    ).toBe('');
  });

  it('uses metadata.end_date when present (YYYY-MM-DD)', () => {
    expect(
      experienceEndYmd(
        taskStub({
          id: '1',
          item_type: 'experience',
          scheduled_on: '2026-06-01',
          metadata: { end_date: '2026-06-10' },
        }),
      ),
    ).toBe('2026-06-10');
  });

  it('falls back to scheduled_on when end_date is absent', () => {
    expect(
      experienceEndYmd(
        taskStub({
          id: '1',
          item_type: 'experience',
          scheduled_on: '2026-06-15',
          metadata: {},
        }),
      ),
    ).toBe('2026-06-15');
  });

  it('ignores end_date shorter than YYYY-MM-DD (falls back to start)', () => {
    expect(
      experienceEndYmd(
        taskStub({
          id: '1',
          item_type: 'experience',
          scheduled_on: '2026-06-15',
          metadata: { end_date: 'short' },
        }),
      ),
    ).toBe('2026-06-15');
  });
});

describe('experienceOverlapsYmdRange', () => {
  it('returns false for non-experience rows', () => {
    expect(
      experienceOverlapsYmdRange(
        taskStub({ id: '1', item_type: 'memory', scheduled_on: '2026-07-01' }),
        '2026-07-01',
        '2026-07-31',
      ),
    ).toBe(false);
  });

  it('returns false when scheduled_on is missing', () => {
    expect(
      experienceOverlapsYmdRange(
        taskStub({ id: '1', item_type: 'experience', scheduled_on: null }),
        '2026-07-01',
        '2026-07-31',
      ),
    ).toBe(false);
  });

  it('treats range as inclusive on both ends', () => {
    const t = taskStub({
      id: '1',
      item_type: 'experience',
      scheduled_on: '2026-07-10',
      metadata: { end_date: '2026-07-20' },
    });
    expect(experienceOverlapsYmdRange(t, '2026-07-10', '2026-07-20')).toBe(true);
    expect(experienceOverlapsYmdRange(t, '2026-07-01', '2026-07-10')).toBe(true);
    expect(experienceOverlapsYmdRange(t, '2026-07-20', '2026-07-31')).toBe(true);
  });

  it('returns false when span is entirely before the range', () => {
    const t = taskStub({
      id: '1',
      item_type: 'experience',
      scheduled_on: '2026-06-01',
      metadata: { end_date: '2026-06-05' },
    });
    expect(experienceOverlapsYmdRange(t, '2026-07-01', '2026-07-31')).toBe(false);
  });

  it('returns false when span is entirely after the range', () => {
    const t = taskStub({
      id: '1',
      item_type: 'experience',
      scheduled_on: '2026-08-10',
      metadata: { end_date: '2026-08-15' },
    });
    expect(experienceOverlapsYmdRange(t, '2026-07-01', '2026-07-31')).toBe(false);
  });
});
