import { describe, expect, it, vi, afterEach } from 'vitest';
import { SESSION_TELEMETRY_HEADER } from './session-telemetry-format';
import { BLOCK_BLUEPRINT_LIBRARY_HEADER } from './block-blueprint-library';
import {
  APEX_ARCHITECT_MAIN_CHAT_HEADER,
  EXERCISE_INDEX_MAP_HEADER,
  COACH_RAIL_SURFACE_VALUE,
  EXERCISE_CUE_REQUEST_MODE_DIRECTIVE,
  buildApexArchitectMainChatBlock,
  buildCoachOutlineOnlyPrompt,
  COACH_OUTLINE_ONLY_SYSTEM_PROMPT,
  buildBaseCoachPrompt,
  buildCurrentTaskContextBlock,
  buildSessionReadinessContextBlock,
  buildTaskModalIntakeUiCoachBlock,
  buildTaskModalLiveStateBlock,
  buildOutlineCoPilotModeCoachBlock,
  buildWorkoutOpenGreetingPrompt,
  buildWorkoutOpenGreetingUserText,
  buildWorkoutStructureBlockFromContextJson,
  formatExerciseIndexMap,
  isCoachRailSurfaceFromMessageMetadata,
  readSessionReadinessContextFromMessageMetadata,
  readTaskModalLiveStateFromMessageMetadata,
  resolveOutlineDraftPromptParts,
  SESSION_READINESS_CONTEXT_HEADER,
  WORKOUT_STRUCTURE_CONTEXT_HEADER,
  shouldSuppressTaskModalIntakeForOutlineCoPilot,
  shouldSuppressTaskModalIntakeForPreflightReadiness,
  taskMetadataLooksWorkoutShaped,
} from './prompts';

describe('EXERCISE_CUE_REQUEST_MODE_DIRECTIVE', () => {
  it('requires immediate workout_cues_patch and forbids confirm-first language', () => {
    expect(EXERCISE_CUE_REQUEST_MODE_DIRECTIVE).toContain('IMMEDIATELY emit workout_cues_patch');
    expect(EXERCISE_CUE_REQUEST_MODE_DIRECTIVE).toContain('Do not ask for confirmation');
    expect(EXERCISE_CUE_REQUEST_MODE_DIRECTIVE).not.toMatch(/do NOT emit/i);
    expect(EXERCISE_CUE_REQUEST_MODE_DIRECTIVE).not.toMatch(/\baffirm\b/i);
    expect(EXERCISE_CUE_REQUEST_MODE_DIRECTIVE).not.toContain('First turn');
    expect(EXERCISE_CUE_REQUEST_MODE_DIRECTIVE).not.toContain('Follow-up turn');
  });

  it('cue-mode TRUTHFULNESS in base prompt still requires workout_cues_patch when claiming a write', () => {
    const prompt = buildBaseCoachPrompt('2026-05-15', { exerciseCueRequestMode: true });
    expect(prompt).toContain(
      'If reply_content claims you wrote or applied cue prose, include non-null workout_cues_patch',
    );
    expect(prompt).not.toContain(
      'If reply_content claims you wrote or applied something, include non-null execution_patch',
    );
  });
});

