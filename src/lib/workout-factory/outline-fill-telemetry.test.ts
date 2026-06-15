import { describe, expect, it } from 'vitest';
import { isVertexFinishLikelyTruncated } from '@/lib/workout-factory/outline-fill-telemetry';
import { OUTLINE_FILL_MAX_OUTPUT_TOKENS } from '@/lib/workout-factory/outline-fill-config';

describe('isVertexFinishLikelyTruncated', () => {
  it('detects length finish_reason', () => {
    expect(isVertexFinishLikelyTruncated('length', 100, 8192)).toBe(true);
    expect(isVertexFinishLikelyTruncated('MAX_TOKENS', 100, 8192)).toBe(true);
    expect(isVertexFinishLikelyTruncated('max_tokens', 100, 8192)).toBe(true);
  });

  it('detects near-cap completion tokens', () => {
    const nearCap = Math.ceil(OUTLINE_FILL_MAX_OUTPUT_TOKENS * 0.95);
    expect(isVertexFinishLikelyTruncated('stop', nearCap, OUTLINE_FILL_MAX_OUTPUT_TOKENS)).toBe(
      true,
    );
    expect(isVertexFinishLikelyTruncated('stop', 100, OUTLINE_FILL_MAX_OUTPUT_TOKENS)).toBe(false);
  });
});
