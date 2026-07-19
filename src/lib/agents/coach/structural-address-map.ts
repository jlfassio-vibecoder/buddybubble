/**
 * Stamp stable block_id / exercise_id onto a slim workout_set and build
 * `structural_address_map` for Coach CURRENT WORKOUT CONTEXT.
 *
 * IDs match {@link buildWorkoutSessionViewModel} fallbacks for blocks so canvas
 * drafts can apply `structural_patch` without a second rewrite.
 *
 * Factory shape is typically `workout_set.workouts[0].exerciseBlocks`; also
 * supports a flat session object with top-level `exerciseBlocks`.
 * Warm-up / finisher / cooldown stamp nested `exercises[]` when present (exercise-shaped).
 */

export type StructuralAddressExercise = {
  exercise_id: string;
  name: string;
};

export type StructuralAddressBlock = {
  block_id: string;
  block_name: string;
  exercises: StructuralAddressExercise[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function positiveOrder(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v);
  return fallback;
}

function exerciseDisplayName(ex: Record<string, unknown>): string {
  if (typeof ex.exerciseName === 'string' && ex.exerciseName.trim()) return ex.exerciseName.trim();
  if (typeof ex.name === 'string' && ex.name.trim()) return ex.name.trim();
  return 'Exercise';
}

function stampExercisesOnBlock(
  blockId: string,
  exercisesIn: unknown,
): { exercisesOut: unknown[]; addressExercises: StructuralAddressExercise[] } {
  if (!Array.isArray(exercisesIn)) {
    return { exercisesOut: [], addressExercises: [] };
  }
  const exercisesOut: unknown[] = [];
  const addressExercises: StructuralAddressExercise[] = [];
  for (let j = 0; j < exercisesIn.length; j++) {
    const exRaw = exercisesIn[j];
    if (!isPlainObject(exRaw)) {
      exercisesOut.push(exRaw);
      continue;
    }
    const exerciseId =
      typeof exRaw.id === 'string' && exRaw.id.trim() ? exRaw.id.trim() : `${blockId}:e${j}`;
    const name = exerciseDisplayName(exRaw);
    addressExercises.push({ exercise_id: exerciseId, name });
    exercisesOut.push({ ...exRaw, id: exerciseId });
  }
  return { exercisesOut, addressExercises };
}

function stampInstructionBlocks(
  blocks: unknown,
  section: 'warmup' | 'finisher' | 'cooldown',
  address: StructuralAddressBlock[],
): unknown[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((raw, index) => {
    if (!isPlainObject(raw)) return raw;
    const order = positiveOrder(raw.order, index + 1);
    const blockId =
      typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `${section}-${order}-${index}`;
    const blockName =
      typeof raw.exerciseName === 'string' && raw.exerciseName.trim()
        ? raw.exerciseName.trim()
        : typeof raw.name === 'string' && raw.name.trim()
          ? raw.name.trim()
          : section;
    const { exercisesOut, addressExercises } = stampExercisesOnBlock(blockId, raw.exercises);
    address.push({
      block_id: blockId,
      block_name: blockName,
      exercises: addressExercises,
    });
    return exercisesOut.length > 0
      ? { ...raw, id: blockId, exercises: exercisesOut }
      : { ...raw, id: blockId };
  });
}

function stampExerciseBlocks(blocks: unknown, address: StructuralAddressBlock[]): unknown[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((raw, index) => {
    if (!isPlainObject(raw)) return raw;
    const order = positiveOrder(raw.order, index + 1);
    const blockId =
      typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `main-${order}-${index}`;
    const blockName =
      typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Main work';
    const { exercisesOut, addressExercises } = stampExercisesOnBlock(blockId, raw.exercises);
    address.push({
      block_id: blockId,
      block_name: blockName,
      exercises: addressExercises,
    });
    return { ...raw, id: blockId, exercises: exercisesOut };
  });
}

function stampSessionObject(
  session: Record<string, unknown>,
  address: StructuralAddressBlock[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...session };
  if (Array.isArray(session.warmupBlocks)) {
    next.warmupBlocks = stampInstructionBlocks(session.warmupBlocks, 'warmup', address);
  }
  if (Array.isArray(session.exerciseBlocks)) {
    next.exerciseBlocks = stampExerciseBlocks(session.exerciseBlocks, address);
  }
  if (Array.isArray(session.finisherBlocks)) {
    next.finisherBlocks = stampInstructionBlocks(session.finisherBlocks, 'finisher', address);
  }
  if (Array.isArray(session.cooldownBlocks)) {
    next.cooldownBlocks = stampInstructionBlocks(session.cooldownBlocks, 'cooldown', address);
  }
  return next;
}

export type StampStructuralIdsResult = {
  workoutSet: Record<string, unknown>;
  structuralAddressMap: StructuralAddressBlock[];
};

/**
 * Clone `workout_set`, ensure every block/exercise has an `id`, and return the
 * compact address map for the Coach prompt.
 */
export function stampStructuralIdsOnWorkoutSet(
  workoutSet: unknown,
): StampStructuralIdsResult | null {
  if (!isPlainObject(workoutSet)) return null;
  const address: StructuralAddressBlock[] = [];
  const next: Record<string, unknown> = { ...workoutSet };

  const workouts = workoutSet.workouts;
  if (Array.isArray(workouts) && workouts.length > 0 && isPlainObject(workouts[0])) {
    const stampedSession = stampSessionObject(workouts[0], address);
    next.workouts = [stampedSession, ...workouts.slice(1)];
  } else {
    Object.assign(next, stampSessionObject(workoutSet, address));
  }

  if (address.length === 0) return null;
  return { workoutSet: next, structuralAddressMap: address };
}
