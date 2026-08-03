import { describe, expect, it } from 'vitest';
import type { ProgramWeek } from '@/lib/item-metadata';
import { buildProgramWeekCardModel, buildProgramWeekCards } from '@/lib/fitness/program-schedule';

const threeDayWeek: ProgramWeek = {
  week: 1,
  days: [
    { day: 1, name: 'Strength A — Squat', workout_type: 'Strength', duration_min: 45 },
    { day: 3, name: 'Conditioning — EMOM' },
    { day: 5, name: 'Strength B — Deadlift' },
  ],
};

describe('buildProgramWeekCardModel', () => {
  it('fills Mon–Sun with Rest for missing days and counts workouts', () => {
    const model = buildProgramWeekCardModel(threeDayWeek);

    expect(model.weekNumber).toBe(1);
    expect(model.sessionCount).toBe(3);
    expect(model.repeatingMeta).toBeUndefined();
    expect(model.rows).toHaveLength(7);
    expect(model.rows[0]).toEqual({
      dayLabel: 'Mon',
      dayNumber: 1,
      title: 'Strength A — Squat',
      kind: 'workout',
      subtitle: 'Strength · 45 min',
    });
    expect(model.rows[1]).toEqual({
      dayLabel: 'Tue',
      dayNumber: 2,
      title: 'Rest',
      kind: 'rest',
    });
    expect(model.rows[2]).toMatchObject({
      dayLabel: 'Wed',
      title: 'Conditioning — EMOM',
      kind: 'workout',
    });
    expect(model.rows[3]?.kind).toBe('rest');
    expect(model.rows[4]?.kind).toBe('workout');
    expect(model.rows[5]?.kind).toBe('rest');
    expect(model.rows[6]?.kind).toBe('rest');
  });

  it('sets repeating meta for a single template when durationWeeks > 1', () => {
    const model = buildProgramWeekCardModel(threeDayWeek, {
      durationWeeks: 8,
      isRepeatingTemplate: true,
    });
    expect(model.repeatingMeta).toBe('Repeats · 8 weeks');
  });

  it('omits repeating meta when duration is 1 or not repeating', () => {
    expect(
      buildProgramWeekCardModel(threeDayWeek, {
        durationWeeks: 1,
        isRepeatingTemplate: true,
      }).repeatingMeta,
    ).toBeUndefined();
    expect(
      buildProgramWeekCardModel(threeDayWeek, {
        durationWeeks: 8,
        isRepeatingTemplate: false,
      }).repeatingMeta,
    ).toBeUndefined();
  });
});

describe('buildProgramWeekCards', () => {
  it('returns one card per stored week without cloning for duration', () => {
    const cards = buildProgramWeekCards([threeDayWeek], 8);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.repeatingMeta).toBe('Repeats · 8 weeks');
    expect(cards[0]?.sessionCount).toBe(3);
  });

  it('maps multi-week schedules without repeating meta', () => {
    const schedule: ProgramWeek[] = [
      threeDayWeek,
      {
        week: 2,
        days: [{ day: 2, name: 'Active recovery' }],
      },
    ];
    const cards = buildProgramWeekCards(schedule, 8);
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.repeatingMeta === undefined)).toBe(true);
    expect(cards[1]?.weekNumber).toBe(2);
    expect(cards[1]?.sessionCount).toBe(1);
    expect(cards[1]?.rows[1]).toMatchObject({
      dayLabel: 'Tue',
      title: 'Active recovery',
      kind: 'workout',
    });
  });

  it('renders empty-day weeks as Rest rows; empty schedule returns []', () => {
    const emptyWeek = buildProgramWeekCards([{ week: 1, days: [] }], 4);
    expect(emptyWeek).toHaveLength(1);
    expect(emptyWeek[0]?.sessionCount).toBe(0);
    expect(emptyWeek[0]?.rows.every((r) => r.kind === 'rest')).toBe(true);
    expect(buildProgramWeekCards([], 4)).toEqual([]);
  });
});
