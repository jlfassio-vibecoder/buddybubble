import { describe, expect, it } from 'vitest';
import { buildTaskMetadataPayload, metadataFieldsFromParsed } from '@/lib/item-metadata';

describe('Phase K managed metadata round-trips', () => {
  it('idea effort / impact / tags', () => {
    const fields = metadataFieldsFromParsed({
      effort: 'low',
      impact: 'HIGH',
      tags: ['Community', 'Evening'],
      votes: 2,
      voted_by: ['u1', 'u2'],
    });
    expect(fields.ideaEffort).toBe('Low');
    expect(fields.ideaImpact).toBe('High');
    expect(fields.ideaTags).toEqual(['Community', 'Evening']);

    const built = buildTaskMetadataPayload('idea', fields, {}) as Record<string, unknown>;
    expect(built.effort).toBe('Low');
    expect(built.impact).toBe('High');
    expect(built.tags).toEqual(['Community', 'Evening']);
  });

  it('event cost', () => {
    const fields = metadataFieldsFromParsed({ cost: 'Free', location: 'Park' });
    expect(fields.eventCost).toBe('Free');
    const built = buildTaskMetadataPayload('event', fields, {}) as Record<string, unknown>;
    expect(built.cost).toBe('Free');
    expect(built.location).toBe('Park');
  });

  it('workout target_rpe', () => {
    const fields = metadataFieldsFromParsed({ target_rpe: 8, workout_type: 'Strength' });
    expect(fields.workoutTargetRpe).toBe('8');
    const built = buildTaskMetadataPayload('workout', fields, {}) as Record<string, unknown>;
    expect(built.target_rpe).toBe(8);
    expect(built.session_rpe).toBeUndefined();
  });

  it('memory location', () => {
    const fields = metadataFieldsFromParsed({ location: 'Riverside Park', caption: 'Day' });
    expect(fields.memoryLocation).toBe('Riverside Park');
    const built = buildTaskMetadataPayload('memory', fields, {}) as Record<string, unknown>;
    expect(built.location).toBe('Riverside Park');
    expect(built.caption).toBe('Day');
  });

  it('program days_per_week / level', () => {
    const fields = metadataFieldsFromParsed({
      days_per_week: 3,
      level: 'Intermediate',
      goal: 'Strength',
    });
    expect(fields.programDaysPerWeek).toBe('3');
    expect(fields.programLevel).toBe('intermediate');
    const built = buildTaskMetadataPayload('program', fields, {}) as Record<string, unknown>;
    expect(built.days_per_week).toBe(3);
    expect(built.level).toBe('intermediate');
  });

  it('workout_log session scalars + mood; prefers completion over completion_pct', () => {
    const fields = metadataFieldsFromParsed({
      session_rpe: 7,
      completion_pct: 80,
      mood: '🔥',
      duration_min: 40,
    });
    expect(fields.workoutLogSessionRpe).toBe('7');
    expect(fields.workoutLogCompletion).toBe('80');
    expect(fields.workoutLogMood).toBe('🔥');

    const built = buildTaskMetadataPayload('workout_log', fields, {
      completion_pct: 80,
    }) as Record<string, unknown>;
    expect(built.session_rpe).toBe(7);
    expect(built.completion).toBe(80);
    expect(built.completion_pct).toBeUndefined();
    expect(built.mood).toBe('🔥');
    expect(built.target_rpe).toBeUndefined();
  });
});
