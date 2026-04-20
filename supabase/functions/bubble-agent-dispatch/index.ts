/**
 * Supabase Edge Function: Database Webhook handler for Bubble Agents.
 * Calls Gemini, then inserts an agent reply via public.agent_create_card_and_reply and/or
 * public.agent_insert_coach_workout_draft_reply (service_role) when revising an existing workout card (draft → user finalizes via apply_workout_draft).
 * Resolves agent by @mention on root messages, or by thread continuation (latest agent message in the same thread) when `parent_id` is set.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BUBBLE_AGENT_WEBHOOK_SECRET, GEMINI_API_KEY.
 * Optional: GEMINI_FETCH_TIMEOUT_MS (default 55000); model: GEMINI_MODEL, else VERTEX_GEMINI_MODEL (see env reads below).
 * Deploy with verify_jwt=false (see supabase/config.toml); authenticate via shared secret header.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-bubble-agent-secret',
};

type MessageRecord = {
  id?: string;
  user_id?: string;
  bubble_id?: string;
  content?: string | null;
  parent_id?: string | null;
  target_task_id?: string | null;
  attached_task_id?: string | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: MessageRecord;
};

type AgentDefEmbed = {
  slug: string;
  display_name: string;
  auth_user_id: string;
  is_active: boolean;
};

type BindingRow = {
  sort_order: number;
  agent_definitions: AgentDefEmbed | AgentDefEmbed[] | null;
};

type GeminiContent = {
  role: 'user' | 'model' | 'system';
  parts: Array<{ text: string }>;
};

type AgentCreateCardRpcArgs = {
  p_trigger_message_id: string;
  /** Slack-style thread root: `parent_id` of the agent reply (`parent_id` of trigger if in thread, else trigger id). */
  p_thread_id: string;
  p_agent_auth_user_id: string;
  p_invoker_user_id: string;
  p_reply_text: string;
  p_create_card: boolean;
  /** Maps to `public.tasks.item_type` (e.g. `workout` for @Coach cards). */
  p_task_type: string;
  p_task_status: string;
  p_task_title?: string;
  p_task_description?: string | null;
  /** Optional first task-scoped message (`messages.target_task_id`) after card insert. */
  p_seed_task_comment_text?: string | null;
};

type AgentInsertCoachDraftRpcArgs = {
  p_trigger_message_id: string;
  p_thread_id: string;
  p_agent_auth_user_id: string;
  p_invoker_user_id: string;
  p_target_task_id: string;
  p_reply_text: string;
  p_proposed_title: string | null;
  p_proposed_description: string | null;
  p_proposed_metadata: Record<string, unknown>;
};

/** Max length for coach seed comment passed to Postgres (RPC). */
const COACH_TASK_NOTES_MAX_CHARS = 8000;

/** Appended server-side if the model omits it (matches system prompt contract). */
const COACH_TASK_SEED_CTA =
  "Does this proposed workout look good? If so, click 'Generate Workout' on the card. If you'd like any adjustments, let me know here in the chat!";

function ensureCoachTaskNotesCta(notes: string | null): string | null {
  if (!notes) return null;
  const n = notes.trim();
  if (!n) return null;
  if (n.includes('Generate Workout') && n.includes('adjustments')) return n;
  const combined = `${n}\n\n${COACH_TASK_SEED_CTA}`;
  if (combined.length <= COACH_TASK_NOTES_MAX_CHARS) return combined;
  return combined.slice(0, COACH_TASK_NOTES_MAX_CHARS - 3) + '...';
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function unwrapDef(row: BindingRow): AgentDefEmbed | null {
  const d = row.agent_definitions;
  const o = Array.isArray(d) ? d[0] : d;
  if (!o || typeof o !== 'object') return null;
  if (!o.auth_user_id || !o.display_name) return null;
  return o as AgentDefEmbed;
}

type IntakePhase =
  | 'greeting'
  | 'clarifying_session'
  | 'pre_draft_confirmation'
  | 'ready_to_prescribe'
  | 'other';

type IntakeCategory =
  | 'sleep_energy'
  | 'modality_preference'
  | 'equipment_today'
  | 'soreness'
  | 'time_budget'
  | 'intensity'
  | 'injury_flags';

const INTAKE_PHASES: readonly IntakePhase[] = [
  'greeting',
  'clarifying_session',
  'pre_draft_confirmation',
  'ready_to_prescribe',
  'other',
];

const INTAKE_CATEGORIES: readonly IntakeCategory[] = [
  'sleep_energy',
  'modality_preference',
  'equipment_today',
  'soreness',
  'time_budget',
  'intensity',
  'injury_flags',
];

type CoachGeminiJsonResponse = {
  reply_content: string;
  create_card: boolean;
  task_title: string | null;
  task_description: string | null;
  /** When true with server-resolved task id, updates that task instead of creating a new card. */
  update_existing_task: boolean;
  updated_task_title: string | null;
  updated_task_description: string | null;
  intake_phase: IntakePhase;
  /** 0–100; 0 means unknown / not provided when the model omits or sends invalid data. */
  session_readiness_score: number;
  missing_intake_categories: IntakeCategory[];
  user_requested_immediate_card: boolean;
  /** Model: user wants a concrete workout / session soon (Layer B turn gate). */
  session_request: boolean;
  /** When create_card, optional body for task comment seed (null otherwise). */
  coach_task_notes: string | null;
  /** When update_existing_task: structured fields merged into tasks.metadata on finalize (exercises, workout_type, duration_min). */
  proposed_workout_metadata: Record<string, unknown> | null;
};

/**
 * Gemini may omit optional schema keys, use alternate keys, or return string[].
 * This value is stored on `tasks.description` via `p_task_description`.
 */
function coalesceTaskDescription(parsed: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    parsed.task_description,
    parsed.description,
    (parsed as { taskDescription?: unknown }).taskDescription,
  ];
  for (const raw of candidates) {
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t.length > 0) return t;
    }
    if (Array.isArray(raw) && raw.length > 0 && raw.every((x) => typeof x === 'string')) {
      const t = raw.join('\n').trim();
      if (t.length > 0) return t;
    }
  }
  return null;
}

