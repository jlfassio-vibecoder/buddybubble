/**
 * Coach response schemas — Deno mirror of `src/lib/agents/coach/schema.ts`.
 *
 * Two `VertexResponseSchema` literals:
 *   - `COACH_RESPONSE_SCHEMA` — the main JSON-mode schema lifted verbatim from
 *     `supabase/functions/bubble-agent-dispatch/index.ts:704-860`.
 *   - `COACH_WORKOUT_GREETING_SCHEMA` — the preflight workout-open greeting schema
 *     lifted from `supabase/functions/bubble-agent-dispatch/index.ts:910-920`.
 *
 * Run `pnpm check:agent-mirror` to verify parity with the Vitest-canonical module.
 *
 * The schema body is intentionally written as a plain object literal (not as a typed
 * cast) so the Vertex API receives exactly the keys the legacy implementation sent. The
 * `VertexResponseSchema` cast at the bottom only constrains the export surface.
 */

import type { VertexResponseSchema } from '../../_shared/llm/types.ts';
import { INTAKE_CATEGORIES, INTAKE_PHASES } from './config.ts';

/** Shared block object shape for `proposed_workout_metadata.blocks` and `coach_workout_outline`. */
export const COACH_PROPOSED_WORKOUT_BLOCK_ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: {
      type: 'STRING',
      maxLength: 40,
      description:
        'CRITICAL: Must be a very short, concise title (e.g. "Main Circuit" or "Warm-up"). NEVER generate long, descriptive, or conversational text in this field. Never encode duration, round count, or exercise count in name — use format_params and exercises[]. Short section label only — NOT workout prose, timing, or prescriptions. Put structure in block_format and format_params; Vertex Factory fills detail.',
    },
    exercises: {
      type: 'ARRAY',
      nullable: true,
      description:
        'Exercise count lives here: emit N objects with short placeholder names (e.g. Station 1), typically at most 12. Do not summarize count in block name.',
      items: {
        type: 'OBJECT',
        properties: {
          name: {
            type: 'STRING',
            maxLength: 40,
            description:
              'Exercise name only (e.g. "Kettlebell Swing") — short placeholder on outline turns; no coaching prose or prescription narrative.',
          },
          sets: { type: 'INTEGER', nullable: true },
          reps: { type: 'STRING', nullable: true },
          coach_notes: {
            type: 'STRING',
            nullable: true,
            description:
              'Outline/create_card turns: omit or null — Vertex Factory enriches later. Rail/full draft may use brief cues only.',
          },
          equipment: { type: 'STRING', nullable: true },
          work_seconds: {
            type: 'INTEGER',
            nullable: true,
            description:
              'Per-exercise work duration in seconds (Tabata, EMOM, AMRAP timing). Optional; merge derives from format_params for EMOM when omitted.',
          },
          rest_seconds: {
            type: 'INTEGER',
            nullable: true,
            description:
              'Per-exercise rest duration in seconds. For EMOM: rest within the interval after work. For Tabata: rest between work rounds.',
          },
        },
      },
    },
    instructions: {
      type: 'ARRAY',
      nullable: true,
      description:
        'Instruction-shaped section (warm-up, cool down, mobility): max 1–2 short lines per block on outline turns. Use when the section is cued execution rather than prescribed sets and reps.',
      items: { type: 'STRING' },
    },
    block_format: {
      type: 'STRING',
      nullable: true,
      enum: [
        'straight_sets',
        'superset',
        'circuit',
        'amrap',
        'emom',
        'tabata',
        'ladder',
        'chipper',
        'pyramid',
        'contrast',
        'clusters',
        'drop_sets',
      ],
      description:
        'Blueprint discriminator. MUST be one of the enum values; do not invent new formats. Required on exercise-shaped blocks; instruction-only warm-up / cool-down blocks may omit it. Use circuit (not superset) for 3+ exercises in sequence.',
    },
    format_params: {
      type: 'OBJECT',
      nullable: true,
      description:
        'Format-specific parameters. Required keys depend on block_format (see BLUEPRINT LIBRARY in system prompt): amrap requires time_cap_minutes; emom requires interval_seconds AND (total_minutes OR total_rounds); optional emom is_alternating and alternating_stations for minute-bound alternating work; tabata requires rounds; superset/circuit/contrast require rounds; ladder and pyramid require start_reps and peak_reps; chipper requires rounds and at least 3 exercises; clusters requires reps_per_cluster and clusters; drop_sets requires drop_percent and drops. Omit when straight_sets with default rest.',
      properties: {
        time_cap_minutes: {
          type: 'INTEGER',
          nullable: true,
          description:
            'AMRAP duration in minutes. User-facing time caps belong here only, not in block name.',
        },
        interval_seconds: { type: 'INTEGER', nullable: true },
        total_minutes: {
          type: 'INTEGER',
          nullable: true,
          description:
            'EMOM total duration in minutes. User-facing timing belongs here only, not in block name.',
        },
        total_rounds: { type: 'INTEGER', nullable: true },
        is_alternating: {
          type: 'BOOLEAN',
          nullable: true,
          description:
            'EMOM only. When true, minute highlights follow alternating_stations instead of a single exercise column. Omit or false for legacy EMOM.',
        },
        alternating_stations: {
          type: 'ARRAY',
          nullable: true,
          description:
            'EMOM only when is_alternating is true. Cycle of minute slots; each slot is an array of 0-based exercise indices within this block. For simple A/B/C rotation set is_alternating true and omit this field — the server auto-builds [[0],[1],[2],…]. For combined minutes supply explicitly, e.g. [[0],[1,2]].',
          items: {
            type: 'ARRAY',
            items: { type: 'INTEGER' },
          },
        },
        rounds: {
          type: 'INTEGER',
          nullable: true,
          description:
            'Round targets for circuit, tabata, superset, etc. User-facing round counts belong here only, not in block name.',
        },
        work_seconds: { type: 'INTEGER', nullable: true },
        rest_seconds: { type: 'INTEGER', nullable: true },
        rest_in_interval_seconds: { type: 'INTEGER', nullable: true },
        rest_between_sets_seconds: { type: 'INTEGER', nullable: true },
        rest_between_rounds_seconds: { type: 'INTEGER', nullable: true },
        rest_between_exercises_seconds: { type: 'INTEGER', nullable: true },
        target_rpe: { type: 'NUMBER', nullable: true },
        target_rounds: { type: 'INTEGER', nullable: true },
        pairing_notes: { type: 'STRING', nullable: true },
        start_reps: { type: 'INTEGER', nullable: true },
        peak_reps: { type: 'INTEGER', nullable: true },
        step_reps: { type: 'INTEGER', nullable: true },
        direction: {
          type: 'STRING',
          nullable: true,
          description: 'Ladder or pyramid: ascending or descending.',
        },
        sets: { type: 'INTEGER', nullable: true },
        load_progression_percent: { type: 'INTEGER', nullable: true },
        reps_per_cluster: { type: 'INTEGER', nullable: true },
        intra_cluster_rest_seconds: { type: 'INTEGER', nullable: true },
        inter_set_rest_seconds: { type: 'INTEGER', nullable: true },
        clusters: { type: 'INTEGER', nullable: true },
        drop_percent: { type: 'INTEGER', nullable: true },
        drops: { type: 'INTEGER', nullable: true },
      },
    },
  },
} as const;

