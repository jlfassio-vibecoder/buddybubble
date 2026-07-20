import { describe, expect, it } from 'vitest';
import {
  resolveStructuralEffectApplyGate,
  shouldClaimStructuralEffectAfterApply,
} from './structural-effect-claim';

describe('resolveStructuralEffectApplyGate', () => {
  it('applies while dirty (coach_notes write-through); only missing handle defers', () => {
    expect(
      resolveStructuralEffectApplyGate({
        alreadyClaimed: false,
        hasCanvasHandle: true,
        canvasEditDirty: true,
      }),
    ).toBe('apply_now');
  });

  it('defers when canvas handle is missing', () => {
    expect(
      resolveStructuralEffectApplyGate({
        alreadyClaimed: false,
        hasCanvasHandle: false,
        canvasEditDirty: false,
      }),
    ).toBe('defer');
  });

  it('allows apply when pristine handle is ready', () => {
    expect(
      resolveStructuralEffectApplyGate({
        alreadyClaimed: false,
        hasCanvasHandle: true,
        canvasEditDirty: false,
      }),
    ).toBe('apply_now');
  });
});

describe('shouldClaimStructuralEffectAfterApply', () => {
  it('claims only on successful apply', () => {
    expect(shouldClaimStructuralEffectAfterApply(true)).toBe(true);
    expect(shouldClaimStructuralEffectAfterApply(false)).toBe(false);
  });
});