/** Card body for update-existing-task flow (Gemini may use alternate keys). */
/** Normalizes Gemini `proposed_workout_metadata` for `tasks.metadata` merge on finalize. */
function parseProposedWorkoutMetadata(parsed: Record<string, unknown>): Record<string, unknown> {
  const raw = parsed.proposed_workout_metadata ?? parsed['proposed_workout_metadata'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof o.workout_type === 'string' && o.workout_type.trim()) {
    out.workout_type = o.workout_type.trim();
  }
  if (typeof o.duration_min === 'number' && Number.isFinite(o.duration_min) && o.duration_min > 0) {
    out.duration_min = Math.round(o.duration_min);
  }
  if (Array.isArray(o.exercises)) {
    const exercises: Record<string, unknown>[] = [];
    for (const ex of o.exercises) {
      if (!ex || typeof ex !== 'object' || Array.isArray(ex)) continue;
      const e = ex as Record<string, unknown>;
      const name = typeof e.name === 'string' ? e.name.trim() : '';
      if (!name) continue;
      const row: Record<string, unknown> = { name };
      if (typeof e.sets === 'number' && e.sets > 0) row.sets = Math.round(e.sets);
      if (e.reps != null) row.reps = e.reps;
      if (typeof e.coach_notes === 'string' && e.coach_notes.trim())
        row.coach_notes = e.coach_notes.trim();
      if (typeof e.equipment === 'string' && e.equipment.trim()) row.equipment = e.equipment.trim();
      exercises.push(row);
    }
    if (exercises.length > 0) out.exercises = exercises;
  }
  return out;
}

function coalesceUpdatedTaskDescription(parsed: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    parsed.updated_task_description,
    (parsed as { updatedTaskDescription?: unknown }).updatedTaskDescription,
  ];
  for (const raw of candidates) {
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t.length > 0) return t;
    }
    if (Array.isArray(raw) && raw.length > 0 && raw.every((x) => typeof x === 'string')) {
      const t = raw.join('\n').trim();
      if (t.length > 0) return t;
    }
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidString(s: string): boolean {
  return UUID_RE.test(s);
}

async function taskIdInBubble(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  bubbleId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('bubble_id', bubbleId)
    .maybeSingle();
  if (error) {
    console.error('[bubble-agent-dispatch] taskIdInBubble', error.message, { taskId, bubbleId });
    return false;
  }
  return !!data?.id;
}

/** Server-resolved task under discussion (never from LLM). */
async function resolveKnownTargetTaskId(
  supabase: ReturnType<typeof createClient>,
  record: MessageRecord,
  historyRows: Array<{
    target_task_id?: string | null;
    attached_task_id?: string | null;
  }>,
): Promise<string | null> {
  const bubbleId = record.bubble_id;
  if (!bubbleId) return null;

  const ordered: string[] = [];
  const push = (id: unknown) => {
    if (typeof id !== 'string' || !isUuidString(id)) return;
    if (!ordered.includes(id)) ordered.push(id);
  };

  push(record.target_task_id);
  push(record.attached_task_id);
  for (const row of historyRows) {
    push(row.target_task_id);
    push(row.attached_task_id);
  }

  for (const id of ordered) {
    if (await taskIdInBubble(supabase, id, bubbleId)) return id;
  }
  return null;
}

