/**
 * Read Coach `structural_patch` from reply message metadata.
 */

import type { CoachStructuralPatchOp } from '@/lib/agents/_shared/workout-metadata/structural-patch-types';
import { parseStructuralPatchFromGemini } from '@/lib/agents/coach/parse';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** Extract structural_patch ops from a coach reply `messages.metadata` value. */
export function parseStructuralPatchFromMessageMetadata(
  metadata: unknown,
): CoachStructuralPatchOp[] | null {
  if (!isPlainObject(metadata)) return null;
  return parseStructuralPatchFromGemini(metadata.structural_patch);
}
