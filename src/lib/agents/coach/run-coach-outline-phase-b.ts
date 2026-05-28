/**
 * Coach Phase B (outline-only) — shared parse / prompt assembly.
 *
 * Deno mirror: `supabase/functions/agents/coach/run-coach-outline-phase-b.ts`.
 * Run `pnpm check:agent-mirror`.
 *
 * LLM transport lives in callers (Edge `generateContent`, Next.js Gemini fetch).
 */

import { buildBlockBlueprintLibraryPrompt } from './block-blueprint-library';
import { applyEmomMultiExerciseAlternatingSafety } from './emom-outline-safety';
import { ensureOutlineExercisePlaceholders } from './outline-exercise-placeholders';
import type { BlockShapeDrop } from './parse';
import { parseCoachOutlineOnlyBlocksFromText } from './parse';
import { buildCoachOutlineOnlyPrompt, COACH_OUTLINE_ONLY_SYSTEM_PROMPT } from './prompts';

export type CoachOutlinePhaseBErrorKind =
  | 'generate_failed'
  | 'truncated'
  | 'empty_text'
  | 'no_blocks'
  | 'parse_failed';

export type CoachOutlinePhaseBResult =
  | { ok: true; blocks: Record<string, unknown>[]; drops: BlockShapeDrop[] }
  | {
      ok: false;
      errorKind: CoachOutlinePhaseBErrorKind;
      message: string;
      drops?: BlockShapeDrop[];
    };

export type CoachOutlinePhaseBPromptInput = {
  title: string;
  description: string;
  userMessage?: string;
  blueprintLibraryPrompt?: string;
};

const OUTLINE_PARSE_LOG_PREFIX = '[coach-outline-phase-b]';

function logOutlineParseFailure(args: {
  errorKind: CoachOutlinePhaseBErrorKind;
  message: string;
  text: string;
  drops: BlockShapeDrop[];
  outlineCount: number;
}): void {
  const { errorKind, message, text, drops, outlineCount } = args;
  const dropsByReason = drops.reduce<Record<string, number>>((acc, d) => {
    const key = String(d.reason);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.error(`${OUTLINE_PARSE_LOG_PREFIX} ${errorKind}:`, message, {
    outline_block_count: outlineCount,
    drop_count: drops.length,
    drops_by_reason: dropsByReason,
    drops,
    response_text_chars: text.length,
    response_text_head: text.slice(0, 1200),
    response_text_tail: text.length > 1200 ? text.slice(-1200) : undefined,
  });
}

export function buildCoachOutlinePhaseBPrompts(input: CoachOutlinePhaseBPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const blueprintLibrary = input.blueprintLibraryPrompt ?? buildBlockBlueprintLibraryPrompt();
  const userPrompt = buildCoachOutlineOnlyPrompt(
    input.title,
    input.description,
    input.userMessage ?? '',
    blueprintLibrary,
  );
  return { systemPrompt: COACH_OUTLINE_ONLY_SYSTEM_PROMPT, userPrompt };
}

/** Human-readable reason when Hop 2 (Phase B) is not invoked — for dispatch logs. */
export function coachOutlinePhaseBSkipReason(args: {
  isRailSurface: boolean;
  isActiveWorkoutSession: boolean;
  createCard: boolean;
  updateExistingTask: boolean;
  hasCoachOutline: boolean;
  hasProposedParametricBlocks: boolean;
  cardActionTriggerGeneration: boolean;
}): string | null {
  if (args.isRailSurface) return 'rail_surface';
  if (args.isActiveWorkoutSession) return 'active_workout_session';
  if (args.cardActionTriggerGeneration) return 'card_action_trigger_generation';
  if (args.hasCoachOutline) return 'coach_workout_outline_already_present';
  if (args.createCard) return null;
  if (args.updateExistingTask) {
    if (args.hasProposedParametricBlocks) return 'update_has_proposed_parametric_blocks';
    return null;
  }
  return 'not_create_or_outline_update_turn';
}

export function processCoachOutlinePhaseBVertexOutput(args: {
  text: string | null | undefined;
  finishReason?: string | null;
  generateError?: string | null;
}): CoachOutlinePhaseBResult {
  if (args.generateError) {
    return {
      ok: false,
      errorKind: 'generate_failed',
      message: args.generateError,
    };
  }

  if (args.finishReason === 'MAX_TOKENS') {
    return {
      ok: false,
      errorKind: 'truncated',
      message: 'Outline generation was truncated. Retry or add blocks manually.',
    };
  }

  const text = typeof args.text === 'string' ? args.text.trim() : '';
  if (!text) {
    return {
      ok: false,
      errorKind: 'empty_text',
      message: 'Outline generation returned no content. Retry or add blocks manually.',
    };
  }

  const outlineCollect = parseCoachOutlineOnlyBlocksFromText(text);
  if (outlineCollect.drops.some((d) => d.field === 'blocks')) {
    const parseDrop = outlineCollect.drops.find((d) => d.field === 'blocks');
    if (
      parseDrop &&
      (String(parseDrop.reason) === 'json_parse_failed' ||
        String(parseDrop.reason) === 'missing_blocks')
    ) {
      logOutlineParseFailure({
        errorKind: 'parse_failed',
        message: 'Could not parse outline JSON. Retry or add blocks manually.',
        text,
        drops: outlineCollect.drops,
        outlineCount: outlineCollect.outline?.length ?? 0,
      });
      return {
        ok: false,
        errorKind: 'parse_failed',
        message: 'Could not parse outline JSON. Retry or add blocks manually.',
        drops: outlineCollect.drops,
      };
    }
  }

  if (outlineCollect.outline == null || outlineCollect.outline.length === 0) {
    logOutlineParseFailure({
      errorKind: 'no_blocks',
      message: 'No valid workout blocks were produced. Retry or add blocks from the catalog.',
      text,
      drops: outlineCollect.drops,
      outlineCount: outlineCollect.outline?.length ?? 0,
    });
    return {
      ok: false,
      errorKind: 'no_blocks',
      message: 'No valid workout blocks were produced. Retry or add blocks from the catalog.',
      drops: outlineCollect.drops,
    };
  }

  const safeOutline = applyEmomMultiExerciseAlternatingSafety(outlineCollect.outline)!;
  const withPlaceholders = ensureOutlineExercisePlaceholders(safeOutline);
  return { ok: true, blocks: withPlaceholders, drops: outlineCollect.drops };
}

export function coachOutlinePhaseBFailureMessage(
  result: Extract<CoachOutlinePhaseBResult, { ok: false }>,
): string {
  return result.message;
}