/** Phase B Vertex INTEGER fields — anti runaway digit loops in JSON mode. */
const OUTLINE_REALISTIC_INTEGER_DESCRIPTION =
  'Small whole number only (typical range 1–3600 depending on field). Must be a realistic, short integer — never floats, repeating decimals, or excessive trailing zeros (e.g. 45, never 45.000000... or 4500000000...). NEVER pad or loop digits.';

/** Phase B outline fill: minimal block tree only (separate Vertex call). */
export const COACH_OUTLINE_ONLY_BLOCK_ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: {
      type: 'STRING',
      maxLength: 80,
      description: 'Short section label only (e.g. "Main EMOM") — never workout prose or timing.',
    },
    block_format: {
      type: 'STRING',
      enum: [
        'straight_sets',
        'superset',
        'circuit',
        'amrap',
        'emom',
        'tabata',
        'ladder',
        'chipper',
        'pyramid',
        'contrast',
        'clusters',
        'drop_sets',
      ],
      description: 'Blueprint discriminator from BLOCK BLUEPRINT LIBRARY.',
    },
    format_params: {
      type: 'OBJECT',
      nullable: true,
      description:
        'Format-specific params per block_format (see BLUEPRINT LIBRARY). All numeric fields must be compact integers — never stringified number loops.',
      properties: {
        time_cap_minutes: {
          type: 'INTEGER',
          nullable: true,
          description: OUTLINE_REALISTIC_INTEGER_DESCRIPTION,
        },
        interval_seconds: {
          type: 'INTEGER',
          nullable: true,
          description: OUTLINE_REALISTIC_INTEGER_DESCRIPTION,
        },
        total_minutes: {
          type: 'INTEGER',
          nullable: true,
          description: OUTLINE_REALISTIC_INTEGER_DESCRIPTION,
        },
        total_rounds: {
          type: 'INTEGER',
          nullable: true,
          description: OUTLINE_REALISTIC_INTEGER_DESCRIPTION,
        },
        is_alternating: { type: 'BOOLEAN', nullable: true },
        is_combo: { type: 'BOOLEAN', nullable: true },
        rounds: {
          type: 'INTEGER',
          nullable: true,
          description:
            'Circuit rounds for tabata when multiple exercises (passes through the exercise list — not total work intervals). ' +
            OUTLINE_REALISTIC_INTEGER_DESCRIPTION,
        },
        work_seconds: {
          type: 'INTEGER',
          nullable: true,
          description: OUTLINE_REALISTIC_INTEGER_DESCRIPTION,
        },
        rest_seconds: {
          type: 'INTEGER',
          nullable: true,
          description: OUTLINE_REALISTIC_INTEGER_DESCRIPTION,
        },
        rest_in_interval_seconds: {
          type: 'INTEGER',
          nullable: true,
          description: OUTLINE_REALISTIC_INTEGER_DESCRIPTION,
        },
      },
    },
    exercises: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: {
            type: 'STRING',
            maxLength: 80,
            description:
              'Exercise name placeholder only. For tabata blocks: one entry per circuit station; array length must match user-stated exercise count.',
          },
        },
        required: ['name'],
      },
    },
  },
  required: ['name', 'block_format'],
} as const;

