/**
 * Prompts for Lane 2 block exercise-fill micro-call.
 * Mirror: `supabase/functions/agents/coach/block-exercise-fill-prompts.ts`.
 */

import type { CoachProposedBlockShell } from './block-blueprint-synthesize';
import { INTERVAL_CIRCUIT_CARDINALITY_PROMPT_BLOCK } from './config';
import {
  messageSegmentForBlockToken,
  parseStatedExerciseCount,
} from './interval-circuit-cardinality';

export function buildBlockExerciseFillSystemPrompt(): string {
  return (
    'You fill exercises[] for fixed workout block shells. The server already set block_format and format_params — do not change them.\n' +
    INTERVAL_CIRCUIT_CARDINALITY_PROMPT_BLOCK +
    '\n' +
    'Return JSON only: { "blocks": [{ "name": "...", "exercises": [{ "name": "...", "sets": number, "reps": "..." }] }] }.\n' +
    'Honor user qualifiers (bodyweight, core, kettlebell, etc.). Use real exercise names. Keep sets/reps concise.\n' +
    'For tabata shells: emit N distinct movement names when the user requests N exercises; never merge placeholders into one compound exercise name.\n' +
    'For ladder shells: hydrate ascending or descending rep strings per set from format_params (start_reps, peak_reps, step_reps, direction).\n' +
    'For chipper shells: assign distinct rep counts per exercise in order; complete each movement before advancing.\n' +
    'For pyramid shells: hydrate set-by-set rep or load progression from format_params (start_reps, peak_reps, step_reps, direction, load_progression_percent).\n' +
    'For contrast shells: exactly 2 exercises — heavy strength then explosive; alternate each round per format_params.rounds.\n' +
    'For clusters shells: reflect reps_per_cluster and clusters in sets/reps or coach_notes; honor intra_cluster_rest_seconds when present.\n' +
    'For drop_sets shells: working set to failure then drop_percent load reductions for drops count; do not put scheme only in prose.\n' +
    'Match block name exactly. Do not add blocks beyond those listed.'
  );
}

export function buildBlockExerciseFillUserText(args: {
  userMessage: string;
  shells: CoachProposedBlockShell[];
  /** Composer block tokens in shell order — scopes stated exercise counts per block. */
  blockTokens?: readonly string[] | null;
  workoutIndexSummary?: string | null;
}): string {
  const shellLines = args.shells.map((s) => JSON.stringify(s));
  const blockTokens = args.blockTokens ?? null;
  const multiBlock = Boolean(blockTokens && blockTokens.length > 1);
  const tabataCardinalityHints = args.shells
    .map((shell, i) => {
      if (shell.block_format !== 'tabata') return null;
      const segment =
        multiBlock && blockTokens?.[i]
          ? messageSegmentForBlockToken(args.userMessage, blockTokens[i]!, blockTokens)
          : args.userMessage;
      const statedCount = parseStatedExerciseCount(segment);
      if (statedCount == null) return null;
      return `Block "${shell.name}": user stated ${statedCount} exercises/stations in this block's message segment — exercises.length MUST equal ${statedCount} with distinct movement names.`;
    })
    .filter((line): line is string => line != null);
  const globalStatedCount =
    tabataCardinalityHints.length === 0 && !multiBlock
      ? parseStatedExerciseCount(args.userMessage)
      : null;
  const parts = [
    `User message:\n${args.userMessage.trim()}`,
    ...tabataCardinalityHints,
    globalStatedCount != null
      ? `Stated exercise/station count from user message: ${globalStatedCount}. For tabata shells, exercises.length MUST equal this count with distinct movement names.`
      : null,
    `Fixed block shells (structure is not editable):\n${shellLines.join('\n')}`,
  ].filter((p): p is string => p != null);
  if (args.workoutIndexSummary?.trim()) {
    parts.push(`Existing workout sections (do not duplicate):\n${args.workoutIndexSummary.trim()}`);
  }
  return parts.join('\n\n');
}
