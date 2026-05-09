/**
 * Pure error classification for the consolidated dispatcher (no network, no Deno env).
 * Kept separate from `vertex-gemini.ts` so Vitest can cover the mapping without loading
 * the full Vertex client.
 */

import type { VertexErrorKind } from './types.ts';

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

const STRATEGY_PARSE_MESSAGES = new Set(['gemini_json_parse_failed', 'gemini_empty_response']);
const STRATEGY_SHAPE_MESSAGES = new Set(['gemini_invalid_json_shape']);

/** Map an unknown error to the dispatcher's fallback-decision discriminator. */
export function classifyError(err: unknown): VertexErrorKind {
  if (err && typeof err === 'object' && 'kind' in err) {
    const kind = (err as { kind?: unknown }).kind;
    if (
      kind === 'http' ||
      kind === 'parse' ||
      kind === 'shape' ||
      kind === 'timeout' ||
      kind === 'auth' ||
      kind === 'truncated' ||
      kind === 'self_attestation_mismatch' ||
      kind === 'cue_unanchored'
    ) {
      return kind;
    }
  }
  if (err instanceof Error && STRATEGY_PARSE_MESSAGES.has(err.message)) return 'parse';
  if (err instanceof Error && STRATEGY_SHAPE_MESSAGES.has(err.message)) return 'shape';
  if (isAbortError(err)) return 'timeout';
  return 'http';
}