export const COACH_OUTLINE_ONLY_SCHEMA: VertexResponseSchema = {
  type: 'OBJECT',
  properties: {
    blocks: {
      type: 'ARRAY',
      description:
        'One block per catalog structural token in the user request (:section/format/variant). Order matches token order. Concise — name, block_format, format_params, exercise name placeholders only. All timing/count fields in format_params must be short integers — never infinite trailing zeros or padded digit loops.',
      items: COACH_OUTLINE_ONLY_BLOCK_ITEM_SCHEMA,
    },
  },
  required: ['blocks'],
};

export const COACH_RESPONSE_SCHEMA: VertexResponseSchema = {
  type: 'OBJECT',
  properties: {
    reply_content: {
      type: 'STRING',
      description:
        'Single concise coaching message. On pre_draft_confirmation turns, ask for a final green light; do not claim the workout draft or card already exists.',
    },
    create_card: {
      type: 'BOOLEAN',
      description:
        'TRUE only when session readiness is sufficient (missing_intake_categories empty), you can prescribe safely, task fields are filled, AND PRE-DRAFT CONFIRMATION is satisfied OR user_requested_immediate_card. MUST be FALSE on pre_draft_confirmation turns where you are only asking for final approval before drafting. Do NOT set true on first-pass vague session requests when profile alone looks complete. Default FALSE while asking intake questions.',
    },
    task_title: {
      type: 'STRING',
      nullable: true,
      maxLength: 100,
      description:
        'CRITICAL: The title MUST be plain text only. NO EMOJIS. NO SYMBOLS. Maximum 100 characters. State the workout name concisely and stop. Never repeat characters or pad the string.',
    },
    task_description: {
      type: 'STRING',
      nullable: true,
      description:
        'EXTREMELY CONCISE summary. Max 3 sentences. Human-readable session intent only — no per-exercise prescriptions; Vertex Factory fills detail on Generate Workout. Use null only if create_card is false.',
    },
    intake_phase: {
      type: 'STRING',
      enum: [...INTAKE_PHASES],
      description:
        'Conversation stage: greeting; clarifying_session while collecting readiness; pre_draft_confirmation when asking for final green light before drafting (create_card false, proposed_workout_metadata null); ready_to_prescribe when this response actually creates the card or outputs the structured draft; other. For live mid-workout execution help only (execution_patch, no card draft), do not use pre_draft_confirmation; use clarifying_session or other as appropriate.',
    },
    session_readiness_score: {
      type: 'INTEGER',
      description:
        'Your estimate 0–100 of how ready this user is for a concrete workout today given what they said and LAST WORKOUT CONTEXT. Use 0 if unknown.',
    },
    missing_intake_categories: {
      type: 'ARRAY',
      description:
        'Which session-readiness topics you still need before prescribing; empty array when ready to prescribe.',
      items: {
        type: 'STRING',
        enum: [...INTAKE_CATEGORIES],
      },
    },
    user_requested_immediate_card: {
      type: 'BOOLEAN',
      description:
        'TRUE if the user clearly asks to skip remaining steps—including PRE-DRAFT CONFIRMATION—and generate or draft the workout now (e.g. "just put it on a card", "draft it now", "skip the questions"). Default false.',
    },
    session_request: {
      type: 'BOOLEAN',
      description:
        'TRUE when the user is asking for a concrete workout or session prescription for today or soon. FALSE for greetings, pure profile Q&A, or unrelated chat. Set accurately every turn for server turn-gating.',
    },
    coach_task_notes: {
      type: 'STRING',
      nullable: true,
      description:
        "When create_card is true: brief task-comment only — readiness summary and prescription rationale in at most 2 short paragraphs; no biomechanical essays or exercise-by-exercise coaching. Not shown in bubble chat. MUST end with this exact CTA paragraph (verbatim line breaks optional): Complete the Workout Intake 3-step form then click 'Generate Workout' on the card. Use null when create_card is false.",
    },
    update_existing_task: {
      type: 'BOOLEAN',
      description:
        'TRUE for card/task rewrites and draft flows when the user has confirmed (or user_requested_immediate_card)—not for mid-workout log tweaks. Mid-workout weight, rep, or RPE changes use execution_patch with this field FALSE. Provide updated_task_title and/or updated_task_description and/or proposed_workout_metadata (at least one non-empty) when true. When proposed_workout_metadata.blocks is non-empty, updated_task_description MUST be null. Set FALSE when creating a NEW card (create_card), when only asking for pre-draft confirmation, or when only updating the live player via execution_patch. Never invent task IDs — the server resolves the task.',
    },
    updated_task_title: {
      type: 'STRING',
      nullable: true,
      maxLength: 100,
      description:
        'When update_existing_task is true: new plain-text title for the existing task (no emojis). Use null to leave title unchanged only if updated_task_description is non-empty.',
    },
    updated_task_description: {
      type: 'STRING',
      nullable: true,
      maxLength: 500,
      description:
        'When update_existing_task is true: short card summary only (max 3 sentences). MUST be null when proposed_workout_metadata.blocks is non-empty — Tabata/EMOM timing belongs in block_format and format_params only, never repeated in prose. On LIVE CO-PILOT rail structural block edits, always null; emit blocks only. Use null to leave description unchanged only if updated_task_title is non-empty.',
    },
    proposed_workout_metadata: {
      type: 'OBJECT',
      nullable: true,
      description:
        'When update_existing_task is true: structured workout fields to merge into tasks.metadata on user finalize (exercises array with name, sets, reps; optional blocks array for named sections such as Warm-up, Main, Finisher, or Cool down; workout_type; duration_min). When the user requests a named section (for example add a finisher or swap the warm-up), prefer the blocks array over top-level exercises alone so each section keeps its identity. MUST be null on pre_draft_confirmation turns and until the user confirms drafting or user_requested_immediate_card. MUST be null when you are only updating the live grid via execution_patch OR saving personal form cues via personal_cues_patch (never use this object for mid-workout cue persistence). Use null if only updating title/description text.',
      properties: {
        exercises: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              sets: { type: 'INTEGER', nullable: true },
              reps: { type: 'STRING', nullable: true },
              coach_notes: { type: 'STRING', nullable: true },
              equipment: { type: 'STRING', nullable: true },
              work_seconds: {
                type: 'INTEGER',
                nullable: true,
                description:
                  'Per-exercise work duration in seconds (Tabata, EMOM, AMRAP timing). Optional; merge derives from format_params for EMOM when omitted.',
              },
              rest_seconds: {
                type: 'INTEGER',
                nullable: true,
                description:
                  'Per-exercise rest duration in seconds. For EMOM: rest within the interval after work. For Tabata: rest between work rounds.',
              },
            },
          },
        },
        blocks: {
          type: 'ARRAY',
          nullable: true,
          description:
            'Polymorphic workout sections. Each block has a free-text name (e.g. Warm-up, Main, Strength, Cardio, Finisher, Cool down, Mobility). Exercise-shaped blocks include exercises; warm-up / cool-down / mobility may instead supply an instructions string list when there are no sets and reps. Same block name as an existing exerciseBlocks entry replaces that block in place (exercises + format_params); a new name appends. Emit only new or changed blocks with stable names from CURRENT WORKOUT CONTEXT; do not re-send unchanged sections. Set replace_all_exercise_blocks true only when renaming or reordering the full parametric structure. Routes each block by name and shape into exerciseBlocks (strength, cardio, core, finisher with sets and reps) or warmupBlocks, finisherBlocks, or cooldownBlocks (instruction-shaped). Prefer emitting blocks over flat exercises whenever the user asked for a named section (for example add a finisher). Each exercise-shaped block MUST set block_format (one of straight_sets, superset, circuit, amrap, emom, tabata, ladder, chipper, pyramid, contrast, clusters, drop_sets) and the matching format_params per the BLUEPRINT LIBRARY in the system prompt. Instruction-only blocks (instructions[] without exercises[]) may omit block_format. Use null or omit when not changing the workout structure.',
          items: COACH_PROPOSED_WORKOUT_BLOCK_ITEM_SCHEMA,
        },
        workout_type: { type: 'STRING', nullable: true },
        duration_min: { type: 'INTEGER', nullable: true },
        replace_all_exercise_blocks: {
          type: 'BOOLEAN',
          nullable: true,
          description:
            'When true and blocks is non-empty, replace the entire parametric exerciseBlocks array with the incoming blocks (warmup/finisher/cooldown instruction sections preserved). Default false — same block name replaces in place; new names append.',
        },
      },
    },
    execution_patch: {
      type: 'ARRAY',
      nullable: true,
      description:
        'Optional. Live WorkoutPlayer set grid only (weight, reps, RPE, done). Omit or null when not updating the live player. When the user asks for load or rep targets: you must compute and put the values here—do not ask the user to type the numbers for you. exerciseIndex and setIndex are 0-based and must match workoutContext (see CURRENT WORKOUT CONTEXT). For saved personal instructions/form cues use personal_cues_patch, not this field.',
      items: {
        type: 'OBJECT',
        properties: {
          exerciseIndex: {
            type: 'INTEGER',
            description:
              '0-based index of the exercise in workoutContext (same ordering as the live player). When TAGGED_EXERCISE_REFS is present, exerciseIndex MUST come from a resolved entry there. Otherwise when EXERCISE_INDEX_MAP appears below CURRENT WORKOUT CONTEXT, use that map row index. Never infer exerciseIndex only from literal # text in the user message when TAGGED_EXERCISE_REFS lists a resolved index.',
          },
          setIndex: {
            type: 'INTEGER',
            description: '0-based set index within that exercise.',
          },
          weight: {
            type: 'STRING',
            nullable: true,
            description:
              'Calculated or prescribed load for this set. MUST BE PURE NUMBER STRING ONLY. Do not include units (lbs/kg), ranges, parentheses, or text. Use whole numbers or at most 2 decimal places (e.g. "53", never "53.000000..."). Example: "135" or "60.5".',
          },
          reps: {
            type: 'STRING',
            nullable: true,
            description:
              'Calculated or prescribed reps for this set. MUST BE PURE NUMBER STRING ONLY (single integer). Do not include ranges (e.g. "8-10"), units, or text. Use whole numbers only; never excessive trailing zeros. Example: "8".',
          },
          rpe: {
            type: 'STRING',
            nullable: true,
            description:
              'Calculated or prescribed RPE (1-10) for this set. MUST BE PURE NUMBER STRING ONLY. Do not include ranges or text. Use whole numbers or at most 2 decimal places; never excessive trailing zeros. Example: "7" or "8.5".',
          },
          done: { type: 'BOOLEAN', nullable: true },
        },
        required: ['exerciseIndex', 'setIndex'],
      },
    },
    personal_cues_patch: {
      type: 'ARRAY',
      nullable: true,
      description:
        'Optional. When CURRENT WORKOUT CONTEXT is present, save personal instructions/form cues/tips/injury notes per exercise. Indices come from EXERCISE_INDEX_MAP and must be marked [dict:...]; default mode append. Omit or null when not persisting cues.',
      items: {
        type: 'OBJECT',
        properties: {
          exerciseIndex: {
            type: 'INTEGER',
            description:
              '0-based index in workoutContext.exercises (same as execution_patch). Must match EXERCISE_INDEX_MAP and have a dictionary id when saving.',
          },
          instructions: { type: 'STRING', nullable: true },
          form_cues: { type: 'STRING', nullable: true },
          tips: { type: 'STRING', nullable: true },
          injury_prevention_tips: { type: 'STRING', nullable: true },
          mode: {
            type: 'STRING',
            nullable: true,
            description: 'append (default) or replace.',
          },
        },
        required: ['exerciseIndex'],
      },
    },
    workout_cues_patch: {
      type: 'OBJECT',
      nullable: true,
      description:
        'Optional. EXERCISE_CUE_REQUEST flow only: workout-scoped cue prose for one exercise keyed by resolution_key. Emit only after the user confirms generation on a follow-up turn — never on the first proactive offer turn. MUST be null when exercise_cue_request is absent. Do not use personal_cues_patch or proposed_workout_metadata for this flow.',
      properties: {
        v: { type: 'INTEGER', description: 'Must be 1.' },
        resolution_key: {
          type: 'STRING',
          description: 'Must match exercise_cue_request.resolution_key from the trigger metadata.',
        },
        instructions: { type: 'STRING', nullable: true },
        form_cues: { type: 'STRING', nullable: true },
        tips: { type: 'STRING', nullable: true },
        injury_prevention_tips: { type: 'STRING', nullable: true },
      },
      required: ['v', 'resolution_key'],
    },
    task_modal_intake_patch: {
      type: 'OBJECT',
      nullable: true,
      description:
        'Optional. When TASK MODAL INTAKE UI appears in the system prompt (workout / workout_log task card), use this object to update the on-card intake wizard from chat. Keys are optional — include only fields you are changing. readiness and sleep_quality are integers 1–10 (Task Modal sliders). They are NOT the same as session_readiness_score (0–100 internal estimate): never put session_readiness_score values into readiness/sleep_quality; if you mention readiness in reply_content for the sliders, you MUST mirror the same integers here. wizard_step: 1–3. duration_minutes: 15, 30, 45, 60, or the exact string Optimized for Goals. phase_intent: technical_baseline | standard_progression | aggressive_overload (RPE ceilings for macro planning). soreness: subset of None, Legs, Back, Shoulders, Chest, Core. Omit or null when not updating the wizard.',
      properties: {
        readiness: {
          type: 'INTEGER',
          nullable: true,
          description: 'Task modal "Readiness / energy" slider; integer 1–10 only.',
        },
        sleep_quality: {
          type: 'INTEGER',
          nullable: true,
          description: 'Task modal "Sleep quality" slider; integer 1–10 only.',
        },
        wizard_step: {
          type: 'INTEGER',
          nullable: true,
          description: 'Which wizard step (1–3) to show after applying other fields.',
        },
        duration_minutes: {
          type: 'STRING',
          nullable: true,
          description:
            'Session length: exactly one of the strings "15", "30", "45", "60", or "Optimized for Goals" (verbatim). Never emit a bare integer—always quote (e.g. "30" not 30).',
        },
        phase_intent: {
          type: 'STRING',
          nullable: true,
          description:
            'One of: technical_baseline (RPE 6–7), standard_progression (RPE 7–8), aggressive_overload (RPE 8–9+).',
        },
        soreness: {
          type: 'ARRAY',
          nullable: true,
          description:
            'Body areas sore today; items must be from the allowed soreness list in TASK MODAL INTAKE UI.',
          items: { type: 'STRING' },
        },
      },
    },
    outline_draft_patch: {
      type: 'OBJECT',
      nullable: true,
      description:
        'Optional. OUTLINE CO-PILOT MODE only (builder / Task Modal structure phase, no rich factory). Surgical workout structure edits: block names, block_format, format_params. Each patch block must include block_format + format_params when changing timing; merge_by_name keys off short name only. Include revision matching --- CURRENT OUTLINE DRAFT --- revision. Use mode merge_by_name and emit only changed or new blocks by name; use replace_all only when replacing the entire outline. Omit or null when not changing structure.',
      properties: {
        revision: {
          type: 'INTEGER',
          description:
            'Must match the revision integer from --- CURRENT OUTLINE DRAFT --- / task_modal_outline_draft on the user message.',
        },
        mode: {
          type: 'STRING',
          nullable: true,
          enum: ['merge_by_name', 'replace_all'],
          description: 'Default merge_by_name: same block name updates in place; new names append.',
        },
        blocks: {
          type: 'ARRAY',
          description:
            'Outline blocks to merge or replace. Same shape as proposed_workout_metadata.blocks. Route duration to format_params (e.g. time_cap_minutes) and exercise count to exercises[] — never in name.',
          items: COACH_PROPOSED_WORKOUT_BLOCK_ITEM_SCHEMA,
        },
        clear_confirmation: {
          type: 'BOOLEAN',
          nullable: true,
          description:
            'When true (default), clears coach_outline_confirmed_at so structure stays editable.',
        },
      },
    },
    card_action: {
      type: 'STRING',
      nullable: true,
      enum: ['trigger_generation', 'regenerate_from_outline'],
      description:
        'Optional UI command sent to the chat client. Emit "trigger_generation" only when the open card has no rich workout_set yet AND the user has given clear consent to draft now AND not in an active workout session — the client will run the heavy /api/ai/generate-workout-chain on the user\'s behalf. MUST be null on every other turn. When non-null, omit proposed_workout_metadata. reply_content should briefly say you are starting the generator. Do not emit "regenerate_from_outline" — the server sets it after rail block merges when factory re-hydration is needed.',
    },
  },
  // Keys must be present so Gemini does not drop task_description on create_card flows.
  // execution_patch is NOT required: model may omit it; parse treats missing as null.
  // card_action MUST be emitted every turn as null or "trigger_generation" — when it was
  // optional Gemini often omitted the key entirely, reply metadata stayed `{}`, and the
  // Task Modal client never received the Generate Workout hand-off.
  required: [
    'reply_content',
    'create_card',
    'task_title',
    'task_description',
    'update_existing_task',
    'updated_task_title',
    'updated_task_description',
    'proposed_workout_metadata',
    'card_action',
  ],
};

