/**
 * Coach context loaders — Deno-only, single source of truth.
 *
 * This module owns every database-coupled helper the Coach strategy needs to assemble
 * its system prompt:
 *
 *   - `fetchCoachUserContext`               — index.ts:1096-1260
 *   - `resolveKnownTargetTaskId`            — index.ts:393-440 (+ taskIdInBubble + UUID_RE)
 *   - `loadCurrentTaskContext`              — extracted from index.ts:1601-1626
 *   - `resolveCurrentWorkoutContextJsonFromThread` — index.ts:185-209
 *     plus `extractRawWorkoutContextFromMetadata`, `isNonEmptyWorkoutPayload`,
 *     `stringifyWorkoutContextForPrompt`, `WORKOUT_CONTEXT_JSON_PROMPT_CAP`,
 *     `extractWorkoutTaskTitleFromMetadata`, `WORKOUT_OPEN_GREETING_METADATA_TITLE_KEY`,
 *     `asMetadataObject` — all from `bubble-agent-dispatch/index.ts:111-209`.
 *
 * No mirror exists for this file: it imports the real Deno Supabase client and the
 * structural placeholder is too thin for these queries. The Vitest side relies on the
 * pure modules (`config`, `parse`, `server-guards`) instead. The CURRENT TASK CONTEXT
 * block is composed by `buildCurrentTaskContextBlock` in `strategy.ts` (canonical in
 * `src/lib/agents/coach/prompts.ts`, mirrored at `./prompts.ts`).
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { log } from '../../_shared/obs/log.ts';
import { COACH_SLUG } from './config.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKOUT_CONTEXT_JSON_PROMPT_CAP = 16_000;

/** Keep in sync with `MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY` in `WorkoutCoachRail.tsx`. */
const WORKOUT_OPEN_GREETING_METADATA_TITLE_KEY = 'workout_task_title';

type AnyMessageRecordLike = {
  bubble_id?: string | null;
  target_task_id?: string | null;
  attached_task_id?: string | null;
  metadata?: unknown;
};

type HistoryRowLike = {
  target_task_id?: string | null;
  attached_task_id?: string | null;
  metadata?: unknown;
};

type LastWorkoutTaskRow = {
  title?: string | null;
  scheduled_on?: string | null;
  created_at?: string | null;
  item_type?: string | null;
  metadata?: unknown;
  description?: string | null;
};

function isUuidString(s: string): boolean {
  return UUID_RE.test(s);
}

function asMetadataObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Prefer `metadata.workoutContext` (exercise queue); else non-empty `metadata.workout_context`. */
function extractRawWorkoutContextFromMetadata(meta: unknown): unknown | null {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const o = meta as Record<string, unknown>;
  const wc = o.workoutContext ?? o['workoutContext'];
  if (wc != null && isNonEmptyWorkoutPayload(wc)) return wc;
  const wctx = o.workout_context ?? o['workout_context'];
  if (wctx != null && isNonEmptyWorkoutPayload(wctx)) return wctx;
  return null;
}

function isNonEmptyWorkoutPayload(raw: unknown): boolean {
  if (raw == null) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'object') return Object.keys(raw as object).length > 0;
  if (typeof raw === 'string') return raw.trim().length > 0;
  return true;
}

export function stringifyWorkoutContextForPrompt(raw: unknown): string {
  try {
    const s = JSON.stringify(raw ?? null);
    if (s.length <= WORKOUT_CONTEXT_JSON_PROMPT_CAP) return s;
    return `${s.slice(0, WORKOUT_CONTEXT_JSON_PROMPT_CAP)}...(truncated)`;
  } catch {
    return '';
  }
}

export function extractWorkoutTaskTitleFromMetadata(meta: Record<string, unknown>): string {
  const v = meta[WORKOUT_OPEN_GREETING_METADATA_TITLE_KEY];
  if (typeof v === 'string' && v.trim()) return v.trim();
  return 'this workout';
}

export function readWorkoutContextFromMessageMetadata(meta: unknown): unknown {
  const o = asMetadataObject(meta);
  return o['workoutContext'] ?? o['workout_context'] ?? null;
}