/** Strips optional ``` / ```json fences if the model wraps JSON in Markdown. */
function stripMarkdownCodeFences(raw: string): string {
  let t = raw.trim();
  const fullFence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i;
  const m = t.match(fullFence);
  if (m) return m[1].trim();
  if (/^```(?:json)?\s*\r?\n?/i.test(t)) {
    t = t.replace(/^```(?:json)?\s*\r?\n?/i, '');
    t = t.replace(/\r?\n?```\s*$/, '');
  }
  return t.trim();
}

function parseIntakePhase(raw: unknown): IntakePhase {
  if (typeof raw !== 'string') return 'other';
  const t = raw.trim() as IntakePhase;
  return (INTAKE_PHASES as readonly string[]).includes(t) ? t : 'other';
}

function parseSessionReadinessScore(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function parseMissingIntakeCategories(raw: unknown): IntakeCategory[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(INTAKE_CATEGORIES as readonly string[]);
  const out: IntakeCategory[] = [];
  for (const x of raw) {
    if (typeof x === 'string' && allowed.has(x)) {
      out.push(x as IntakeCategory);
    }
  }
  return out;
}

function parseUserRequestedImmediateCard(raw: unknown): boolean {
  return raw === true;
}

function parseSessionRequest(raw: unknown): boolean {
  return raw === true;
}

function parseCoachTaskNotes(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.length <= COACH_TASK_NOTES_MAX_CHARS) return t;
  return t.slice(0, COACH_TASK_NOTES_MAX_CHARS - 3) + '...';
}

function parseGeminiJsonText(text: string): CoachGeminiJsonResponse {
  const cleanText = stripMarkdownCodeFences(text);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleanText) as Record<string, unknown>;
  } catch {
    console.error('[bubble-agent-dispatch] gemini_json_parse_failed', {
      rawCharLength: text.length,
      cleanCharLength: cleanText.length,
    });
    throw new Error('gemini_json_parse_failed');
  }
  const replyContent = typeof parsed.reply_content === 'string' ? parsed.reply_content : null;
  const createCard = typeof parsed.create_card === 'boolean' ? parsed.create_card : null;
  if (!replyContent?.trim() || createCard === null) {
    throw new Error('gemini_invalid_json_shape');
  }

  const rawTitle = parsed.task_title;
  const rawDesc = coalesceTaskDescription(parsed);

  const intake_phase = parseIntakePhase(parsed.intake_phase);
  const session_readiness_score = parseSessionReadinessScore(parsed.session_readiness_score);
  const missing_intake_categories = parseMissingIntakeCategories(parsed.missing_intake_categories);
  const user_requested_immediate_card = parseUserRequestedImmediateCard(
    parsed.user_requested_immediate_card,
  );
  const session_request = parseSessionRequest(parsed.session_request);

  const update_existing_task = parsed.update_existing_task === true;
  const updatedTitleRaw =
    typeof parsed.updated_task_title === 'string' ? parsed.updated_task_title.trim() : '';
  const updated_task_title = updatedTitleRaw.length > 0 ? updatedTitleRaw : null;
  const updated_task_description = coalesceUpdatedTaskDescription(parsed);

  const intakeTail = {
    intake_phase,
    session_readiness_score,
    missing_intake_categories,
    user_requested_immediate_card,
    session_request,
  };

  const updateTail = {
    update_existing_task,
    updated_task_title,
    updated_task_description,
  };

  const proposed_workout_metadata = parseProposedWorkoutMetadata(parsed);
  const proposedMetaOrNull =
    Object.keys(proposed_workout_metadata).length > 0 ? proposed_workout_metadata : null;

  if (createCard) {
    const titleTrimmed = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    if (!titleTrimmed) {
      throw new Error('gemini_invalid_json_shape');
    }
    return {
      reply_content: replyContent,
      create_card: true,
      task_title: titleTrimmed,
      task_description: rawDesc,
      coach_task_notes: ensureCoachTaskNotesCta(parseCoachTaskNotes(parsed.coach_task_notes)),
      proposed_workout_metadata: null,
      ...intakeTail,
      ...updateTail,
    };
  }

  return {
    reply_content: replyContent,
    create_card: false,
    task_title: null,
    task_description: null,
    coach_task_notes: null,
    proposed_workout_metadata: proposedMetaOrNull,
    ...intakeTail,
    ...updateTail,
  };
}

async function geminiGenerateJson(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  contents: GeminiContent[];
  signal: AbortSignal;
}): Promise<CoachGeminiJsonResponse> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent`;

  const body = {
    system_instruction: {
      parts: [{ text: args.systemPrompt }],
    },
    contents: args.contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      // Structured JSON only (Gemini JSON mode); required for reliable JSON.parse downstream.
      responseMimeType: 'application/json',
      responseSchema: {
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
              'Conversation stage: greeting; clarifying_session while collecting readiness; pre_draft_confirmation when asking for final green light before drafting (create_card false, proposed_workout_metadata null); ready_to_prescribe when this response actually creates the card or outputs the structured draft; other.',
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
              'TRUE when CURRENT TASK CONTEXT applies AND the user has confirmed drafting/revising OR user_requested_immediate_card—not on pre_draft_confirmation-only turns. Provide updated_task_title and/or updated_task_description and/or proposed_workout_metadata (at least one non-empty) when true. Set FALSE when creating a NEW card (create_card) or when only asking for pre-draft confirmation. Never invent task IDs — the server resolves the task.',
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
              'When update_existing_task is true: structured workout fields to merge into tasks.metadata on user finalize (exercises array with name, sets, reps; workout_type; duration_min). MUST be null on pre_draft_confirmation turns and until the user confirms drafting or user_requested_immediate_card. Use null if only updating title/description text.',
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
        },
        // Keys must be present so Gemini does not drop task_description on create_card flows.
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
      },
    },
  };

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': args.apiKey,
    },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`gemini_http_${resp.status}:${txt.slice(0, 400)}`);
  }

  const respJson = (await resp.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = respJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('gemini_empty_response');
  }

  return parseGeminiJsonText(text);
}

function formatIsoDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = value.slice(0, 10);
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : value;
}

/** Human-readable snippet from `fitness_profiles.biometrics` jsonb. */
function summarizeBiometricsJson(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const o = raw as Record<string, unknown>;
  const parts: string[] = [];
  const exp = o.experience;
  if (exp === 'beginner' || exp === 'intermediate' || exp === 'advanced') {
    parts.push(`experience: ${exp}`);
  }
  if (typeof o.sex === 'string' && o.sex.trim()) parts.push(`sex: ${o.sex.trim()}`);
  if (typeof o.age_range === 'string' && o.age_range.trim()) {
    parts.push(`age range: ${o.age_range.trim()}`);
  }
  if (typeof o.age === 'number' && o.age > 0) parts.push(`age: ${o.age}`);
  if (typeof o.weight_kg === 'number' && o.weight_kg > 0) {
    parts.push(`weight: ${Math.round(o.weight_kg)} kg`);
  }
  if (typeof o.height_cm === 'number' && o.height_cm > 0) {
    parts.push(`height: ${Math.round(o.height_cm)} cm`);
  }
  if (typeof o.injuries === 'string' && o.injuries.trim()) {
    parts.push(`injuries: ${o.injuries.trim()}`);
  }
  if (typeof o.conditions === 'string' && o.conditions.trim()) {
    parts.push(`conditions: ${o.conditions.trim()}`);
  }
  return parts.join('; ');
}