describe('buildCurrentTaskContextBlock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('default tone requires finalize on the card', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats');
    expect(block).toContain('The user must finalize changes on the card');
    expect(block).toContain('Provide a short revised description (max 3 sentences)');
    expect(block).toContain(
      'If you are emitting proposed_workout_metadata.blocks, updated_task_description MUST be null',
    );
    expect(block).not.toContain('full revised text');
    expect(block).not.toContain('LIVE CO-PILOT MODE');
    expect(block).not.toContain('actively co-editing this task with the user');
  });

  it('rail tone describes instant updates', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats', { rail: true });
    expect(block).toContain('LIVE CO-PILOT MODE (Task Modal rail)');
    expect(block).toContain('STRUCTURAL EDITS (blocks): Set updated_task_description to null');
    expect(block).toContain('Never narrate work_seconds, rest_seconds, or rounds in description');
    expect(block).toContain('actively co-editing this task with the user');
    expect(block).toContain('replaces exerciseBlocks by matching block name');
    expect(block).toContain('exact same name values as CURRENT WORKOUT CONTEXT');
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

  it('default tone does NOT mention rail blocks routing', () => {
    const block = buildCurrentTaskContextBlock('Leg day', 'Squats');
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
    expect(block).toContain(':finisher/hiit/classic');
  });

  it('does not mention LIVE CO-PILOT MODE', () => {
    expect(block).not.toContain('LIVE CO-PILOT MODE');
  });

  it('includes Master Prompt core directives', () => {
    expect(block).toContain('Assess Before Prescribing');
    expect(block).toContain('Science-Grounded Programming');
    expect(block).toContain('Triad of Performance');
    expect(block).toContain('Clinical Precision');
    expect(block).toContain('motor unit recruitment');
  });

  it('includes CRITICAL TOKEN CONSTRAINT for card-shell-only create_card turns', () => {
    expect(block).toContain('CRITICAL TOKEN CONSTRAINT');
    expect(block).toContain('max 3 sentences');
    expect(block).toContain('FACTORY HANDOFF');
    expect(block).not.toContain('set create_card to true with task_title');
  });

  it('includes vocabulary strictness for Alternating EMOM vs Combo', () => {
    expect(block).toContain('Vocabulary Strictness');
    expect(block).toContain('Alternating EMOM');
    expect(block).toContain(':main/emom/alternating');
  });

  it('includes interval terminology (Tabata strict vs preset names)', () => {
    expect(block).toContain('INTERVAL TERMINOLOGY');
    expect(block).toContain('never say "Tabata-style"');
    expect(block).toContain('Classic HIIT');
  });
});

describe('COACH_OUTLINE_ONLY_SYSTEM_PROMPT', () => {
  it('requires interval_preset and uses Classic HIIT example for 30/30', () => {
    expect(COACH_OUTLINE_ONLY_SYSTEM_PROMPT).toContain('INTERVAL TERMINOLOGY');
    expect(COACH_OUTLINE_ONLY_SYSTEM_PROMPT).toContain('INTERVAL CIRCUIT CARDINALITY');
    expect(COACH_OUTLINE_ONLY_SYSTEM_PROMPT).toContain('INTERVAL ACTIVE REST');
    expect(COACH_OUTLINE_ONLY_SYSTEM_PROMPT).toContain('interval_preset');
    expect(COACH_OUTLINE_ONLY_SYSTEM_PROMPT).toContain('Finisher — Classic HIIT');
    expect(COACH_OUTLINE_ONLY_SYSTEM_PROMPT).toContain('Main — Tabata');
  });
});

describe('buildCoachOutlineOnlyPrompt', () => {
  it('example JSON mixes Tabata 20/10 and Classic HIIT 30/30 blocks', () => {
    const prompt = buildCoachOutlineOnlyPrompt(
      'HIIT session',
      'Finishers',
      'Add tabata and classic hiit',
      BLOCK_BLUEPRINT_LIBRARY_HEADER,
    );
    expect(prompt).toContain('"interval_preset":"classic_hiit"');
    expect(prompt).toContain('"interval_preset":"tabata"');
    expect(prompt).toContain('Finisher — Classic HIIT');
    expect(prompt).toContain('Finisher — Hi/Low');
    expect(prompt).toContain('"rest_mode":"active"');
    expect(prompt).toContain('"active_rest_exercises":["Jogging"]');
    expect(prompt).toContain('INTERVAL CIRCUIT COUNT');
    expect(prompt).toContain('"rounds":3');
    expect(prompt).toContain('"Burpees"');
    expect(prompt).toContain('"High Knees"');
  });
});

