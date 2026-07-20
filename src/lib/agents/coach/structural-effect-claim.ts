/**
 * Gate for Coach `structural_patch` client effects: never claim a messageId until
 * the canvas apply succeeds. Missing handle → defer (pending retry).
 *
 * Dirty drafts are not deferred by this gate: `applyStructuralPatch` write-throughs
 * coach_notes while dirty. Non–notes ops that refuse apply stay unclaimed and must
 * be re-queued by the caller for flush-after-discard.
 */

export type StructuralEffectApplyGate = 'already_claimed' | 'defer' | 'apply_now';

export function resolveStructuralEffectApplyGate(args: {
  alreadyClaimed: boolean;
  hasCanvasHandle: boolean;
  /** @deprecated Ignored — coach_notes apply while dirty; kept for call-site compat. */
  canvasEditDirty?: boolean;
}): StructuralEffectApplyGate {
  if (args.alreadyClaimed) return 'already_claimed';
  if (!args.hasCanvasHandle) return 'defer';
  return 'apply_now';
}

/** Claim only after a successful canvas apply (not on dirty refuse / no-op). */
export function shouldClaimStructuralEffectAfterApply(applied: boolean): boolean {
  return applied === true;
}