/**
 * Resolves the JSON string injected under `--- CURRENT WORKOUT CONTEXT ---`.
 *
 * **Default (`opts?.preferTaskMetadata !== true`)** — legacy order (mirrors
 * `bubble-agent-dispatch/index.ts:185-209`):
 * 1. Walk history oldest → newest; last non-empty `workoutContext` / `workout_context` wins.
 * 2. Trigger row `workoutContext` / `workout_context` overrides when non-empty.
 * 3. If still empty, fall back to `tasks.metadata` when non-empty object.
 *
 * **Rail co-pilot (`opts.preferTaskMetadata === true`)** — Live Co-Pilot Step 1:
 * 1. Trigger `workoutContext` / `workout_context` when non-empty (live-player override).
 * 2. Else `tasks.metadata` when non-empty object (canonical generated workout on card).
 * 3. Else walk history as in (1) (pre-generate / stale-message fallback).
 *
 * Emits one structured log per call: `coach workout context source`.
 */
export function resolveCurrentWorkoutContextJsonFromThread(
  rowsChronologicalOldestFirst: ReadonlyArray<{ metadata?: unknown }>,
  trigger: { metadata?: unknown },
  taskMetadataFallback: unknown | null,
  opts?: { preferTaskMetadata?: boolean; requestId?: string },
): string | null {
  const preferTaskMetadata = opts?.preferTaskMetadata === true;
  const requestId = opts?.requestId;

  let best: unknown | null = null;
  let source: 'trigger' | 'task_metadata' | 'history' | 'none' = 'none';

  const taskMetaEligible =
    taskMetadataFallback != null &&
    typeof taskMetadataFallback === 'object' &&
    !Array.isArray(taskMetadataFallback) &&
    isNonEmptyWorkoutPayload(taskMetadataFallback);

  if (preferTaskMetadata) {
    const fromTrigger = extractRawWorkoutContextFromMetadata(trigger.metadata);
    if (fromTrigger != null && isNonEmptyWorkoutPayload(fromTrigger)) {
      best = fromTrigger;
      source = 'trigger';
    } else if (taskMetaEligible) {
      best = taskMetadataFallback;
      source = 'task_metadata';
    } else {
      for (const r of rowsChronologicalOldestFirst) {
        const raw = extractRawWorkoutContextFromMetadata(r.metadata);
        if (raw != null && isNonEmptyWorkoutPayload(raw)) best = raw;
      }
      if (best != null) source = 'history';
    }
  } else {
    for (const r of rowsChronologicalOldestFirst) {
      const raw = extractRawWorkoutContextFromMetadata(r.metadata);
      if (raw != null && isNonEmptyWorkoutPayload(raw)) best = raw;
    }
    if (best != null) source = 'history';

    const fromTrigger = extractRawWorkoutContextFromMetadata(trigger.metadata);
    if (fromTrigger != null && isNonEmptyWorkoutPayload(fromTrigger)) {
      best = fromTrigger;
      source = 'trigger';
    }

    if (best == null && taskMetaEligible) {
      best = taskMetadataFallback;
      source = 'task_metadata';
    }
  }

  if (best == null) source = 'none';

  const s = best == null ? '' : stringifyWorkoutContextForPrompt(best);
  const result = s.length > 0 ? s : null;

  log('info', 'coach workout context source', {
    request_id: requestId,
    slug: COACH_SLUG,
    surface: preferTaskMetadata ? 'rail' : 'non_rail',
    source,
    bytes: result?.length ?? 0,
  });

  return result;
}

async function taskIdInBubble(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  taskId: string,
  bubbleId: string,
  requestId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('bubble_id', bubbleId)
    .maybeSingle();
  if (error) {
    log('warn', 'taskIdInBubble lookup failed', {
      request_id: requestId,
      slug: COACH_SLUG,
      bubble_id: bubbleId,
      task_id: taskId,
      error: error.message,
    });
    return false;
  }
  return !!data?.id;
}

/** Server-resolved task under discussion (never from LLM). */
export async function resolveKnownTargetTaskId(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  message: AnyMessageRecordLike,
  historyRows: ReadonlyArray<HistoryRowLike>,
  requestId: string,
): Promise<string | null> {
  const bubbleId = message.bubble_id;
  if (!bubbleId) return null;

  const ordered: string[] = [];
  const push = (id: unknown) => {
    if (typeof id !== 'string' || !isUuidString(id)) return;
    if (!ordered.includes(id)) ordered.push(id);
  };

  push(message.target_task_id);
  push(message.attached_task_id);
  for (const row of historyRows) {
    push(row.target_task_id);
    push(row.attached_task_id);
  }

  for (const id of ordered) {
    if (await taskIdInBubble(supabase, id, bubbleId, requestId)) return id;
  }
  return null;
}