describe('buildBaseCoachPrompt', () => {
  const prompt = buildBaseCoachPrompt('2026-05-15');

  it('requires clinical intake before card creation', () => {
    expect(prompt).toContain('PRE-DRAFT CONFIRMATION (clinical intake state machine)');
    expect(prompt).toContain('CLINICAL INTAKE PHASE');
    expect(prompt).toContain('ASK ELITE QUESTIONS');
    expect(prompt).toContain('DRAFT TRIGGER');
    expect(prompt).not.toContain('immediately set create_card to true');
    expect(prompt).not.toContain('Leave missing_intake_categories empty unless');
  });

  it('appends the live co-pilot rail EXCEPTION exactly once', () => {
    expect(prompt).toContain(
      'EXCEPTION (live co-pilot rail): when the prompt also contains the LIVE CO-PILOT MODE block',
    );
    expect(prompt).toContain(
      'FULL revised card text ONLY for title/description-only edits with no proposed_workout_metadata.blocks',
    );
    expect(prompt).toContain(
      'When LIVE CO-PILOT MODE applies or you emit proposed_workout_metadata.blocks, set updated_task_description to null',
    );
    const matches = prompt.match(/EXCEPTION \(live co-pilot rail\):/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('does not embed the BLOCK BLUEPRINT LIBRARY (injected separately in strategy)', () => {
    expect(prompt).not.toContain(BLOCK_BLUEPRINT_LIBRARY_HEADER);
  });

  it('with apexArchitectMainChat, omits rich task_description directive', () => {
    const apexPrompt = buildBaseCoachPrompt('2026-05-15', { apexArchitectMainChat: true });
    expect(apexPrompt).not.toContain('rich task_description');
    expect(apexPrompt).toContain('concise task_description');
    expect(apexPrompt).toContain('max 3 sentences per APEX ARCHITECT block');
  });

  it('without apexArchitectMainChat, keeps rich task_description directive', () => {
    expect(prompt).toContain('rich task_description');
  });

  it('still names card_action and parametric hand-off in the base contract', () => {
    expect(prompt).toContain('block_format');
    expect(prompt).toContain('parametric_requires_rich_workout_set');
  });

  it('names card_action in the JSON keys list', () => {
    expect(prompt).toContain(
      'task_modal_intake_patch, outline_draft_patch, card_action, intake_phase',
    );
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
    expect(block).toContain('GENERATION MODE');
    expect(block).toContain('PREFLIGHT MODE');
    expect(block).toContain('progression_trend');
    expect(block).toContain('GOOD (generation):');
    expect(block).toContain('GOOD (preflight): {"readiness":7,"sleep_quality":8}');
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
        phase_intent: 'standard_progression',
        soreness: ['Legs', 'bogus'],
      },
    });
    expect(s).toEqual({
      v: 1,
      item_type: 'workout',
      wizard_step: 2,
      readiness: 4,
      sleep_quality: 8,
      duration_minutes: 30,
      phase_intent: 'standard_progression',
      soreness: ['Legs'],
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
      phase_intent: 'aggressive_overload',
      soreness: ['None'],
    });
    expect(text).toContain('--- TASK MODAL LIVE STATE (v1) ---');
    expect(text).toContain('item_type: workout_log');
    expect(text).toContain('wizard_step: 3');
    expect(text).toContain('duration_minutes: "45"');
    expect(text).toContain('phase_intent: "aggressive_overload"');
    expect(text).toContain('"None"');
  });
});

describe('resolveOutlineDraftPromptParts', () => {
  it('returns co-pilot and draft blocks for unconfirmed workout without factory', () => {
    const parts = resolveOutlineDraftPromptParts({
      taskItemType: 'workout',
      taskMetadataForContext: {
        coach_workout_outline: [
          { name: 'Main', block_format: 'emom', format_params: { interval_seconds: 60 } },
        ],
      },
      messageMetadata: {
        task_modal_outline_draft: {
          v: 1,
          revision: 2,
          status: 'ready',
          confirmed: false,
          blocks: [{ name: 'Live Block', block_format: 'amrap' }],
        },
      },
      taskTitle: 'Test',
    });
    expect(parts.coPilotBlock).toContain('OUTLINE CO-PILOT MODE');
    expect(parts.draftBlock).toContain('Live Block');
    expect(parts.draftBlock).not.toContain('Main');
  });

  it('returns null when outline is confirmed', () => {
    const parts = resolveOutlineDraftPromptParts({
      taskItemType: 'workout',
      taskMetadataForContext: {
        coach_outline_confirmed_at: '2026-01-01T00:00:00.000Z',
        coach_workout_outline: [{ name: 'X' }],
      },
      messageMetadata: {},
    });
    expect(parts.coPilotBlock).toBeNull();
    expect(parts.draftBlock).toBeNull();
  });

  it('returns null when rich factory exists', () => {
    const parts = resolveOutlineDraftPromptParts({
      taskItemType: 'workout',
      taskMetadataForContext: {
        ai_workout_factory: {
          workout_set: { workouts: [{ name: 'Session', exerciseBlocks: [] }] },
        },
      },
      messageMetadata: {},
    });
    expect(parts.coPilotBlock).toBeNull();
  });

  it('keeps co-pilot when ai_workout_factory shell exists without workout_set', () => {
    const parts = resolveOutlineDraftPromptParts({
      taskItemType: 'workout',
      taskMetadataForContext: { ai_workout_factory: { version: 1 } },
      messageMetadata: {
        task_modal_outline_draft: {
          v: 1,
          revision: 1,
          status: 'ready',
          confirmed: false,
          blocks: [{ name: 'Warm-up', instructions: ['Row'] }],
        },
      },
    });
    expect(parts.coPilotBlock).toContain('OUTLINE CO-PILOT MODE');
    expect(parts.draftBlock).toContain('Warm-up');
  });

  it('infers workout item_type from outline metadata when item_type is null', () => {
    const parts = resolveOutlineDraftPromptParts({
      taskItemType: null,
      taskMetadataForContext: {
        coach_workout_outline: [{ name: 'Main', block_format: 'amrap' }],
        coach_outline_status: 'ready',
      },
      messageMetadata: {},
    });
    expect(parts.coPilotBlock).not.toBeNull();
  });

  it('shouldSuppressTaskModalIntakeForOutlineCoPilot when outline co-pilot active', () => {
    expect(
      shouldSuppressTaskModalIntakeForOutlineCoPilot({
        taskItemType: 'workout',
        taskMetadataForContext: {},
        messageMetadata: {},
      }),
    ).toBe(true);
  });
});

