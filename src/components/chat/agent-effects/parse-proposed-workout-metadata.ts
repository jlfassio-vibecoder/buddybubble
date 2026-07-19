/**
 * Read a creation/pre-rich Coach proposal from reply message metadata.
 * Existing rich-canvas mutations use `structural_patch`, not this effect.
 * Legacy draft replies may carry `coach_draft.proposed_metadata`.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function hasUsableProposed(proposed: Record<string, unknown>): boolean {
  if (Array.isArray(proposed.blocks) && proposed.blocks.length > 0) return true;
  if (Array.isArray(proposed.exercises) && proposed.exercises.length > 0) return true;
  if (typeof proposed.workout_type === 'string' && proposed.workout_type.trim()) return true;
  if (typeof proposed.duration_min === 'number' && Number.isFinite(proposed.duration_min)) {
    return true;
  }
  return false;
}

/** Extract proposed workout metadata payload from a coach reply `messages.metadata` value. */
export function parseProposedWorkoutMetadataFromMessageMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  if (!isPlainObject(metadata)) return null;

  const top = metadata.proposed_workout_metadata;
  if (isPlainObject(top) && hasUsableProposed(top)) return top;

  const draft = metadata.coach_draft;
  if (isPlainObject(draft)) {
    const proposed = draft.proposed_metadata;
    if (isPlainObject(proposed) && hasUsableProposed(proposed)) return proposed;
  }

  return null;
}
