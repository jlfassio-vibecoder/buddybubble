import { describe, expect, it } from 'vitest';
import { mergeOutlineMetadataOntoFormSavePayload } from '@/lib/agents/coach/coach-outline-metadata';

describe('mergeOutlineMetadataOntoFormSavePayload', () => {
  it('keeps live form fields while applying outline keys from override', () => {
    const formMetadata = {
      workout_type: 'Strength',
      duration_min: 45,
      coach_workout_outline: [{ name: 'Old block' }],
      coach_outline_status: 'ready',
    };
    const outlineSave = {
      workout_type: 'Cardio',
      duration_min: 20,
      coach_workout_outline: [{ name: 'Warm-up', block_format: 'emom' }],
      coach_outline_status: 'ready',
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
    };

    const merged = mergeOutlineMetadataOntoFormSavePayload(formMetadata, outlineSave);

    expect(merged.workout_type).toBe('Strength');
    expect(merged.duration_min).toBe(45);
    expect(merged.coach_outline_confirmed_at).toBe('2026-05-22T12:00:00.000Z');
    expect(merged.coach_workout_outline).toEqual([{ name: 'Warm-up', block_format: 'emom' }]);
  });

  it('removes outline keys cleared in override (e.g. confirmation reset)', () => {
    const formMetadata = {
      duration_min: 30,
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
      coach_outline_status: 'ready',
    };
    const outlineSave = {
      duration_min: 10,
      coach_outline_status: 'ready',
    };

    const merged = mergeOutlineMetadataOntoFormSavePayload(formMetadata, outlineSave);

    expect(merged.duration_min).toBe(30);
    expect(merged.coach_outline_confirmed_at).toBeUndefined();
    expect(merged.coach_outline_status).toBe('ready');
  });
});
