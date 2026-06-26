/**
 * Multi-exercise interval circuit cardinality helpers (Phase F1).
 * Mirror: `supabase/functions/agents/coach/interval-circuit-cardinality.ts`.
 */

import type { BlockShapeDropReason } from './block-blueprint-library.ts';

const WORD_NUMBERS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const STATED_COUNT_PATTERN =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:bodyweight\s+)?(?:exercises?|movements?|stations?)\b/i;

const BLOCK_NAME_COUNT_PATTERN = /(\d+)\s+exercises?/i;

function parseCountToken(token: string): number | null {
  const digit = Number(token);
  if (Number.isInteger(digit) && digit >= 1 && digit <= 20) return digit;
  const word = WORD_NUMBERS[token.toLowerCase()];
  return word ?? null;
}

/** Parse explicit exercise/station count from user prose (e.g. "4 exercises"). */
export function parseStatedExerciseCount(text: string): number | null {
  const match = text.match(STATED_COUNT_PATTERN);
  if (!match?.[1]) return null;
  return parseCountToken(match[1]);
}

function tokenIndex(messageText: string, token: string): number {
  const i = messageText.indexOf(token);
  return i >= 0 ? i : Number.MAX_SAFE_INTEGER;
}

/** Message slice from blockToken through the next block token (or end). */
export function messageSegmentForBlockToken(
  messageText: string,
  blockToken: string,
  allBlockTokens: readonly string[],
): string {
  const sorted = [...allBlockTokens].sort(
    (a, b) => tokenIndex(messageText, a) - tokenIndex(messageText, b),
  );
  const idx = sorted.indexOf(blockToken);
  if (idx < 0) return messageText;
  const start = tokenIndex(messageText, blockToken);
  const end =
    idx + 1 < sorted.length ? tokenIndex(messageText, sorted[idx + 1]!) : messageText.length;
  return messageText.slice(start, end);
}

export function parseExerciseCountFromBlockName(blockName: string): number | null {
  const match = blockName.match(BLOCK_NAME_COUNT_PATTERN);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
}

export function looksLikeCompoundIntervalExerciseName(name: string): boolean {
  return /\b(to|and)\b/i.test(name.trim());
}

export function validateTabataCircuitCardinality(
  exerciseCount: number,
  hints?: {
    blockName?: string;
    requestedCount?: number | null;
    singleExerciseName?: string;
  },
): BlockShapeDropReason | null {
  const fromName = hints?.blockName ? parseExerciseCountFromBlockName(hints.blockName) : null;
  const requested = hints?.requestedCount ?? fromName;
  if (requested != null && exerciseCount < requested) {
    return 'tabata_circuit_cardinality';
  }
  if (
    exerciseCount === 1 &&
    requested != null &&
    requested > 1 &&
    looksLikeCompoundIntervalExerciseName(hints?.singleExerciseName ?? '')
  ) {
    return 'tabata_circuit_cardinality';
  }
  return null;
}

export function genericIntervalCircuitPlaceholderName(index: number): string {
  return `Movement ${index + 1}`;
}