/**
 * Load the resolved task row for CURRENT TASK CONTEXT and workout-context resolution.
 * Returns null when no task row matched.
 */
export async function loadCurrentTaskContext(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  taskId: string,
  bubbleId: string,
  requestId: string,
): Promise<{
  title: string;
  description: string | null;
  metadata: unknown | null;
  item_type: string | null;
} | null> {
  const { data: ctxTask, error: ctxErr } = await supabase
    .from('tasks')
    .select('title, description, metadata, item_type')
    .eq('id', taskId)
    .eq('bubble_id', bubbleId)
    .maybeSingle();
  if (ctxErr) {
    log('warn', 'current task context lookup failed', {
      request_id: requestId,
      slug: COACH_SLUG,
      bubble_id: bubbleId,
      task_id: taskId,
      error: ctxErr.message,
    });
    return null;
  }
  if (!ctxTask || typeof ctxTask.title !== 'string' || !ctxTask.title.trim()) {
    return null;
  }
  const row = ctxTask as {
    title: string;
    description?: string | null;
    metadata?: unknown;
    item_type?: string | null;
  };
  return {
    title: row.title,
    description: row.description ?? null,
    metadata: row.metadata ?? null,
    item_type:
      typeof row.item_type === 'string' && row.item_type.trim() ? row.item_type.trim() : null,
  };
}

/* ------------------------------------------------------------------ user context -- */

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
 * Loads `public.users`, `public.fitness_profiles` (this bubble's workspace), and
 * recent workout tasks in the current bubble for `userId`. Service-role client bypasses
 * RLS. Returns null when the user has no profile and no historical / planned workouts.
 *
 * Verbatim port of `bubble-agent-dispatch/index.ts:1096-1260`. The renamed log prefix
 * (`agent-dispatch-v2/coach`) is the only intentional difference.
 */
export async function fetchCoachUserContext(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  userId: string,
  bubbleId: string,
  requestId: string,
): Promise<string | null> {
  const { data: bubble, error: bubbleErr } = await supabase
    .from('bubbles')
    .select('workspace_id')
    .eq('id', bubbleId)
    .maybeSingle();

  if (bubbleErr) {
    log('warn', 'fetchCoachUserContext bubble lookup failed', {
      request_id: requestId,
      slug: COACH_SLUG,
      bubble_id: bubbleId,
      error: bubbleErr.message,
    });
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
      .from('task_assignees')
      .select(`task:tasks!inner(${lastWorkoutSelect})`)
      .eq('user_id', userId)
      .eq('task.bubble_id', bubbleId)
      .in('task.item_type', ['workout', 'workout_log'])
      .in('task.status', ['done', 'completed'])
      .is('task.archived_at', null)
      .order('scheduled_on', { ascending: false, nullsFirst: false, referencedTable: 'tasks' })
      .order('created_at', { ascending: false, referencedTable: 'tasks' })
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
    log('warn', 'fetchCoachUserContext users lookup failed', {
      request_id: requestId,
      slug: COACH_SLUG,
      bubble_id: bubbleId,
      user_id: userId,
      error: userRes.error.message,
    });
  }
  if (profileRes.error) {
    log('warn', 'fetchCoachUserContext fitness_profiles lookup failed', {
      request_id: requestId,
      slug: COACH_SLUG,
      bubble_id: bubbleId,
      user_id: userId,
      error: profileRes.error.message,
    });
  }
  if (lastAssignedRes.error) {
    log('warn', 'fetchCoachUserContext last workout (assigned) lookup failed', {
      request_id: requestId,
      slug: COACH_SLUG,
      bubble_id: bubbleId,
      user_id: userId,
      error: lastAssignedRes.error.message,
    });
  }
  if (lastBubbleRes.error) {
    log('warn', 'fetchCoachUserContext last workout (bubble) lookup failed', {
      request_id: requestId,
      slug: COACH_SLUG,
      bubble_id: bubbleId,
      error: lastBubbleRes.error.message,
    });
  }
  if (nextWorkoutRes.error) {
    log('warn', 'fetchCoachUserContext next workout lookup failed', {
      request_id: requestId,
      slug: COACH_SLUG,
      bubble_id: bubbleId,
      error: nextWorkoutRes.error.message,
    });
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

  const assignedJoin = lastAssignedRes.data as { task?: LastWorkoutTaskRow | null } | null;
  const assignedRow = (assignedJoin?.task ?? null) as LastWorkoutTaskRow | null;
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
