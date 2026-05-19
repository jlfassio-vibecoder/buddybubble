/** MIRROR FILE — canonical lives at `src/lib/agents/coach/block-blueprint-router.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Import paths use explicit `.ts` extensions required by Deno.
 * Any change must be hand-mirrored — run `pnpm check:agent-mirror` to verify parity.
 */

import { mergeCoachProposedIntoTaskMetadata } from '../../_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts';
import type { BlockFormat } from './block-blueprint-library.ts';
import type { BlockBlueprintMentionClientPayload } from './block-blueprint-mentions.ts';
import {
  composerMentionTokenInMessage,
  type ExerciseMentionClientPayload,
} from './exercise-mentions.ts';
import {
  type CoachProposedBlockShell,
  synthesizeProposedBlocksFromMentions,
} from './block-blueprint-synthesize.ts';

export type BlockBlueprintRouterLane = 'lane1' | 'lane2';

export type BlockBlueprintRouterEligibility =
  | { eligible: true; lane: BlockBlueprintRouterLane }
  | { eligible: false; reason: string };

export type BlockBlueprintRouterGateInput = {
  isRailSurface: boolean;
  blockMentions: BlockBlueprintMentionClientPayload[] | null;
  knownTargetTaskId: string | null;
  taskMetadataForContext: unknown;
  coachMergeWorkoutMetadata: boolean;
  messageText: string;
  exerciseMentions: ExerciseMentionClientPayload[] | null;
};

export type BlockBlueprintRouterGateResult =
  | {
      eligible: true;
      lane: BlockBlueprintRouterLane;
      knownTargetTaskId: string;
      assigned: AssignedBlockExercises[];
      blockMentions: BlockBlueprintMentionClientPayload[];
    }
  | { eligible: false; reason: string };

function hasRichWorkoutSetMetadata(metadata: unknown): boolean {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const af = (metadata as Record<string, unknown>).ai_workout_factory;
  if (af == null || typeof af !== 'object' || Array.isArray(af)) return false;
  const ws = (af as Record<string, unknown>).workout_set;
  if (ws == null || typeof ws !== 'object' || Array.isArray(ws)) return false;
  const workouts = (ws as Record<string, unknown>).workouts;
  return Array.isArray(workouts) && workouts.length > 0;
}

/** Sync gate + lane pick after async task resolution (see lane preflight). */
export function resolveBlockBlueprintRouterGate(
  input: BlockBlueprintRouterGateInput,
): BlockBlueprintRouterGateResult {
  if (!input.isRailSurface) return { eligible: false, reason: 'not_rail_surface' };
  if (!input.blockMentions?.length) return { eligible: false, reason: 'no_block_mentions' };
  if (!input.knownTargetTaskId) return { eligible: false, reason: 'no_target_task' };
  if (!hasRichWorkoutSetMetadata(input.taskMetadataForContext)) {
    return { eligible: false, reason: 'no_rich_workout_on_card' };
  }
  if (input.coachMergeWorkoutMetadata !== true) {
    return { eligible: false, reason: 'merge_disabled' };
  }

  const assigned = assignExerciseMentionsToBlocks(
    input.messageText,
    input.blockMentions,
    input.exerciseMentions,
  );
  const lane = pickBlockBlueprintLane(assigned);

  return {
    eligible: true,
    lane,
    knownTargetTaskId: input.knownTargetTaskId,
    assigned,
    blockMentions: input.blockMentions,
  };
}

export type AssignedBlockExercises = {
  mention: BlockBlueprintMentionClientPayload;
  exercises: ExerciseMentionClientPayload[];
};

/** Minimum exercise count for Lane 1 (deterministic) per block_format. */
export function blockMeetsExerciseCardinality(format: BlockFormat, exerciseCount: number): boolean {
  switch (format) {
    case 'superset':
      return exerciseCount === 2;
    case 'circuit':
      return exerciseCount >= 3;
    case 'tabata':
    case 'amrap':
    case 'emom':
    case 'straight_sets':
    default:
      return exerciseCount >= 1;
  }
}

