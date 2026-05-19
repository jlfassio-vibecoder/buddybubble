/** MIRROR FILE — canonical lives at `src/lib/agents/coach/block-exercise-fill-prompts.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Any change must be hand-mirrored — run `pnpm check:agent-mirror` to verify parity.
 */

import type { CoachProposedBlockShell } from './block-blueprint-synthesize.ts';

export function buildBlockExerciseFillSystemPrompt(): string {
  return (
    'You fill exercises[] for fixed workout block shells. The server already set block_format and format_params — do not change them.\n' +
    'Return JSON only: { "blocks": [{ "name": "...", "exercises": [{ "name": "...", "sets": number, "reps": "..." }] }] }.\n' +
    'Honor user qualifiers (bodyweight, core, kettlebell, etc.). Use real exercise names. Keep sets/reps concise.\n' +
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
  workoutIndexSummary?: string | null;
}): string {
  const shellLines = args.shells.map((s) => JSON.stringify(s));
  const parts = [
    `User message:\n${args.userMessage.trim()}`,
    `Fixed block shells (structure is not editable):\n${shellLines.join('\n')}`,
  ];
  if (args.workoutIndexSummary?.trim()) {
    parts.push(`Existing workout sections (do not duplicate):\n${args.workoutIndexSummary.trim()}`);
  }
  return parts.join('\n\n');
}
