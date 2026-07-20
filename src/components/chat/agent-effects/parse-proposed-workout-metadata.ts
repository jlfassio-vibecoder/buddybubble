/**
 * Read a creation/pre-rich Coach proposal from reply message metadata.
 * Existing rich-canvas mutations use `structural_patch`, not this effect.
 * Legacy draft replies may carry `coach_draft.proposed_metadata`.
 */

import type { ProposedWorkoutMetadataView } from '@/lib/agents/coach/proposed-workout-metadata-view';
import {
  coerceProposedWorkoutMetadataView,
  hasUsableProposedWorkoutMetadata,
} from '@/lib/agents/coach/proposed-workout-metadata-view';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** Extract proposed workout metadata payload from a coach reply `messages.metadata` value. */
export function parseProposedWorkoutMetadataFromMessageMetadata(
  metadata: unknown,
): ProposedWorkoutMetadataView | null {
  if (!isPlainObject(metadata)) return null;

  const top = coerceProposedWorkoutMetadataView(metadata.proposed_workout_metadata);
  if (top && hasUsableProposedWorkoutMetadata(top)) return top;

  const draft = metadata.coach_draft;
  if (isPlainObject(draft)) {
    const proposed = coerceProposedWorkoutMetadataView(draft.proposed_metadata);
    if (proposed && hasUsableProposedWorkoutMetadata(proposed)) return proposed;
  }

  return null;
}
