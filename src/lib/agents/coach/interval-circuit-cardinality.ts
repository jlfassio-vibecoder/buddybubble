/**
 * Multi-exercise interval circuit cardinality helpers (Phase F1).
 * Mirror: `supabase/functions/agents/coach/interval-circuit-cardinality.ts`.
 */

import type { BlockShapeDropReason } from './block-blueprint-library';

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
    looksLikeCompoundIntervalExerciseName(hints?.singleExerciseName ?? '')
  ) {
    return 'tabata_circuit_cardinality';
  }
  return null;
}

export function genericIntervalCircuitPlaceholderName(index: number): string {
  return `Movement ${index + 1}`;
}
