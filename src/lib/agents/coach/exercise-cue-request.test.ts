import { describe, it, expect } from 'vitest';
import {
  computeEmptyCueFields,
  parseExerciseCueRequestFromMetadata,
  readInjuriesOnFileFromBiometrics,
} from '@/lib/agents/coach/exercise-cue-request';
import { buildExerciseCueRequestCoachBlock } from '@/lib/agents/coach/prompts';
import { emptyResolvedCueBundle } from '@/lib/workout-factory/resolve-exercise-cue-bundle';

describe('exercise-cue-request', () => {
  it('parseExerciseCueRequestFromMetadata round-trips', () => {
    const req = {
      v: 1,
      resolution_key: 'squat::0',
      exercise_name: 'Goblet Squat',
      empty_fields: ['instructions', 'form_cues'],
      prescription: { sets: 3, reps: '10' },
      workout_exercise_index: 2,
    };
    expect(parseExerciseCueRequestFromMetadata(req)).toEqual(req);
  });

  it('computeEmptyCueFields gates injury field on profile', () => {
    const bundle = emptyResolvedCueBundle('Squat');
    expect(computeEmptyCueFields(bundle, { includeInjuryField: false })).toEqual([
      'instructions',
      'form_cues',
      'tips',
    ]);
    expect(computeEmptyCueFields(bundle, { includeInjuryField: true })).toEqual([
      'instructions',
      'form_cues',
      'tips',
      'injury_prevention_tips',
    ]);
  });

  it('readInjuriesOnFileFromBiometrics', () => {
    expect(readInjuriesOnFileFromBiometrics({ injuries: ' knee pain ' })).toEqual({
      onFile: true,
      snippet: 'knee pain',
    });
    expect(readInjuriesOnFileFromBiometrics({ injuries: '' }).onFile).toBe(false);
  });

  it('buildExerciseCueRequestCoachBlock mentions injuries when on file', () => {
    const block = buildExerciseCueRequestCoachBlock(
      {
        v: 1,
        resolution_key: 'squat::0',
        exercise_name: 'Goblet Squat',
        empty_fields: ['instructions', 'injury_prevention_tips'],
        prescription: { sets: 3, reps: 10 },
      },
      { onFile: true, snippet: 'knee pain' },
    );
    expect(block).toContain('injuries_on_file: true');
    expect(block).toContain('injury_snippet: knee pain');
    expect(block).toContain('Injury notes');
  });
});