export function pickBlockBlueprintLane(
  assigned: AssignedBlockExercises[],
): BlockBlueprintRouterLane {
  for (const { mention, exercises } of assigned) {
    if (!blockMeetsExerciseCardinality(mention.block_format, exercises.length)) return 'lane2';
  }
  return 'lane1';
}

function tokenIndex(messageText: string, token: string): number {
  const i = messageText.indexOf(token);
  return i >= 0 ? i : Number.MAX_SAFE_INTEGER;
}

/**
 * Assign `#` exercise mentions to block shells by message order between block tokens.
 * Single block → all `#` tags in the message.
 */
export function assignExerciseMentionsToBlocks(
  messageText: string,
  blockMentions: BlockBlueprintMentionClientPayload[],
  exerciseMentions: ExerciseMentionClientPayload[] | null,
): AssignedBlockExercises[] {
  const mentions = [...blockMentions].sort(
    (a, b) => tokenIndex(messageText, a.token) - tokenIndex(messageText, b.token),
  );
  const exercises = (exerciseMentions ?? []).filter((m) =>
    composerMentionTokenInMessage(messageText, m.token),
  );

  if (mentions.length === 1) {
    return [{ mention: mentions[0]!, exercises }];
  }

  const out: AssignedBlockExercises[] = mentions.map((mention) => ({
    mention,
    exercises: [] as ExerciseMentionClientPayload[],
  }));

  for (const ex of exercises) {
    const pos = tokenIndex(messageText, ex.token);
    let slot = 0;
    for (let i = 0; i < mentions.length; i++) {
      const start = tokenIndex(messageText, mentions[i]!.token);
      const end =
        i + 1 < mentions.length
          ? tokenIndex(messageText, mentions[i + 1]!.token)
          : messageText.length;
      if (pos >= start && pos < end) {
        slot = i;
        break;
      }
      if (pos >= start) slot = i;
    }
    out[slot]!.exercises.push(ex);
  }

  return out;
}

/** Default reps string when the user picks exercises but does not specify sets/reps. */
export function defaultRepsForFormat(format: BlockFormat): string {
  switch (format) {
    case 'tabata':
    case 'emom':
    case 'amrap':
      return 'max';
    case 'straight_sets':
      return '8-12';
    case 'superset':
    case 'circuit':
    default:
      return '10';
  }
}

export function buildDeterministicCoachBlocks(
  assigned: AssignedBlockExercises[],
): CoachProposedBlockShell[] {
  return assigned.map(({ mention, exercises }) => {
    const shell = synthesizeProposedBlocksFromMentions([mention])[0]!;
    return {
      ...shell,
      exercises: exercises.map((m) => ({
        name: m.name,
        sets: 1,
        reps: defaultRepsForFormat(mention.block_format),
      })),
    };
  });
}

export function buildMergedTaskMetadataForBlockAppend(
  baseMetadata: unknown,
  blocks: CoachProposedBlockShell[],
): {
  p_new_metadata: Record<string, unknown>;
  mergeLog: ReturnType<typeof mergeCoachProposedIntoTaskMetadata>['mergeLog'];
} {
  const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
    base: baseMetadata ?? {},
    proposed: { blocks },
  });
  return { p_new_metadata: metadata, mergeLog };
}

function formatBlockLabel(name: string, format: BlockFormat): string {
  const pretty = format.replace(/_/g, ' ');
  return `${name} (${pretty.charAt(0).toUpperCase()}${pretty.slice(1)})`;
}

/** User-visible reply when Lane 1 persists without optional micro-polish. */
export function templateBlockAppendReply(blocks: CoachProposedBlockShell[]): string {
  const parts = blocks.map((b) => {
    const names = b.exercises
      .map((e) => {
        if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
        const n = (e as Record<string, unknown>).name;
        return typeof n === 'string' && n.trim() ? n.trim() : null;
      })
      .filter((n): n is string => n != null);
    const label = formatBlockLabel(b.name, b.block_format as BlockFormat);
    if (names.length === 0) return `Added ${label}.`;
    return `Added ${label}: ${names.join(', ')}.`;
  });
  return parts.join(' ');
}
