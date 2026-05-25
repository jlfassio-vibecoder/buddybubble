import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  buildPlayerInitialLogRowsForExercise,
  buildPlayerInitialLogs,
} from '@/lib/workout-factory/resolve-player-log-row-count';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export type GhostSetSnapshot = {
  weight: string | null;
  reps: string | null;
  rpe: string | null;
};

const BLANK_CELL: SetDraft = { weight: '', reps: '', rpe: '', done: false };

/** Active Session: same row counts as player initial logs, but blank editable values. */
export function buildBlankSessionDraftLogs(
  exercises: WorkoutExercise[],
  blocks: WorkoutSessionBlockView[],
): SetDraft[][] {
  return buildPlayerInitialLogs(exercises, blocks).map((rows) =>
    rows.map(() => ({ ...BLANK_CELL })),
  );
}

function emptyGhostMatrix(
  exercises: WorkoutExercise[],
  blocks: WorkoutSessionBlockView[],
): GhostSetSnapshot[][] {
  return exercises.map((ex, i) =>
    buildPlayerInitialLogRowsForExercise(ex, i, blocks).map(() => ({
      weight: null,
      reps: null,
      rpe: null,
    })),
  );
}

function toGhostCell(sl: unknown): GhostSetSnapshot {
  if (sl == null || typeof sl !== 'object') {
    return { weight: null, reps: null, rpe: null };
  }
  const o = sl as { weight?: unknown; reps?: unknown; rpe?: unknown };
  return {
    weight: o.weight != null ? String(o.weight) : null,
    reps: o.reps != null ? String(o.reps) : null,
    rpe: o.rpe != null ? String(o.rpe) : null,
  };
}

/** Build read-only ghost matrix from completed workout_log metadata.exercises. */
export function buildGhostLogsFromHistoricalMetadata(
  histMeta: unknown,
  exercises: WorkoutExercise[],
  blocks: WorkoutSessionBlockView[],
): GhostSetSnapshot[][] {
  const empty = emptyGhostMatrix(exercises, blocks);
  if (!histMeta || typeof histMeta !== 'object' || Array.isArray(histMeta)) {
    return empty;
  }

  const rawEx = (histMeta as { exercises?: unknown }).exercises;
  if (!Array.isArray(rawEx) || rawEx.length === 0) {
    return empty;
  }

  const byName = new Map<string, WorkoutExercise>();
  for (const h of rawEx) {
    if (h == null || typeof h !== 'object' || Array.isArray(h)) continue;
    const he = h as WorkoutExercise;
    if (typeof he.name !== 'string') continue;
    const key = he.name.toLowerCase().trim();
    if (!byName.has(key)) byName.set(key, he);
  }

  return exercises.map((ex, i) => {
    const base = buildPlayerInitialLogRowsForExercise(ex, i, blocks);
    const key = ex.name.toLowerCase().trim();
    const hist = byName.get(key);
    if (!hist?.set_logs || !Array.isArray(hist.set_logs)) {
      return base.map(() => ({ weight: null, reps: null, rpe: null }));
    }
    return base.map((_, j) => toGhostCell(hist.set_logs![j]));
  });
}

/** Per-field ghost placeholder for empty Active Session inputs. */
export function formatGhostFieldPlaceholder(
  ghost: GhostSetSnapshot | undefined,
  field: 'weight' | 'reps' | 'rpe',
  _unit: string,
): string | undefined {
  if (!ghost) return undefined;
  const w = ghost.weight?.trim();
  const r = ghost.reps?.trim();
  const rpe = ghost.rpe?.trim();

  if (field === 'weight' && w) return `Last: ${w}`;
  if (field === 'reps' && r) return `Last: ${r}`;
  if (field === 'rpe' && rpe) return `Last: ${rpe}`;
  return undefined;
}
