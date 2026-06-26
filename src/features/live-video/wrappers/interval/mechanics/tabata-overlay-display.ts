import type { WorkoutExercise } from '@/lib/item-metadata';
import { deriveTabataActiveExerciseIndex } from '@/lib/workout-factory/interval-timer/tabata-circuit-rotation';
import type { TabataFormatParams } from '@/lib/workout-factory/types/tabata-format-params';
import type {
  TabataMechanicsState,
  TabataSegment,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

export function resolveTabataOverlaySubtitle(args: {
  formatParams?: TabataFormatParams;
  mechanics: TabataMechanicsState | null;
  exercises: WorkoutExercise[];
}): string | null {
  const { formatParams, mechanics, exercises } = args;
  if (mechanics == null) return null;
  if (
    mechanics.segment === 'setup' ||
    mechanics.segment === 'idle' ||
    mechanics.segment === 'done' ||
    mechanics.round_index < 1
  ) {
    return null;
  }

  const exerciseCount = exercises.length;
  if (exerciseCount > 1 && (mechanics.segment === 'work' || mechanics.segment === 'rest')) {
    const activeIndex = deriveTabataActiveExerciseIndex(mechanics.round_index, exerciseCount);
    const exerciseName = activeIndex != null ? exercises[activeIndex]?.name?.trim() : '';
    const label = exerciseName || 'Movement';
    return `Round ${mechanics.round_index} of ${mechanics.total_rounds} · ${label}`;
  }

  const circuitRounds = positiveInt(formatParams?.rounds);
  const rounds = circuitRounds ?? mechanics.total_rounds;
  const work = positiveInt(formatParams?.work_seconds) ?? mechanics.work_seconds;
  const rest = positiveInt(formatParams?.rest_seconds) ?? mechanics.rest_seconds;
  if (rounds == null || work == null || rest == null) return null;
  return `${rounds} Rounds (${work}/${rest}s)`;
}

export function tabataSegmentPhaseAccentClass(
  segment: TabataSegment,
  opts?: { isPaused?: boolean },
): string {
  if (opts?.isPaused) return 'text-white/50';
  switch (segment) {
    case 'work':
      return 'text-emerald-300';
    case 'rest':
      return 'text-amber-300';
    case 'setup':
      return 'text-sky-300';
    default:
      return 'text-white/40';
  }
}

export function tabataSegmentProgressFillClass(
  segment: TabataSegment,
  opts?: { isPaused?: boolean },
): string {
  if (opts?.isPaused) return 'bg-white/30';
  switch (segment) {
    case 'work':
      return 'bg-emerald-400';
    case 'rest':
      return 'bg-amber-400';
    case 'setup':
      return 'bg-sky-400';
    default:
      return 'bg-white/30';
  }
}

export function tabataSegmentProgressRatio(remainingSec: number, totalSec: number): number {
  if (totalSec <= 0) return 0;
  const elapsed = totalSec - remainingSec;
  return Math.min(1, Math.max(0, elapsed / totalSec));
}

export function tabataOverlayCueSegmentKey(state: TabataMechanicsState): string {
  return `${state.segment}-${state.round_index}-${state.segment_started_at ?? 'none'}`;
}

export function tabataOverlayShowProgress(
  engine: Pick<IntervalSessionEngine, 'timerPhase' | 'totalSec'>,
  state: TabataMechanicsState | null,
): boolean {
  if (engine.timerPhase === 'finished' || engine.totalSec <= 0 || state == null) return false;
  if (state.segment === 'idle' || state.segment === 'done') return false;
  return true;
}

export function tabataOverlayAudioIsActive(
  engine: Pick<IntervalSessionEngine, 'timerPhase'>,
  state: TabataMechanicsState | null,
): boolean {
  if (engine.timerPhase !== 'work' || state == null) return false;
  if (state.is_paused === true) return false;
  if (state.segment_started_at == null) return false;
  return state.segment === 'setup' || state.segment === 'work' || state.segment === 'rest';
}