function taskSummaryLine(
  label: string,
  row: {
    title?: string | null;
    scheduled_on?: string | null;
    created_at?: string | null;
    item_type?: string | null;
  } | null,
): string {
  if (!row?.title?.trim()) return `${label}: Not on the board yet in this bubble.`;
  const date =
    formatIsoDate(row.scheduled_on ?? undefined) || formatIsoDate(row.created_at ?? undefined);
  const kind = row.item_type ? ` [${row.item_type}]` : '';
  return `${label}: ${row.title.trim()}${date ? ` (date: ${date})` : ''}${kind}`;
}

type LastWorkoutTaskRow = {
  title?: string | null;
  scheduled_on?: string | null;
  created_at?: string | null;
  item_type?: string | null;
  metadata?: unknown;
  description?: string | null;
};

/** Short line from `tasks.metadata` for workout / workout_log (see app `item-metadata` shapes). */
function summarizeWorkoutTaskMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return '';
  }
  const o = metadata as Record<string, unknown>;
  const parts: string[] = [];
  const maxLen = 450;
  if (typeof o.workout_type === 'string' && o.workout_type.trim()) {
    parts.push(`type: ${o.workout_type.trim()}`);
  }
  if (typeof o.goal === 'string' && o.goal.trim()) {
    parts.push(`goal: ${o.goal.trim()}`);
  }
  if (typeof o.duration_min === 'number' && o.duration_min > 0) {
    parts.push(`duration_min: ${o.duration_min}`);
  }
  const ex = o.exercises;
  if (Array.isArray(ex) && ex.length > 0) {
    const names: string[] = [];
    for (const e of ex) {
      if (names.length >= 12) break;
      if (e && typeof e === 'object' && !Array.isArray(e)) {
        const n = (e as Record<string, unknown>).name;
        if (typeof n === 'string' && n.trim()) names.push(n.trim());
      }
    }
    if (names.length) parts.push(`exercises: ${names.join(', ')}`);
  }
  let s = parts.join('; ');
  if (s.length > maxLen) s = s.slice(0, maxLen - 3) + '...';
  return s;
}

function metadataTimestampHint(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const o = metadata as Record<string, unknown>;
  for (const k of ['completed_at', 'session_completed_at', 'finished_at'] as const) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** No `tasks.completed_at` column; label as best-effort for the coach prompt. */
function bestEffortCompletedAtLabel(row: LastWorkoutTaskRow | null): string {
  if (!row) return 'unknown';
  const fromMeta = metadataTimestampHint(row.metadata);
  if (fromMeta) return fromMeta;
  const so = row.scheduled_on;
  if (typeof so === 'string' && so.trim()) {
    const d = formatIsoDate(so);
    return d || so.trim();
  }
  const ca = row.created_at;
  if (typeof ca === 'string' && ca.trim()) return ca.trim();
  return 'unknown';
}

function truncateOneLine(text: string | null | undefined, max = 240): string {
  if (!text?.trim()) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 3) + '...';
}

/**
 * Loads `public.users`, `public.fitness_profiles` (this bubble's workspace), and recent workout tasks
 * in the current bubble for `record.user_id`. Service-role client bypasses RLS.
 */
