import { describe, expect, it, vi, afterEach } from 'vitest';
import { BLOCK_BLUEPRINT_LIBRARY_HEADER, BLOCK_FORMAT_ENUM } from './block-blueprint-library';
import {
  EXERCISE_INDEX_MAP_HEADER,
  COACH_RAIL_SURFACE_VALUE,
  buildBaseCoachPrompt,
  buildCurrentTaskContextBlock,
  buildTaskModalIntakeUiCoachBlock,
  buildTaskModalLiveStateBlock,
  formatExerciseIndexMap,
  isCoachRailSurfaceFromMessageMetadata,
  readTaskModalLiveStateFromMessageMetadata,
  taskMetadataLooksWorkoutShaped,
} from './prompts';

describe('buildCurrentTaskContextBlock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('default tone requires finalize on the card', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats');
    expect(block).toContain('The user must finalize changes on the card');
    expect(block).not.toContain('LIVE CO-PILOT MODE');
    expect(block).not.toContain('actively co-editing this task with the user');
  });

  it('rail tone describes instant updates', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats', { rail: true });
    expect(block).toContain('LIVE CO-PILOT MODE (Task Modal rail)');
    expect(block).toContain('actively co-editing this task with the user');
    expect(block).toContain('Emit proposed_workout_metadata containing the full revised workout');
    expect(block).not.toContain('still require clear affirmative consent before drafting');
    expect(block).not.toContain('The user must finalize changes on the card');
  });

  it('rail tone instructs blocks for named sections', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats', { rail: true });
    expect(block).toContain('emit proposed_workout_metadata.blocks as the full revised list');
    expect(block).toContain('Use blocks whenever section identity matters');
  });

  it('rail tone requires block_format and format_params per blueprint library', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats', { rail: true });
    expect(block).toContain('block_format');
    expect(block).toContain('format_params');
    expect(block).toContain('BLUEPRINT LIBRARY');
    expect(block).toContain('instruction-only');
  });

  it('default tone does NOT mention blocks routing', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats');
    expect(block).not.toContain('proposed_workout_metadata.blocks');
    expect(block).not.toContain('Use blocks whenever section identity matters');
    expect(block).not.toContain('block_format');
  });
});