describe('buildOutlineCoPilotModeCoachBlock', () => {
  it('forbids proposed_workout_metadata on rail', () => {
    const text = buildOutlineCoPilotModeCoachBlock();
    expect(text).toContain('Do NOT emit proposed_workout_metadata');
    expect(text).toContain('CURRENT OUTLINE DRAFT');
    expect(text).toContain('CRITICAL FORMATTING RULE');
    expect(text).toContain('under 5 words');
    expect(text).toContain('OUTLINE DRAFT PATCH ROUTING EXAMPLES');
    expect(text).toContain('time_cap_minutes');
    expect(text).toContain('Main Circuit 1 (AMRAP 15 min.)');
  });
});

describe('readSessionReadinessContextFromMessageMetadata', () => {
  it('returns null for absent or invalid shapes', () => {
    expect(readSessionReadinessContextFromMessageMetadata(null)).toBeNull();
    expect(readSessionReadinessContextFromMessageMetadata({})).toBeNull();
    expect(
      readSessionReadinessContextFromMessageMetadata({
        session_readiness_context: { v: 2 },
      }),
    ).toBeNull();
    expect(
      readSessionReadinessContextFromMessageMetadata({
        session_readiness_context: {
          v: 1,
          captured_at: '2026-05-28T10:00:00.000Z',
          readiness: 7,
          sleep_quality: 8,
          soreness: ['Legs'],
          source: 'other',
        },
      }),
    ).toBeNull();
  });

  it('parses valid v1 and clamps readiness fields', () => {
    const ctx = readSessionReadinessContextFromMessageMetadata({
      session_readiness_context: {
        v: 1,
        captured_at: '2026-05-28T10:00:00.000Z',
        readiness: 12,
        sleep_quality: 0,
        soreness: ['Legs', 'None', 'Invalid'],
        source: 'task_modal_preflight',
      },
    });
    expect(ctx).toEqual({
      v: 1,
      captured_at: '2026-05-28T10:00:00.000Z',
      readiness: 10,
      sleep_quality: 1,
      soreness: ['Legs'],
      source: 'task_modal_preflight',
    });
  });

  it('normalizes empty soreness to None', () => {
    const ctx = readSessionReadinessContextFromMessageMetadata({
      session_readiness_context: {
        v: 1,
        captured_at: '2026-05-28T10:00:00.000Z',
        readiness: 5,
        sleep_quality: 6,
        soreness: [],
        source: 'task_modal_preflight',
      },
    });
    expect(ctx?.soreness).toEqual(['None']);
  });
});

describe('buildSessionReadinessContextBlock', () => {
  it('formats deterministic readiness lines', () => {
    const block = buildSessionReadinessContextBlock({
      v: 1,
      captured_at: '2026-05-28T10:00:00.000Z',
      readiness: 7,
      sleep_quality: 8,
      soreness: ['Legs'],
      source: 'task_modal_preflight',
    });
    expect(block).toContain(SESSION_READINESS_CONTEXT_HEADER);
    expect(block).toContain('readiness (1–10): 7');
    expect(block).toContain('sleep_quality (1–10): 8');
    expect(block).toContain('soreness: ["Legs"]');
    expect(block).toContain('do NOT re-ask readiness');
  });
});