/**
 * Main bubble Call A schema — card shell only. Omits `proposed_workout_metadata` so the
 * model cannot dump parametric blocks into Call A (Phase B writes `coach_workout_outline`).
 * Rail / task-modal co-pilot uses full `COACH_RESPONSE_SCHEMA`.
 */
export const COACH_MAIN_CHAT_RESPONSE_SCHEMA: VertexResponseSchema = {
  type: 'OBJECT',
  properties: Object.fromEntries(
    Object.entries(COACH_RESPONSE_SCHEMA.properties as Record<string, unknown>).filter(
      ([key]) => key !== 'proposed_workout_metadata',
    ),
  ) as VertexResponseSchema['properties'],
  required: (COACH_RESPONSE_SCHEMA.required ?? []).filter(
    (key) => key !== 'proposed_workout_metadata',
  ),
};

/**
 * Schema for the workout-open silent-greeting preflight sub-call. Returns a single
 * `reply_content` string the dispatcher persists via `agent_create_card_and_reply` with
 * `p_create_card: false`.
 */
export const COACH_WORKOUT_GREETING_SCHEMA: VertexResponseSchema = {
  type: 'OBJECT',
  properties: {
    reply_content: {
      type: 'STRING',
      description:
        'Single visible chat message: personalized time-of-day greeting, name the workout, optional readiness acknowledgment, 1–2 concrete or structure-based target suggestions, and a closing question about filling targets or adjusting loads; 2–5 sentences, plain text; no generic gym clichés.',
    },
  },
  required: ['reply_content'],
};