describe('buildBaseCoachPrompt', () => {
  const prompt = buildBaseCoachPrompt('2026-05-15');

  it('keeps the global PRE-DRAFT CONFIRMATION sentence', () => {
    expect(prompt).toContain(
      'Follow PRE-DRAFT CONFIRMATION before emitting structured proposed_workout_metadata',
    );
  });

  it('appends the live co-pilot rail EXCEPTION exactly once', () => {
    expect(prompt).toContain(
      'EXCEPTION (live co-pilot rail): when the prompt also contains the LIVE CO-PILOT MODE block',
    );
    const matches = prompt.match(/EXCEPTION \(live co-pilot rail\):/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('includes the BLOCK BLUEPRINT LIBRARY and enum values', () => {
    expect(prompt).toContain(BLOCK_BLUEPRINT_LIBRARY_HEADER);
    for (const fmt of BLOCK_FORMAT_ENUM) {
      expect(prompt).toContain(fmt);
    }
  });

  it('names block_format, format_params, and required param keys', () => {
    expect(prompt).toContain('block_format');
    expect(prompt).toContain('format_params');
    expect(prompt).toContain('time_cap_minutes');
    expect(prompt).toContain('interval_seconds');
    expect(prompt).toContain('rounds');
    expect(prompt).toContain('work_seconds');
  });

  it('states superset cardinality and instruction-only exemption', () => {
    expect(prompt).toContain('exactly 2');
    expect(prompt.toLowerCase()).toContain('instruction-only');
  });

  it('documents per-exercise EMOM timers and server derivation from interval_seconds', () => {
    expect(prompt).toContain('per-exercise work_seconds / rest_seconds');
    expect(prompt).toContain('derives them from interval_seconds');
  });
});

describe('isCoachRailSurfaceFromMessageMetadata', () => {
  it('is true only for standard_task_chat_rail surface', () => {
    expect(isCoachRailSurfaceFromMessageMetadata({ surface: COACH_RAIL_SURFACE_VALUE })).toBe(true);
    expect(isCoachRailSurfaceFromMessageMetadata({ surface: 'other' })).toBe(false);
    expect(isCoachRailSurfaceFromMessageMetadata(null)).toBe(false);
    expect(isCoachRailSurfaceFromMessageMetadata([])).toBe(false);
    expect(isCoachRailSurfaceFromMessageMetadata('x')).toBe(false);
  });
});

describe('formatExerciseIndexMap', () => {
  it('returns null for invalid or non-object JSON', () => {
    expect(formatExerciseIndexMap('')).toBeNull();
    expect(formatExerciseIndexMap('not json')).toBeNull();
    expect(formatExerciseIndexMap('[]')).toBeNull();
    expect(formatExerciseIndexMap('{"exercises":[]}')).toBeNull();
  });

  it('emits one line per exercise index with names or (unnamed)', () => {
    const json = JSON.stringify({
      exercises: [{ name: 'Leg Swings' }, { name: 'Kettlebell Goblet Squat' }, {}],
    });
    const out = formatExerciseIndexMap(json);
    expect(out).toContain(EXERCISE_INDEX_MAP_HEADER);
    expect(out).toContain('0: Leg Swings');
    expect(out).toContain('1: Kettlebell Goblet Squat');
    expect(out).toContain('2: (unnamed)');
  });

  it('accepts a root-level exercises array (sentinel / rail payload shape)', () => {
    const json = JSON.stringify([{ name: 'Dumbbell Bench Press' }, { name: 'Row' }]);
    const out = formatExerciseIndexMap(json);
    expect(out).toContain('0: Dumbbell Bench Press');
    expect(out).toContain('1: Row');
  });
});

describe('taskMetadataLooksWorkoutShaped', () => {
  it('is false for null, arrays, and empty objects', () => {
    expect(taskMetadataLooksWorkoutShaped(null)).toBe(false);
    expect(taskMetadataLooksWorkoutShaped([])).toBe(false);
    expect(taskMetadataLooksWorkoutShaped({})).toBe(false);
  });

  it('is true when workout_type, exercises, workoutContext, or duration_min is set', () => {
    expect(taskMetadataLooksWorkoutShaped({ workout_type: 'AMRAP' })).toBe(true);
    expect(taskMetadataLooksWorkoutShaped({ workoutType: ' HIIT ' })).toBe(true);
    expect(taskMetadataLooksWorkoutShaped({ exercises: [{ name: 'Squat' }] })).toBe(true);
    expect(taskMetadataLooksWorkoutShaped({ workoutContext: { exercises: [] } })).toBe(true);
    expect(taskMetadataLooksWorkoutShaped({ duration_min: 30 })).toBe(true);
    expect(taskMetadataLooksWorkoutShaped({ durationMin: '25' })).toBe(true);
  });
});

describe('buildTaskModalIntakeUiCoachBlock', () => {
  it('includes worked GOOD/BAD examples for scale, duration strings, and soreness', () => {
    const block = buildTaskModalIntakeUiCoachBlock();
    expect(block).toContain('GOOD: {"readiness":7,"sleep_quality":8}');
    expect(block).toContain('GOOD: {"duration_minutes":"30"}');
    expect(block).toContain('BAD: {"duration_minutes":30}');
    expect(block).toContain('BAD: {"readiness":72}');
    expect(block).toContain('BAD: {"soreness":["None","Legs"]}');
  });
});

describe('readTaskModalLiveStateFromMessageMetadata', () => {
  it('returns null when absent, wrong version, or invalid item_type', () => {
    expect(readTaskModalLiveStateFromMessageMetadata(null)).toBeNull();
    expect(readTaskModalLiveStateFromMessageMetadata({})).toBeNull();
    expect(
      readTaskModalLiveStateFromMessageMetadata({ task_modal_live_state: { v: 2 } }),
    ).toBeNull();
    expect(
      readTaskModalLiveStateFromMessageMetadata({
        task_modal_live_state: { v: 1, item_type: 'idea' },
      }),
    ).toBeNull();
  });

  it('parses valid v1 workout snapshot and drops invalid fields', () => {
    const s = readTaskModalLiveStateFromMessageMetadata({
      task_modal_live_state: {
        v: 1,
        item_type: 'workout',
        wizard_step: 2,
        readiness: 4,
        sleep_quality: '8',
        duration_minutes: 30,
        target_intensity: 'Moderate',
        soreness: ['Legs', 'bogus'],
        equipment: ['Mat'],
      },
    });
    expect(s).toEqual({
      v: 1,
      item_type: 'workout',
      wizard_step: 2,
      readiness: 4,
      sleep_quality: 8,
      duration_minutes: 30,
      target_intensity: 'Moderate',
      soreness: ['Legs'],
      equipment: ['Mat'],
    });
  });
});

describe('buildTaskModalLiveStateBlock', () => {
  it('formats deterministic lines including quoted duration', () => {
    const text = buildTaskModalLiveStateBlock({
      v: 1,
      item_type: 'workout_log',
      wizard_step: 3,
      readiness: 5,
      sleep_quality: 6,
      duration_minutes: 45,
      target_intensity: 'High/HIIT',
      soreness: ['None'],
      equipment: ['Bodyweight'],
    });
    expect(text).toContain('--- TASK MODAL LIVE STATE (v1) ---');
    expect(text).toContain('item_type: workout_log');
    expect(text).toContain('wizard_step: 3');
    expect(text).toContain('duration_minutes: "45"');
    expect(text).toContain('target_intensity: "High/HIIT"');
    expect(text).toContain('"None"');
  });
});