async function fetchUserContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  bubbleId: string,
): Promise<string | null> {
  const { data: bubble, error: bubbleErr } = await supabase
    .from('bubbles')
    .select('workspace_id')
    .eq('id', bubbleId)
    .maybeSingle();

  if (bubbleErr) {
    console.error('[bubble-agent-dispatch] fetchUserContext bubble', bubbleErr.message);
  }
  const workspaceId = (bubble as { workspace_id?: string } | null)?.workspace_id;
  if (!workspaceId) return null;

  const lastWorkoutSelect =
    'title, status, item_type, scheduled_on, created_at, metadata, description';

  const [userRes, profileRes, lastAssignedRes, lastBubbleRes, nextWorkoutRes] = await Promise.all([
    supabase.from('users').select('full_name, bio, timezone').eq('id', userId).maybeSingle(),
    supabase
      .from('fitness_profiles')
      .select('goals, equipment, unit_system, biometrics')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('tasks')
      .select(lastWorkoutSelect)
      .eq('bubble_id', bubbleId)
      .eq('assigned_to', userId)
      .in('item_type', ['workout', 'workout_log'])
      .in('status', ['done', 'completed'])
      .is('archived_at', null)
      .order('scheduled_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tasks')
      .select(lastWorkoutSelect)
      .eq('bubble_id', bubbleId)
      .in('item_type', ['workout', 'workout_log'])
      .in('status', ['done', 'completed'])
      .is('archived_at', null)
      .order('scheduled_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tasks')
      .select('title, status, item_type, scheduled_on, created_at')
      .eq('bubble_id', bubbleId)
      .eq('item_type', 'workout')
      .in('status', ['todo', 'in_progress'])
      .is('archived_at', null)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (userRes.error) {
    console.error('[bubble-agent-dispatch] fetchUserContext users', userRes.error.message);
  }
  if (profileRes.error) {
    console.error(
      '[bubble-agent-dispatch] fetchUserContext fitness_profiles',
      profileRes.error.message,
    );
  }
  if (lastAssignedRes.error) {
    console.error(
      '[bubble-agent-dispatch] fetchUserContext last workout (assigned)',
      lastAssignedRes.error.message,
    );
  }
  if (lastBubbleRes.error) {
    console.error(
      '[bubble-agent-dispatch] fetchUserContext last workout (bubble)',
      lastBubbleRes.error.message,
    );
  }
  if (nextWorkoutRes.error) {
    console.error(
      '[bubble-agent-dispatch] fetchUserContext next workout',
      nextWorkoutRes.error.message,
    );
  }

  const user = userRes.data as {
    full_name?: string | null;
    bio?: string | null;
    timezone?: string | null;
  } | null;
  const profile = profileRes.data as {
    goals?: string[] | null;
    equipment?: string[] | null;
    unit_system?: string | null;
    biometrics?: unknown;
  } | null;

  const profileBits: string[] = [];
  if (user?.full_name?.trim()) profileBits.push(`name: ${user.full_name.trim()}`);
  if (user?.timezone?.trim()) profileBits.push(`timezone: ${user.timezone.trim()}`);
  if (user?.bio?.trim()) profileBits.push(`bio: ${user.bio.trim()}`);
  if (profile?.goals?.length) profileBits.push(`goals: ${profile.goals.join(', ')}`);
  if (profile?.equipment?.length) {
    profileBits.push(`equipment: ${profile.equipment.join(', ')}`);
  }
  if (profile?.unit_system) profileBits.push(`units: ${profile.unit_system}`);
  const bioExtra = summarizeBiometricsJson(profile?.biometrics);
  if (bioExtra) profileBits.push(bioExtra);

  const profileLine = profileBits.length > 0 ? profileBits.join(' | ') : '';

  const assignedRow = lastAssignedRes.data as LastWorkoutTaskRow | null;
  const bubbleRow = lastBubbleRes.data as LastWorkoutTaskRow | null;
  let lastRow: LastWorkoutTaskRow | null = null;
  if (assignedRow?.title?.trim()) {
    lastRow = assignedRow;
  } else if (bubbleRow?.title?.trim()) {
    lastRow = bubbleRow;
  }
  const nextRow = nextWorkoutRes.data as {
    title?: string | null;
    scheduled_on?: string | null;
    created_at?: string | null;
    item_type?: string | null;
  } | null;

  const hasLast = !!lastRow?.title?.trim();
  const hasNext = !!nextRow?.title?.trim();

  const lastLine = taskSummaryLine('Last Completed Workout', lastRow);
  const nextLine = taskSummaryLine('Next Planned Workout', nextRow);

  let lastWorkoutBlock = '';
  if (hasLast && lastRow) {
    const metaSum = summarizeWorkoutTaskMetadata(lastRow.metadata);
    const descHint = metaSum ? '' : truncateOneLine(lastRow.description ?? undefined);
    const summary = metaSum || descHint || 'No structured workout details on file.';
    lastWorkoutBlock =
      '--- LAST WORKOUT CONTEXT ---\n' +
      `Title: ${lastRow.title!.trim()}\n` +
      `completed_at (best effort): ${bestEffortCompletedAtLabel(lastRow)}\n` +
      `Summary: ${summary}`;
  }

  const currentUserBlock =
    '--- CURRENT USER CONTEXT ---\n' +
    `Profile: ${profileLine || 'Not on file in this workspace yet.'}\n` +
    `${lastLine}\n` +
    `${nextLine}`;

  const tail =
    '\n\nUse this context to highly personalize your advice. Do not explicitly state that you are reading a database file, just speak to them as if you remember their journey.';

  if (!profileLine && !hasLast && !hasNext) return null;
  if (!lastWorkoutBlock) return currentUserBlock + tail;
  return currentUserBlock + '\n\n' + lastWorkoutBlock + tail;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    // Copilot suggestion ignored: keep non-POST as HTTP 200 so misrouted probes are not confused with Supabase webhook retry storms.
    return json({ ok: false, error: 'method_not_allowed' }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('BUBBLE_AGENT_WEBHOOK_SECRET')?.trim();
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (!supabaseUrl || !serviceKey || !webhookSecret) {
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  const bearer =
    req.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
      ?.trim() ?? '';
  const headerSecret = req.headers.get('x-bubble-agent-secret')?.trim() ?? '';
  const token = headerSecret || bearer;
  if (!token || token !== webhookSecret) {
    // Copilot suggestion ignored: HTTP 200 on bad secret avoids webhook infrastructure treating auth failures as delivery failures / retry loops.
    return json({ ok: false, error: 'unauthorized' }, 200);
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 200);
  }

  const evt = (payload.type ?? '').toUpperCase();
  if (payload.schema !== 'public' || payload.table !== 'messages' || evt !== 'INSERT') {
    return json({ ok: true, skipped: 'not_messages_insert' }, 200);
  }

  const record = payload.record;
  if (!record?.id || !record.user_id || !record.bubble_id) {
    return json({ ok: false, error: 'missing_record_fields' }, 200);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: selfAgent, error: selfAgentErr } = await supabase
    .from('agent_definitions')
    .select('id')
    .eq('auth_user_id', record.user_id)
    .eq('is_active', true)
    .maybeSingle();

  if (selfAgentErr) {
    console.error('[bubble-agent-dispatch] agent_definitions self lookup', selfAgentErr.message);
    return json({ ok: false, error: 'agent_lookup_failed' }, 200);
  }

  if (selfAgent) {
    return json({ ok: true, skipped: 'author_is_agent' }, 200);
  }

  const { data: bindingRows, error: bindErr } = await supabase
    .from('bubble_agent_bindings')
    .select('sort_order, agent_definitions ( slug, display_name, auth_user_id, is_active )')
    .eq('bubble_id', record.bubble_id)
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (bindErr) {
    console.error('[bubble-agent-dispatch] bindings', bindErr.message);
    return json({ ok: false, error: 'bindings_query_failed' }, 200);
  }

  const content = record.content ?? '';
  let resolvedAgentUserId: string | null = null;
  let resolvedSlug: string | null = null;
  const bubbleAgentAuthIds = new Set<string>();
  const authIdToSlug = new Map<string, string>();

  for (const raw of (bindingRows ?? []) as BindingRow[]) {
    const def = unwrapDef(raw);
    if (!def?.is_active) continue;
    if (def.auth_user_id) {
      bubbleAgentAuthIds.add(def.auth_user_id);
      authIdToSlug.set(def.auth_user_id, def.slug);
    }
    const tokenInMessage = `@${def.display_name}`;
    if (!content.includes(tokenInMessage)) continue;
    resolvedAgentUserId = def.auth_user_id;
    resolvedSlug = def.slug;
    break;
  }

  // Slack-style thread root: same parent_id for all messages in the thread (UI matches on root id).
  const threadId = record.parent_id != null ? record.parent_id : record.id;
  type HistoryRow = {
    id?: string;
    user_id?: string | null;
    content?: string | null;
    created_at?: string;
    parent_id?: string | null;
    target_task_id?: string | null;
    attached_task_id?: string | null;
  };
  let historyRows: HistoryRow[] | null = null;
  let historyErr: { message: string } | null = null;

  const loadThreadHistory = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, user_id, content, created_at, parent_id, target_task_id, attached_task_id')
      .eq('bubble_id', record.bubble_id)
      .or(`parent_id.eq.${threadId},id.eq.${threadId}`)
      .neq('id', record.id)
      .order('created_at', { ascending: false })
      .limit(10);
    historyRows = (data ?? []) as HistoryRow[];
    historyErr = error ? { message: error.message } : null;
  };

  // Thread continuation: no @mention in UI reply, but an agent already spoke in this thread.
  if (!resolvedAgentUserId && record.parent_id != null) {
    await loadThreadHistory();
    if (historyErr) {
      console.error('[bubble-agent-dispatch] history (thread continuation)', historyErr.message, {
        bubble_id: record.bubble_id,
        thread_root_id: threadId,
        message_id: record.id,
      });
    }
    for (const row of historyRows ?? []) {
      const uid = row.user_id;
      if (uid && bubbleAgentAuthIds.has(uid)) {
        resolvedAgentUserId = uid;
        resolvedSlug = authIdToSlug.get(uid) ?? null;
        break;
      }
    }
  }

  if (!resolvedAgentUserId) {
    return json({ ok: true, skipped: 'no_agent_mention' }, 200);
  }

  const geminiModel =
    Deno.env.get('GEMINI_MODEL')?.trim() ||
    Deno.env.get('VERTEX_GEMINI_MODEL')?.trim() ||
    'gemini-2.0-flash';

  const currentDate = new Date().toISOString().split('T')[0];

  const baseCoachPrompt =
    `The current date is ${currentDate}. Always use this exact date if you need to schedule a workout or include a date in a title. DO NOT use placeholders. ` +
    'CRITICAL ANTI-LOOP: reply_content must be a single concise coaching message. NEVER repeat the same phrase, sentence, note, or placeholder. Do not pad or loop text. ' +
    'CRITICAL: Task titles must be short, clean, and concise (under 100 characters). NEVER repeat the same phrase, sentence, or placeholder in task_title or reply_content. Output the exact title once and stop. ' +
    'Never use emojis in task titles, it causes database crashes. Keep all titles under 100 characters plain text. ' +
    'You are a consultative fitness coach inside BuddyBubble. Chat naturally and helpfully. ' +
    'SESSION READINESS (today) is separate from static profile completeness. Profile (CURRENT USER CONTEXT) tells you who they are generally; readiness tells you what is appropriate for THIS session (sleep/energy, soreness, equipment they have right now, time budget, intensity preference, injury flags). ' +
    'Use LAST WORKOUT CONTEXT when present to ask grounded follow-ups (recovery, progression, what felt hard), not generic questionnaires. ' +
    'Do not set create_card to true until missing_intake_categories is empty (or the user has clearly waived intake via user_requested_immediate_card) AND you can prescribe safely for today AND (you have completed PRE-DRAFT CONFIRMATION as above OR user_requested_immediate_card). If missing_intake_categories is non-empty, create_card should normally be false. ' +
    'Always prioritize asking 1–2 targeted questions over immediate card generation unless the user explicitly asks to skip questions and "just put it on a card" / generate now (then set user_requested_immediate_card true). ' +
    'Check CURRENT USER CONTEXT for goals, schedule, and default equipment: do not re-ask for data that is clearly already on file unless you need today-specific overrides (e.g. equipment_today). ' +
    'PRE-DRAFT CONFIRMATION (critical human-in-the-loop step): After session readiness is sufficient (missing_intake_categories is empty, or the user waived further intake via user_requested_immediate_card), do NOT claim the workout is finished, fully written, or already saved as a draft. Do NOT imply that structured proposed_workout_metadata or a Kanban card body already exists in the system. ' +
    'On the first turn where you would otherwise prescribe or draft, unless user_requested_immediate_card is true: (1) acknowledge what they shared, (2) say you are starting to design or are ready to draft (intent, not completion), (3) ask for a final green light—e.g. any last injuries, preferences, or explicit OK to draft. Set create_card to false; set update_existing_task to false; leave proposed_workout_metadata null; use intake_phase pre_draft_confirmation. Example tone (adapt, do not copy verbatim): "Excellent! Since you are feeling strong with good energy and no soreness, I have started to put together a challenging full-body AMRAP using bodyweight and bands—it will hit major muscle groups and keep your heart rate up. Any last items you want to address before I draft the outline?" ' +
    'Draft triggers: Only set create_card to true with full task_title and task_description AFTER the user gives clear affirmative consent to create the card (or user_requested_immediate_card). Only populate proposed_workout_metadata when update_existing_task is true AND the user has clearly confirmed they want the structured draft or revision (e.g. yes, draft it, go ahead), OR user_requested_immediate_card—never on the pre_draft_confirmation turn alone. ' +
    'When create_card is true, you must provide non-empty task_title and a rich task_description for the Kanban card body (workout details, structure, equipment, safety). Never leave task_description null or empty when create_card is true. ' +
    "When create_card is true, also populate coach_task_notes with a task-scoped coach comment: brief readiness summary, rationale for this prescription, and scaling or regression options. task_description is the executable plan; coach_task_notes are the \"why\" and how to adjust. Always end coach_task_notes with this exact call-to-action (verbatim): Does this proposed workout look good? If so, click 'Generate Workout' on the card. If you'd like any adjustments, let me know here in the chat! Use null for coach_task_notes only when create_card is false. " +
    'When create_card is false, set task_title, task_description, and coach_task_notes to null. ' +
    'When the server includes CURRENT TASK CONTEXT, the user is discussing that existing task. Follow PRE-DRAFT CONFIRMATION before emitting structured proposed_workout_metadata: on the confirmation-only turn, set update_existing_task to false and leave proposed_workout_metadata null. When the user has clearly approved drafting or revising (or user_requested_immediate_card), set update_existing_task to true and provide updated_task_title and/or updated_task_description as the FULL revised card text (not a diff), and/or proposed_workout_metadata with structured exercises (name, sets, reps, etc.), workout_type, and/or duration_min. At least one of: non-empty updated title, non-empty updated description, or non-empty proposed_workout_metadata must be present when update_existing_task is true. Prefer update_existing_task over create_card when modifying an existing card (set create_card false). The server resolves the task id — never output a task id. ' +
    'Set session_request true when the user wants a workout or session planned for today or soon; false otherwise. The server uses this for turn gating—be honest. ' +
    'Align intake_phase, session_readiness_score, and missing_intake_categories with your judgment (e.g. clarifying_session while collecting readiness; pre_draft_confirmation when asking for the final green light before drafting; ready_to_prescribe when you are actually outputting the card or structured draft in this same response). ' +
    'Return ONLY a raw JSON object (no markdown, no code fences) with keys: reply_content, create_card, task_title, task_description, update_existing_task, updated_task_title, updated_task_description, proposed_workout_metadata, intake_phase, session_readiness_score, missing_intake_categories, user_requested_immediate_card, session_request, coach_task_notes. ' +
    'You MUST respond in valid JSON matching the provided schema. Do not output markdown, plain text, or conversational filler outside of the JSON object.';

  if (!geminiApiKey) {
    console.error('[bubble-agent-dispatch] missing GEMINI_API_KEY');
    return json({ ok: false, error: 'gemini_misconfigured' }, 500);
  }

  const geminiTimeoutRaw = Number.parseInt(Deno.env.get('GEMINI_FETCH_TIMEOUT_MS') ?? '', 10);
  const geminiFetchTimeoutMs =
    Number.isFinite(geminiTimeoutRaw) && geminiTimeoutRaw >= 1000 ? geminiTimeoutRaw : 55_000;

  let replyText: string;
  let createCard: boolean;
  let taskTitle: string | null;
  let taskDescription: string | null;
  let seedTaskCommentText: string | null = null;
  let knownTargetTaskId: string | null = null;
  let updateExistingTask = false;
  let updatedTaskTitle: string | null = null;
  let updatedTaskDescription: string | null = null;
  let proposedWorkoutMetadata: Record<string, unknown> | null = null;

  try {
    if (historyRows === null) {
      await loadThreadHistory();
    }
    if (historyErr) {
      console.error('[bubble-agent-dispatch] history', historyErr.message, {
        bubble_id: record.bubble_id,
        thread_root_id: threadId,
        message_id: record.id,
      });
    }

    knownTargetTaskId = await resolveKnownTargetTaskId(supabase, record, historyRows ?? []);

    let currentTaskContextBlock = '';
    if (knownTargetTaskId) {
      const { data: ctxTask, error: ctxErr } = await supabase
        .from('tasks')
        .select('title, description')
        .eq('id', knownTargetTaskId)
        .eq('bubble_id', record.bubble_id)
        .maybeSingle();
      if (ctxErr) {
        console.error('[bubble-agent-dispatch] current task context', ctxErr.message, {
          task_id: knownTargetTaskId,
        });
      } else if (ctxTask && typeof ctxTask.title === 'string' && ctxTask.title.trim()) {
        const desc =
          typeof ctxTask.description === 'string' && ctxTask.description.trim()
            ? ctxTask.description.trim()
            : '(empty description)';
        currentTaskContextBlock =
          '--- CURRENT TASK CONTEXT ---\n' +
          `You are discussing an existing task titled "${ctxTask.title.trim()}".\n` +
          `Description:\n${desc}\n` +
          'PRE-DRAFT CONFIRMATION: Do not populate proposed_workout_metadata until the user has given clear affirmative consent to draft or revise this card (or user_requested_immediate_card). On a confirmation-only turn, set update_existing_task to false and proposed_workout_metadata to null. When they confirm, set update_existing_task to true and provide updated_task_title and/or updated_task_description with the full revised text, and/or proposed_workout_metadata with structured exercises (and workout_type, duration_min as appropriate). The user must finalize changes on the card — do not assume the database updates immediately.';
      }
    }

    const userContextBlock = await fetchUserContext(supabase, record.user_id, record.bubble_id);
    const systemPromptParts: string[] = [baseCoachPrompt];
    if (currentTaskContextBlock) systemPromptParts.push(currentTaskContextBlock);
    if (userContextBlock) systemPromptParts.push(userContextBlock);
    const systemPrompt = systemPromptParts.join('\n\n');

    const historyAsc = [...(historyRows ?? [])].reverse();
    const geminiContents: GeminiContent[] = historyAsc
      .map((m) => {
        const row = m as { user_id?: string | null; content?: string | null };
        const txt = row.content ?? '';
        if (!txt.trim()) return null;
        const role: GeminiContent['role'] =
          row.user_id && bubbleAgentAuthIds.has(row.user_id) ? 'model' : 'user';
        return { role, parts: [{ text: txt }] };
      })
      .filter((v): v is GeminiContent => v != null);

    geminiContents.push({ role: 'user', parts: [{ text: content }] });

    const out = await geminiGenerateJson({
      apiKey: geminiApiKey,
      model: geminiModel,
      systemPrompt,
      contents: geminiContents,
      signal: AbortSignal.timeout(geminiFetchTimeoutMs),
    });
    replyText = out.reply_content;
    createCard = out.create_card;
    taskTitle = out.task_title;
    taskDescription = out.task_description;
    seedTaskCommentText = createCard ? out.coach_task_notes : null;
    updateExistingTask = out.update_existing_task;
    updatedTaskTitle = out.updated_task_title;
    updatedTaskDescription = out.updated_task_description;
    proposedWorkoutMetadata = out.proposed_workout_metadata;

    if (knownTargetTaskId && out.update_existing_task) {
      createCard = false;
      taskTitle = null;
      taskDescription = null;
      seedTaskCommentText = null;
    }

    const priorUserMessageCount = historyAsc.filter(
      (m) => m.user_id && !bubbleAgentAuthIds.has(m.user_id),
    ).length;

    if (!out.user_requested_immediate_card) {
      let layerBReason: string | null = null;
      if (priorUserMessageCount === 0) {
        layerBReason = 'first_message_card_blocked';
      } else if (out.session_request && priorUserMessageCount < 2) {
        layerBReason = 'session_request_turn_gate';
      }
      if (layerBReason !== null) {
        createCard = false;
        taskTitle = null;
        taskDescription = null;
        seedTaskCommentText = null;
      }
    }

    if (knownTargetTaskId && updateExistingTask) {
      createCard = false;
      taskTitle = null;
      taskDescription = null;
      seedTaskCommentText = null;
    }
  } catch (e) {
    console.error('[bubble-agent-dispatch] gemini', String(e), {
      message_id: record.id,
      slug: resolvedSlug,
    });
    return json({ ok: false, error: 'gemini_failed', detail: String(e) }, 500);
  }

  const trimmedNewTitle = updatedTaskTitle?.trim() ?? '';
  const trimmedNewDesc = updatedTaskDescription?.trim() ?? '';
  const hasUpdateBody = trimmedNewTitle.length > 0 || trimmedNewDesc.length > 0;
  const hasProposedMeta =
    proposedWorkoutMetadata != null && Object.keys(proposedWorkoutMetadata).length > 0;
  const shouldInsertDraft =
    knownTargetTaskId !== null && updateExistingTask && (hasUpdateBody || hasProposedMeta);

  let rpcData: unknown;
  let rpcErr: { message: string } | null;

  if (shouldInsertDraft) {
    const draftPayload: AgentInsertCoachDraftRpcArgs = {
      p_trigger_message_id: record.id,
      p_thread_id: threadId,
      p_agent_auth_user_id: resolvedAgentUserId!,
      p_invoker_user_id: record.user_id,
      p_target_task_id: knownTargetTaskId!,
      p_reply_text: replyText,
      p_proposed_title: trimmedNewTitle.length > 0 ? trimmedNewTitle : null,
      p_proposed_description: trimmedNewDesc.length > 0 ? trimmedNewDesc : null,
      p_proposed_metadata: hasProposedMeta ? proposedWorkoutMetadata! : {},
    };
    const draft = await supabase.rpc('agent_insert_coach_workout_draft_reply', draftPayload);
    rpcData = draft.data;
    rpcErr = draft.error ? { message: draft.error.message } : null;
  } else {
    const rpcPayload: AgentCreateCardRpcArgs = {
      p_trigger_message_id: record.id,
      p_thread_id: threadId,
      p_agent_auth_user_id: resolvedAgentUserId!,
      p_invoker_user_id: record.user_id,
      p_reply_text: replyText,
      p_create_card: createCard,
      // @Coach / workout bubble: Kanban cards are workout templates (`tasks.item_type = 'workout'`).
      p_task_type: 'workout',
      p_task_status: 'todo',
    };
    if (createCard && taskTitle) {
      rpcPayload.p_task_title = taskTitle;
      // Always pass through to Postgres (null clears default); matches `agent_create_card_and_reply.p_task_description`.
      rpcPayload.p_task_description = taskDescription ?? null;
      rpcPayload.p_seed_task_comment_text = seedTaskCommentText ?? null;
    }
    const cr = await supabase.rpc('agent_create_card_and_reply', rpcPayload);
    rpcData = cr.data;
    rpcErr = cr.error ? { message: cr.error.message } : null;
  }

  if (rpcErr) {
    console.error('[bubble-agent-dispatch] rpc', rpcErr.message, {
      message_id: record.id,
      slug: resolvedSlug,
    });
    return json({ ok: false, error: 'rpc_failed', detail: rpcErr.message }, 500);
  }

  if (
    rpcData &&
    typeof rpcData === 'object' &&
    'ok' in rpcData &&
    (rpcData as { ok?: unknown }).ok === false
  ) {
    console.error('[bubble-agent-dispatch] rpc returned ok false', {
      message_id: record.id,
      slug: resolvedSlug,
      rpcData,
    });
    return json({ ok: false, error: 'rpc_rejected', detail: rpcData }, 500);
  }

  return json({ ok: true, result: rpcData }, 200);
});
