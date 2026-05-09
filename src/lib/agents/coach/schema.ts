/**
 * Coach response schemas — pure module, canonical source.
 *
 * Two `VertexResponseSchema` literals:
 *   - `COACH_RESPONSE_SCHEMA` — the main JSON-mode schema lifted verbatim from
 *     `supabase/functions/bubble-agent-dispatch/index.ts:704-860`.
 *   - `COACH_WORKOUT_GREETING_SCHEMA` — the preflight workout-open greeting schema
 *     lifted from `supabase/functions/bubble-agent-dispatch/index.ts:910-920`.
 *
 * A byte-for-byte mirror lives at `supabase/functions/agents/coach/schema.ts`. Run
 * `pnpm check:agent-mirror` to verify parity.
 *
 * The schema body is intentionally written as a plain object literal (not as a typed
 * cast) so the Vertex API receives exactly the keys the legacy implementation sent. The
 * `VertexResponseSchema` cast at the bottom only constrains the export surface.
 */

import type { VertexResponseSchema } from '../_shared/llm/types';
import { INTAKE_CATEGORIES, INTAKE_PHASES } from './config';

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
        'Full Kanban card body: workout plan, sets/reps cues, equipment, and safety notes. Saved to the task description in the database. When create_card is true, populate this with the same detail you would put on a workout card (can be multi-sentence or short markdown). Use null only if create_card is false.',
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
        "When create_card is true: task-comment body (readiness summary, prescription rationale, scaling options). Not shown in bubble chat. MUST end with this exact CTA paragraph (verbatim line breaks optional): Does this proposed workout look good? If so, click 'Generate Workout' on the card. If you'd like any adjustments, let me know here in the chat! Use null when create_card is false.",
    },
    update_existing_task: {
      type: 'BOOLEAN',
      description:
        'TRUE for card/task rewrites and draft flows when the user has confirmed (or user_requested_immediate_card)—not for mid-workout log tweaks. Mid-workout weight, rep, or RPE changes use execution_patch with this field FALSE. Provide updated_task_title and/or updated_task_description and/or proposed_workout_metadata (at least one non-empty) when true. Set FALSE when creating a NEW card (create_card), when only asking for pre-draft confirmation, or when only updating the live player via execution_patch. Never invent task IDs — the server resolves the task.',
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
      description:
        'When update_existing_task is true: full new task description / workout brief for the existing card. Use null to leave description unchanged only if updated_task_title is non-empty.',
    },
    proposed_workout_metadata: {
      type: 'OBJECT',
      nullable: true,
      description:
        'When update_existing_task is true: structured workout fields to merge into tasks.metadata on user finalize (exercises array with name, sets, reps; workout_type; duration_min). MUST be null on pre_draft_confirmation turns and until the user confirms drafting or user_requested_immediate_card. MUST be null when you are only updating the live grid via execution_patch OR saving personal form cues via personal_cues_patch (never use this object for mid-workout cue persistence). Use null if only updating title/description text.',
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
            },
          },
        },
        workout_type: { type: 'STRING', nullable: true },
        duration_min: { type: 'INTEGER', nullable: true },
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
              'Calculated or prescribed load for this set. MUST BE PURE NUMBER STRING ONLY. Do not include units (lbs/kg), ranges, parentheses, or text. Example: "135" or "60.5".',
          },
          reps: {
            type: 'STRING',
            nullable: true,
            description:
              'Calculated or prescribed reps for this set. MUST BE PURE NUMBER STRING ONLY (single integer). Do not include ranges (e.g. "8-10"), units, or text. Example: "8".',
          },
          rpe: {
            type: 'STRING',
            nullable: true,
            description:
              'Calculated or prescribed RPE (1-10) for this set. MUST BE PURE NUMBER STRING ONLY. Do not include ranges or text. Example: "7" or "8.5".',
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
  },
  // Keys must be present so Gemini does not drop task_description on create_card flows.
  // execution_patch is NOT required: model may omit it; parse treats missing as null.
  required: [
    'reply_content',
    'create_card',
    'task_title',
    'task_description',
    'update_existing_task',
    'updated_task_title',
    'updated_task_description',
    'proposed_workout_metadata',
  ],
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
        'Single visible chat message: time-of-day greeting, name the workout, invite questions; 2–5 sentences, plain text.',
    },
  },
  required: ['reply_content'],
};
