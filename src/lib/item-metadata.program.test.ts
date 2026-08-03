import { describe, expect, it } from 'vitest';
import {
  appendProgramWeek,
  buildTaskMetadataPayload,
  metadataFieldsFromParsed,
  stampProgramScheduleCardRefs,
} from '@/lib/item-metadata';

describe('program Phase M metadata', () => {
  it('round-trips capacity, focus, and card_ref', () => {
    const fields = metadataFieldsFromParsed({
      goal: 'Strength',
      capacity: 20,
      schedule: [
        {
          week: 1,
          focus: 'Base',
          days: [
            {
              day: 1,
              name: 'Squat day',
              card_ref: '11111111-1111-4111-8111-111111111111',
            },
          ],
        },
      ],
    });
    expect(fields.programCapacity).toBe('20');
    expect(fields.programSchedule[0]?.focus).toBe('Base');
    expect(fields.programSchedule[0]?.days[0]?.card_ref).toBe(
      '11111111-1111-4111-8111-111111111111',
    );

    const built = buildTaskMetadataPayload('program', fields, {}) as Record<string, unknown>;
    expect(built.capacity).toBe(20);
    const schedule = built.schedule as { focus?: string; days: { card_ref?: string }[] }[];
    expect(schedule[0]?.focus).toBe('Base');
    expect(schedule[0]?.days[0]?.card_ref).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('appendProgramWeek copies prior days without card_ref', () => {
    const next = appendProgramWeek([
      {
        week: 1,
        days: [{ day: 1, name: 'A', card_ref: '11111111-1111-4111-8111-111111111111' }],
      },
    ]);
    expect(next).toHaveLength(2);
    expect(next[1]?.week).toBe(2);
    expect(next[1]?.days[0]?.name).toBe('A');
    expect(next[1]?.days[0]?.card_ref).toBeUndefined();
  });

  it('stampProgramScheduleCardRefs matches by title', () => {
    const stamped = stampProgramScheduleCardRefs(
      [{ week: 1, days: [{ day: 1, name: 'Strength A' }] }],
      [{ id: 'tid', title: 'Strength A' }],
    );
    expect(stamped[0]?.days[0]?.card_ref).toBe('tid');
  });
});
