import {
  WORKOUT_INTAKE_SORENESS_OPTIONS,
  type TaskModalIntakePatch,
} from '@/lib/agents/coach/task-modal-intake-patch';
import type { Json } from '@/types/database';

export const SESSION_READINESS_CONTEXT_VERSION = 1 as const;

export type SessionReadinessContextSource = 'task_modal_preflight';

export type SessionReadinessContext = {
  v: typeof SESSION_READINESS_CONTEXT_VERSION;
  captured_at: string;
  readiness: number;
  sleep_quality: number;
  soreness: string[];
  source: SessionReadinessContextSource;
};

export type PreflightPayload = {
  readiness: number;
  sleepQuality: number;
  soreness: string[];
};

const SORENESS_SET = new Set<string>(WORKOUT_INTAKE_SORENESS_OPTIONS as unknown as string[]);

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function normalizeSoreness(raw: string[]): string[] {
  const filtered = raw.map((s) => s.trim()).filter((s) => s && SORENESS_SET.has(s));
  const unique = [...new Set(filtered)];
  if (unique.includes('None') && unique.length > 1) {
    return normalizeSoreness(unique.filter((s) => s !== 'None'));
  }
  if (unique.length === 0) return ['None'];
  return unique.sort();
}

export function buildSessionReadinessContext(payload: PreflightPayload): SessionReadinessContext {
  return {
    v: SESSION_READINESS_CONTEXT_VERSION,
    captured_at: new Date().toISOString(),
    readiness: clampInt(payload.readiness, 1, 10),
    sleep_quality: clampInt(payload.sleepQuality, 1, 10),
    soreness: normalizeSoreness(payload.soreness),
    source: 'task_modal_preflight',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function readSessionReadinessContext(metadata: unknown): SessionReadinessContext | null {
  if (!isRecord(metadata)) return null;
  const raw = metadata.session_readiness_context;
  if (!isRecord(raw)) return null;
  if (raw.v !== SESSION_READINESS_CONTEXT_VERSION) return null;
  if (typeof raw.captured_at !== 'string' || !raw.captured_at.trim()) return null;
  if (raw.source !== 'task_modal_preflight') return null;
  if (typeof raw.readiness !== 'number' || !Number.isFinite(raw.readiness)) return null;
  if (typeof raw.sleep_quality !== 'number' || !Number.isFinite(raw.sleep_quality)) return null;
  if (!Array.isArray(raw.soreness)) return null;
  if (!raw.soreness.every((s) => typeof s === 'string')) return null;

  const readiness = clampInt(raw.readiness, 1, 10);
  const sleep_quality = clampInt(raw.sleep_quality, 1, 10);
  const soreness = normalizeSoreness(raw.soreness);

  return {
    v: SESSION_READINESS_CONTEXT_VERSION,
    captured_at: raw.captured_at,
    readiness,
    sleep_quality,
    soreness,
    source: 'task_modal_preflight',
  };
}

export function mergeSessionReadinessIntoMetadata(
  metadata: Json,
  ctx: SessionReadinessContext,
): Json {
  const base = isRecord(metadata) ? metadata : {};
  return {
    ...base,
    session_readiness_context: ctx,
  } satisfies Json;
}

/** Preflight subset of coach intake patch fields (for rail trim when factory exists). */
export function preflightTaskModalLiveStateFields(patch: {
  wizard_step?: TaskModalIntakePatch['wizard_step'];
  readiness?: number;
  sleep_quality?: number;
  soreness?: string[];
}): Pick<TaskModalIntakePatch, 'wizard_step' | 'readiness' | 'sleep_quality' | 'soreness'> {
  const out: Pick<
    TaskModalIntakePatch,
    'wizard_step' | 'readiness' | 'sleep_quality' | 'soreness'
  > = {};
  if (patch.wizard_step !== undefined) out.wizard_step = patch.wizard_step;
  if (patch.readiness !== undefined) out.readiness = patch.readiness;
  if (patch.sleep_quality !== undefined) out.sleep_quality = patch.sleep_quality;
  if (patch.soreness !== undefined) out.soreness = patch.soreness;
  return out;
}
