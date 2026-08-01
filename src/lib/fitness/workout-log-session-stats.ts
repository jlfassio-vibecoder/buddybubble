import type { SetLogEntry, WorkoutExercise } from '@/lib/item-metadata';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';

const EMPTY = '—';

/** Display string for session RPE tile (`metadata.session_rpe`). */
export function readSessionRpe(meta: unknown): string {
  const o = parseTaskMetadata(meta ?? {}) as Record<string, unknown>;
  const raw = o.session_rpe;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 10) return EMPTY;
  return String(Math.round(n));
}

function completionFromMeta(o: Record<string, unknown>): number | null {
  for (const key of ['completion', 'completion_pct'] as const) {
    const raw = o[key];
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 0 && n <= 100) return Math.round(n);
  }
  return null;
}

function completionFromSetLogs(exercises: WorkoutExercise[]): number | null {
  let total = 0;
  let done = 0;
  for (const ex of exercises) {
    const logs = ex.set_logs;
    if (!Array.isArray(logs) || logs.length === 0) continue;
    for (const entry of logs as SetLogEntry[]) {
      total += 1;
      if (entry?.done === true) done += 1;
    }
  }
  if (total === 0) return null;
  return Math.round((done / total) * 100);
}

/**
 * Display string for Completion tile.
 * Prefers `completion` / `completion_pct`; else derives from set_logs done/total.
 */
export function readSessionCompletion(meta: unknown, exercises: WorkoutExercise[]): string {
  const o = parseTaskMetadata(meta ?? {}) as Record<string, unknown>;
  const fromMeta = completionFromMeta(o);
  if (fromMeta != null) return `${fromMeta}%`;
  const derived = completionFromSetLogs(exercises);
  if (derived != null) return `${derived}%`;
  return EMPTY;
}

/** Optional display-only PR flag on a flat or factory exercise object. */
export function exerciseHasPr(ex: unknown): boolean {
  if (!ex || typeof ex !== 'object') return false;
  return (ex as { pr?: unknown }).pr === true;
}

/** Duration tile value from form string or metadata.duration_min. */
export function readSessionDurationMin(
  workoutDurationMin: string,
  meta: unknown,
): { value: string; unit: string } {
  const fromForm = parseInt(workoutDurationMin.trim(), 10);
  if (!Number.isNaN(fromForm) && fromForm > 0) {
    return { value: String(fromForm), unit: 'min' };
  }
  const o = parseTaskMetadata(meta ?? {}) as Record<string, unknown>;
  const raw = o.duration_min;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return { value: String(Math.round(n)), unit: 'min' };
  return { value: EMPTY, unit: '' };
}