describe('buildWorkoutOpenGreetingPrompt readiness', () => {
  it('includes pre-session instructions when readiness block present', () => {
    const block = buildSessionReadinessContextBlock({
      v: 1,
      captured_at: '2026-05-28T10:00:00.000Z',
      readiness: 7,
      sleep_quality: 8,
      soreness: ['Legs'],
      source: 'task_modal_preflight',
    });
    const prompt = buildWorkoutOpenGreetingPrompt({
      workoutTitle: 'Leg Day',
      isoNow: '2026-06-25T14:00:00.000Z',
      sessionReadinessBlock: block,
    });
    expect(prompt).toContain('pre-session check-in');
    expect(prompt).toContain('Do NOT ask them to rate readiness');
    expect(prompt).toContain(SESSION_READINESS_CONTEXT_HEADER);
    expect(prompt).toContain('Do NOT use generic gym clichés');
    expect(prompt).toContain('Close with ONE inviting question');
  });

  it('includes structure and telemetry blocks when provided', () => {
    const structureBlock = buildWorkoutStructureBlockFromContextJson(
      JSON.stringify({
        exercises: [{ name: 'Back Squat', sets: 3, reps: 10, weight: 135 }],
      }),
    );
    expect(structureBlock).toContain(WORKOUT_STRUCTURE_CONTEXT_HEADER);
    expect(structureBlock).toContain('Back Squat');

    const prompt = buildWorkoutOpenGreetingPrompt({
      workoutTitle: 'Leg Day',
      isoNow: '2026-06-25T14:00:00.000Z',
      workoutStructureBlock: structureBlock,
      sessionTelemetryBlock: `${SESSION_TELEMETRY_HEADER}\nElapsed: 0m | Sets logged: 0`,
    });
    expect(prompt).toContain(WORKOUT_STRUCTURE_CONTEXT_HEADER);
    expect(prompt).toContain(SESSION_TELEMETRY_HEADER);
    expect(prompt).toContain('Use SESSION TELEMETRY below');
  });

  it('falls back to structure-only guidance when telemetry is missing', () => {
    const structureBlock = buildWorkoutStructureBlockFromContextJson(
      JSON.stringify({ workout_structure_summary: 'Main: Back Squat 3x10' }),
    );
    const prompt = buildWorkoutOpenGreetingPrompt({
      workoutTitle: 'Leg Day',
      isoNow: '2026-06-25T14:00:00.000Z',
      workoutStructureBlock: structureBlock,
    });
    expect(prompt).toContain('SESSION TELEMETRY is sparse or missing');
    expect(prompt).toContain('Main: Back Squat 3x10');
  });

  it('buildWorkoutOpenGreetingUserText appends readiness JSON when provided', () => {
    const text = buildWorkoutOpenGreetingUserText('{"exercises":[]}', '{"readiness":7}');
    expect(text).toContain('Structured workout data');
    expect(text).toContain('Pre-session readiness check-in (JSON)');
    expect(text).toContain('{"readiness":7}');
  });
});

describe('shouldSuppressTaskModalIntakeForPreflightReadiness', () => {
  it('suppresses only when readiness is on active_session surface', () => {
    expect(
      shouldSuppressTaskModalIntakeForPreflightReadiness({
        session_readiness_context: {
          v: 1,
          captured_at: '2026-05-28T10:00:00.000Z',
          readiness: 7,
          sleep_quality: 8,
          soreness: ['Legs'],
          source: 'task_modal_preflight',
        },
        workout_context: { source: 'workout_player', surface: 'active_session' },
      }),
    ).toBe(true);
    expect(
      shouldSuppressTaskModalIntakeForPreflightReadiness({
        session_readiness_context: {
          v: 1,
          captured_at: '2026-05-28T10:00:00.000Z',
          readiness: 7,
          sleep_quality: 8,
          soreness: ['Legs'],
          source: 'task_modal_preflight',
        },
        workout_context: { source: 'workout_player' },
      }),
    ).toBe(false);
  });
});
