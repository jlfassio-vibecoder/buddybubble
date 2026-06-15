import type { OutlineFillValidationReason } from '@/lib/workout-factory/outline-block-preflight';

export type OutlineFillTelemetry = {
  pipeline: 'parametric_outline_fill';
  latencyMs: number;
  attemptCount: number;
  maxAttempts: number;
  outlineBlockCount: number;
  exerciseCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  finishReason: string | null;
  truncated: boolean;
  model: string;
  requestId?: string;
  failureKind?: 'validation' | 'parse';
  validationReason?: OutlineFillValidationReason;
  validationError?: string;
  fillFallback?: boolean;
  fillFallbackReason?: string;
};

export function countPreflightExercises(blocks: Record<string, unknown>[]): number {
  return blocks.reduce((sum, block) => {
    if (!Array.isArray(block.exercises)) return sum;
    return sum + block.exercises.length;
  }, 0);
}

export function isVertexFinishLikelyTruncated(
  finishReason: string | null,
  completionTokens: number | null,
  maxTokens: number,
  ratio = 0.95,
): boolean {
  const reason = finishReason?.toLowerCase();
  if (reason === 'length' || reason === 'max_tokens') return true;
  if (completionTokens != null && completionTokens >= maxTokens * ratio) return true;
  return false;
}
