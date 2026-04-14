import { describe, expect, it } from 'vitest';
import { validateStorefrontPreviewPayload } from '@/lib/workout-factory/storefront-preview-runner';

describe('validateStorefrontPreviewPayload', () => {
  it('accepts a well-formed preview', () => {
    const raw = {
      title: 'Full-body starter',
      tagline: 'Move well, feel strong',
      day_label: 'Day 1',
      estimated_minutes: 45,
      summary: 'A balanced session focusing on compound patterns with manageable volume.',
      main_exercises: [
        { name: 'Goblet squat', detail: '3 x 8 @ RPE 7' },
        { name: 'Push-up', detail: '3 x 10' },
        { name: 'Row', detail: '3 x 12' },
      ],
      coach_tip: 'Stop 1–2 reps shy of failure on the first week.',
    };
    const r = validateStorefrontPreviewPayload(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preview.title).toBe('Full-body starter');
      expect(r.preview.main_exercises).toHaveLength(3);
    }
  });

  it('rejects empty exercises', () => {
    const r = validateStorefrontPreviewPayload({
      title: 'T',
      day_label: 'D1',
      estimated_minutes: 30,
      summary: 'S'.repeat(50),
      coach_tip: 'Tip',
      main_exercises: [],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects too many exercises', () => {
    const main_exercises = Array.from({ length: 9 }, (_, i) => ({
      name: `E${i}`,
      detail: '1x1',
    }));
    const r = validateStorefrontPreviewPayload({
      title: 'T',
      day_label: 'D1',
      estimated_minutes: 30,
      summary: 'S'.repeat(50),
      coach_tip: 'Tip',
      main_exercises,
    });
    expect(r.ok).toBe(false);
  });
});
