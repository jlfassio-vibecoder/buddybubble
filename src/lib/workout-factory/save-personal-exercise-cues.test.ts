import { describe, expect, it } from 'vitest';
import {
  personalCuePatchHasContent,
  workoutCuePatchToPersonalRpcRow,
} from '@/lib/workout-factory/save-personal-exercise-cues';

describe('save-personal-exercise-cues', () => {
  it('workoutCuePatchToPersonalRpcRow maps non-empty fields with replace mode', () => {
    const row = workoutCuePatchToPersonalRpcRow(
      {
        instructions: ' Step 1 ',
        form_cues: '',
        tips: 'Go slow',
        injury_prevention_tips: '  ',
      },
      '00000000-0000-4000-8000-000000000099',
      'replace',
    );
    expect(row).toEqual({
      exercise_dictionary_id: '00000000-0000-4000-8000-000000000099',
      mode: 'replace',
      instructions: 'Step 1',
      tips: 'Go slow',
    });
  });

  it('returns null when all cue fields are empty', () => {
    expect(
      workoutCuePatchToPersonalRpcRow(
        { instructions: '', form_cues: '  ', tips: undefined },
        '00000000-0000-4000-8000-000000000099',
      ),
    ).toBeNull();
    expect(personalCuePatchHasContent({ instructions: '', form_cues: '' })).toBe(false);
  });
});
