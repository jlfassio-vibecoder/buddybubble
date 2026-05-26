/**
 * Map rich factory session exerciseBlocks → Coach outline placeholders for re-hydration.
 * Deno mirror: `supabase/functions/_shared/workout-metadata/factory-session-to-coach-outline.ts`.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

export function getPrimaryRichSession(meta: unknown): Record<string, unknown> | null {
  if (!isPlainObject(meta)) return null;
  const af = meta.ai_workout_factory;
  if (!isPlainObject(af)) return null;
  const ws = af.workout_set;
  if (!isPlainObject(ws)) return null;
  const workouts = ws.workouts;
  if (!Array.isArray(workouts) || workouts.length === 0) return null;
  const s0 = workouts[0];
  return isPlainObject(s0) ? s0 : null;
}

function factoryExerciseToOutlinePlaceholder(ex: Record<string, unknown>): { name: string } | null {
  const name =
    typeof ex.exerciseName === 'string'
      ? ex.exerciseName.trim()
      : typeof ex.name === 'string'
        ? ex.name.trim()
        : '';
  if (!name) return null;
  return { name };
}

/** Parametric exerciseBlocks only — instruction warmup/finisher rows omitted. */
export function richSessionExerciseBlocksToCoachOutline(
  session: Record<string, unknown>,
): Record<string, unknown>[] {
  const raw = session.exerciseBlocks;
  if (!Array.isArray(raw)) return [];
  const out: Record<string, unknown>[] = [];
  for (const blk of raw) {
    if (!isPlainObject(blk)) continue;
    const blockFormat =
      typeof blk.blockFormat === 'string'
        ? blk.blockFormat.trim()
        : typeof blk.block_format === 'string'
          ? blk.block_format.trim()
          : '';
    if (!blockFormat) continue;
    const blockName = typeof blk.name === 'string' ? blk.name.trim() : '';
    if (!blockName) continue;
    const exercisesRaw = Array.isArray(blk.exercises) ? blk.exercises : [];
    const exercises: Array<{ name: string }> = [];
    for (const ex of exercisesRaw) {
      if (!isPlainObject(ex)) continue;
      const row = factoryExerciseToOutlinePlaceholder(ex);
      if (row) exercises.push(row);
    }
    const formatParamsRaw = blk.formatParams ?? blk.format_params;
    const row: Record<string, unknown> = {
      name: blockName,
      block_format: blockFormat,
      exercises,
    };
    if (isPlainObject(formatParamsRaw) && Object.keys(formatParamsRaw).length > 0) {
      row.format_params = JSON.parse(JSON.stringify(formatParamsRaw)) as Record<string, unknown>;
    }
    out.push(row);
  }
  return out;
}

export function syncCoachOutlineFromRichMetadata(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const session = getPrimaryRichSession(meta);
  if (!session) return meta;
  const outline = richSessionExerciseBlocksToCoachOutline(session);
  if (outline.length === 0) return meta;
  const next = { ...meta };
  next.coach_workout_outline = outline;
  next.coach_outline_status = 'ready';
  delete next.coach_outline_error;
  next.coach_outline_drops = [];
  if (
    typeof next.coach_outline_confirmed_at !== 'string' ||
    !next.coach_outline_confirmed_at.trim()
  ) {
    next.coach_outline_confirmed_at = new Date().toISOString();
  }
  return next;
}
