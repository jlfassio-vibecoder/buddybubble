/**
 * Three-layer workout viewer copy: coach brief, structure rationale, session adaptations.
 */

import {
  getWorkoutGenerationPhaseIntentLabel,
  WORKOUT_GENERATION_PHASE_INTENT_OPTIONS,
  type WorkoutGenerationPhaseIntent,
} from '@/lib/workout-factory/generation-intake-context';
import { formatBlockSummaryLine } from '@/lib/workout-factory/format-block-summary-line';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export const MACRO_PLANNING_CONTEXT_PREFIX = 'Macro planning context:';

/** Shared uppercase label for coach brief / structure / session sections in workout viewers. */
export const WORKOUT_NARRATIVE_SECTION_LABEL_CLASS =
  'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

export type WorkoutViewerNarrative = {
  coachBrief: string;
  structureRationale: string | null;
  sessionAdaptations: string | null;
};

export function stripMacroPlanningContextSuffix(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const suffixStart = findLegacyMacroPlanningContextSuffixStart(trimmed);
  if (suffixStart === null) return trimmed;
  if (suffixStart === 0) return '';
  return trimmed.slice(0, suffixStart).trim();
}

function tryParseMacroPlanningContextJson(jsonPart: string): Record<string, unknown> | null {
  if (!jsonPart.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(jsonPart) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Index of a validated legacy macro JSON suffix, or null when none. */
function findLegacyMacroPlanningContextSuffixStart(text: string): number | null {
  const marker = `\n\n${MACRO_PLANNING_CONTEXT_PREFIX}`;
  let searchEnd = text.length;

  while (searchEnd >= 0) {
    const idx = text.lastIndexOf(marker, searchEnd);
    if (idx < 0) break;
    const jsonPart = text.slice(idx + marker.length).trim();
    if (tryParseMacroPlanningContextJson(jsonPart)) return idx;
    searchEnd = idx - 1;
  }

  if (text.startsWith(MACRO_PLANNING_CONTEXT_PREFIX)) {
    const jsonPart = text.slice(MACRO_PLANNING_CONTEXT_PREFIX.length).trim();
    if (tryParseMacroPlanningContextJson(jsonPart)) return 0;
  }

  return null;
}

function sectionLabel(block: WorkoutSessionBlockView): string {
  if (block.section === 'warmup') return 'Warm-up';
  if (block.section === 'finisher') return 'Finisher';
  if (block.section === 'cooldown') return 'Cool-down';
  return 'Main work';
}

function exerciseNames(block: WorkoutSessionBlockView): string {
  const names = block.exercises
    .map((ex) => ex.exerciseName?.trim())
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return '';
  if (names.length <= 4) return names.join(', ');
  return `${names.slice(0, 4).join(', ')}, +${names.length - 4} more`;
}

/**
 * Deterministic structure summary from parametric blocks (formats, rounds, stations).
 */
export function buildWorkoutStructureRationale(
  blocks: ReadonlyArray<WorkoutSessionBlockView>,
): string | null {
  const lines: string[] = [];

  for (const block of blocks) {
    const hasContent = block.exercises.length > 0 || block.instructions.length > 0;
    if (!hasContent) continue;

    const summary = formatBlockSummaryLine(block);
    const names = exerciseNames(block);
    const label = sectionLabel(block);

    if (block.instructions.length > 0 && block.exercises.length === 0) {
      lines.push(`${label}: ${summary}.`);
      continue;
    }

    if (names) {
      lines.push(`${label}: ${summary} — ${names}.`);
    } else {
      lines.push(`${label}: ${summary}.`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function formatDurationLabel(raw: unknown): string | null {
  if (raw === 'Optimized for Goals') return 'Goal-driven duration (uncapped)';
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return `${Math.round(raw)}-minute session target`;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const t = raw.trim();
    if (t === 'Optimized for Goals') return 'Goal-driven duration (uncapped)';
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) return `${Math.round(n)}-minute session target`;
    return t;
  }
  return null;
}

const PHASE_INTENT_SET = new Set<string>(
  WORKOUT_GENERATION_PHASE_INTENT_OPTIONS as unknown as string[],
);

function formatPhaseIntent(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const key = raw.trim();
  if (PHASE_INTENT_SET.has(key)) {
    return getWorkoutGenerationPhaseIntentLabel(key as WorkoutGenerationPhaseIntent);
  }
  return key;
}

/** Human-readable pre-session intake copy for the viewer (not raw JSON). */
export function formatGenerationIntakeAdaptations(
  checkin: Record<string, unknown> | null | undefined,
): string | null {
  if (!checkin || typeof checkin !== 'object') return null;

  const parts: string[] = [];

  const duration = formatDurationLabel(checkin.duration_minutes ?? checkin.target_duration_min);
  if (duration) parts.push(duration);

  const phase = formatPhaseIntent(checkin.phase_intent);
  if (phase) parts.push(`Training phase: ${phase}`);

  const trend = checkin.progression_trend;
  if (typeof trend === 'string' && trend.trim()) {
    parts.push(`Recent trend: ${trend.trim()}`);
  }

  const anchor = checkin.anchor_lift;
  if (anchor && typeof anchor === 'object' && !Array.isArray(anchor)) {
    const name =
      typeof (anchor as { name?: unknown }).name === 'string'
        ? (anchor as { name: string }).name.trim()
        : '';
    const weight = (anchor as { weight?: unknown }).weight;
    const reps = (anchor as { reps?: unknown }).reps;
    if (name && typeof weight === 'number' && typeof reps === 'number') {
      parts.push(`Anchor lift reference: ${name} ${weight}×${reps}`);
    } else if (name) {
      parts.push(`Anchor lift reference: ${name}`);
    }
  }

  const limitations = checkin.temporary_limitations;
  if (typeof limitations === 'string' && limitations.trim()) {
    parts.push(`Temporary limitations: ${limitations.trim()}`);
  }

  if (parts.length === 0) return null;
  return parts.join('. ') + '.';
}

function readAiWorkoutFactory(meta: Record<string, unknown>): Record<string, unknown> | null {
  const af = meta.ai_workout_factory;
  return af && typeof af === 'object' && !Array.isArray(af)
    ? (af as Record<string, unknown>)
    : null;
}

function readOutlineFillChainMetadata(af: Record<string, unknown>): Record<string, unknown> | null {
  const cm = af.chain_metadata;
  if (!cm || typeof cm !== 'object' || Array.isArray(cm)) return null;
  const pipeline = (cm as { pipeline?: unknown }).pipeline;
  if (pipeline !== 'parametric_outline_fill') return null;
  return cm as Record<string, unknown>;
}

/**
 * Resolve the three viewer narrative layers from task description, metadata, and blocks.
 */
export function resolveWorkoutViewerNarrative(args: {
  taskDescription: string;
  metadata: unknown;
  blocks: ReadonlyArray<WorkoutSessionBlockView>;
}): WorkoutViewerNarrative {
  const coachBrief = stripMacroPlanningContextSuffix(args.taskDescription);

  const meta =
    args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
      ? (args.metadata as Record<string, unknown>)
      : {};

  const af = readAiWorkoutFactory(meta);
  const chainMeta = af ? readOutlineFillChainMetadata(af) : null;

  let structureRationale = buildWorkoutStructureRationale(args.blocks);

  if (!structureRationale) {
    structureRationale =
      (typeof af?.structure_rationale === 'string' && af.structure_rationale.trim()) ||
      (typeof chainMeta?.structure_rationale === 'string' &&
        chainMeta.structure_rationale.trim()) ||
      null;
  }

  let sessionAdaptations =
    (typeof af?.session_adaptations === 'string' && af.session_adaptations.trim()) ||
    (typeof chainMeta?.session_adaptations === 'string' && chainMeta.session_adaptations.trim()) ||
    null;

  if (!sessionAdaptations) {
    const intake =
      (chainMeta?.generation_intake_context &&
      typeof chainMeta.generation_intake_context === 'object' &&
      !Array.isArray(chainMeta.generation_intake_context)
        ? (chainMeta.generation_intake_context as Record<string, unknown>)
        : null) ?? parseMacroPlanningContextJson(args.taskDescription);
    sessionAdaptations = formatGenerationIntakeAdaptations(intake);
  }

  return {
    coachBrief,
    structureRationale: structureRationale || null,
    sessionAdaptations: sessionAdaptations || null,
  };
}

function parseMacroPlanningContextJson(description: string): Record<string, unknown> | null {
  const trimmed = description.trim();
  const suffixStart = findLegacyMacroPlanningContextSuffixStart(trimmed);
  if (suffixStart === null) return null;

  const marker = `\n\n${MACRO_PLANNING_CONTEXT_PREFIX}`;
  const jsonPart =
    suffixStart === 0
      ? trimmed.slice(MACRO_PLANNING_CONTEXT_PREFIX.length).trim()
      : trimmed.slice(suffixStart + marker.length).trim();

  return tryParseMacroPlanningContextJson(jsonPart);
}
