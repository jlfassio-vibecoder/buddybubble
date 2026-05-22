import { describe, expect, it, vi, afterEach } from 'vitest';
import { BLOCK_BLUEPRINT_LIBRARY_HEADER } from './block-blueprint-library';
import {
  APEX_ARCHITECT_MAIN_CHAT_HEADER,
  EXERCISE_INDEX_MAP_HEADER,
  COACH_RAIL_SURFACE_VALUE,
  buildApexArchitectMainChatBlock,
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
    expect(block).toContain('Server merge is append-only');
    expect(block).toContain('emit only what changed');
    expect(block).not.toContain('full revised workout');
    expect(block).not.toContain('still require clear affirmative consent before drafting');
    expect(block).not.toContain('The user must finalize changes on the card');
  });

  it('rail tone instructs blocks for named sections', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats', { rail: true });
    expect(block).toContain('only the new or changed block(s)');
    expect(block).toContain('Do not re-emit unchanged blocks');
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

  it('rail tail contains GENERATION HAND-OFF once', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats', { rail: true });
    expect(block).toContain('GENERATION HAND-OFF');
    const matches = block.match(/GENERATION HAND-OFF/g) ?? [];
    expect(matches.length).toBe(1);
    expect(block).toContain("card_action: 'trigger_generation'");
  });

  it('non-rail tail does NOT contain GENERATION HAND-OFF', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats');
    expect(block).not.toContain('GENERATION HAND-OFF');
  });
});

describe('buildApexArchitectMainChatBlock', () => {
  const block = buildApexArchitectMainChatBlock();

  it('includes Apex Architect persona and catalog token examples', () => {
    expect(block).toContain(APEX_ARCHITECT_MAIN_CHAT_HEADER);
    expect(block).toContain('The Apex Architect');
    expect(block).toContain('DPT');
    expect(block).toContain('Exercise Physiology');
    expect(block).toContain('CSCS');
    expect(block).toContain('Triad of Performance');
    expect(block).toContain(':main/emom/alternating');
    expect(block).toContain(':metcon/tabata');
  });

  it('does not mention LIVE CO-PILOT MODE', () => {
    expect(block).not.toContain('LIVE CO-PILOT MODE');
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

  it('does not embed the BLOCK BLUEPRINT LIBRARY (injected on rail / block mentions only)', () => {
    expect(prompt).not.toContain(BLOCK_BLUEPRINT_LIBRARY_HEADER);
  });

  it('still names card_action and parametric hand-off in the base contract', () => {
    expect(prompt).toContain('block_format');
    expect(prompt).toContain('parametric_requires_rich_workout_set');
  });

  it('names card_action in the JSON keys list', () => {
    expect(prompt).toContain('task_modal_intake_patch, card_action, intake_phase');
  });

  it('contains flat-card parametric refusal sentence once', () => {
    expect(prompt).toContain('parametric_requires_rich_workout_set');
    expect(prompt).toContain("card_action: 'trigger_generation'");
    const matches = prompt.match(/parametric_requires_rich_workout_set/g) ?? [];
    expect(matches.length).toBe(1);
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

  it('appends log row counts and setIndex bounds when live_set_counts aligns', () => {
    const json = JSON.stringify({
      exercises: [{ name: 'Burpees' }, { name: 'High Knees' }],
      live_set_counts: [8, 4],
    });
    const out = formatExerciseIndexMap(json)!;
    expect(out).toContain('0: Burpees (8 log rows)');
    expect(out).toContain('1: High Knees (4 log rows)');
    expect(out).toContain('setIndex must be 0 .. live_set_counts[exerciseIndex] - 1.');
  });

  it('omits row counts when live_set_counts length mismatches', () => {
    const json = JSON.stringify({
      exercises: [{ name: 'Burpees' }],
      live_set_counts: [8, 4],
    });
    const out = formatExerciseIndexMap(json)!;
    expect(out).not.toContain('log rows');
    expect(out).not.toContain('live_set_counts[exerciseIndex]');
  });

  it('appends Alternating EMOM guide when emom_alternating_guide is present', () => {
    const json = JSON.stringify({
      exercises: [{ name: 'Deadlift' }, { name: 'Push-up' }, { name: 'Air Squat' }],
      live_set_counts: [4, 3, 3],
      emom_alternating_guide: [
        {
          block_name: 'MAIN',
          cycle_taxonomy: 'A / B / C',
          exercises: [
            {
              exerciseIndex: 0,
              name: 'Deadlift',
              global_minutes: [0, 3, 6, 9],
              set_indices: [0, 1, 2, 3],
            },
            {
              exerciseIndex: 1,
              name: 'Push-up',
              global_minutes: [1, 4, 7],
              set_indices: [0, 1, 2],
            },
          ],
        },
      ],
    });
    const out = formatExerciseIndexMap(json)!;
    expect(out).toContain('[Alternating EMOM Guide]');
    expect(out).toContain('Block "MAIN" (A / B / C):');
    expect(out).toContain('0: Deadlift — active minutes 0, 3, 6, 9 → setIndex 0, 1, 2, 3');
    expect(out).toContain('1: Push-up — active minutes 1, 4, 7 → setIndex 0, 1, 2');
    expect(out).toContain(
      '*CRITICAL: Never use the global minute as setIndex for Alternating EMOMs. Use the mapped setIndex above.*',
    );
  });

  it('omits Alternating EMOM guide for legacy workouts', () => {
    const json = JSON.stringify({
      exercises: [{ name: 'Burpees' }],
      live_set_counts: [8],
    });
    const out = formatExerciseIndexMap(json)!;
    expect(out).not.toContain('[Alternating EMOM Guide]');
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
