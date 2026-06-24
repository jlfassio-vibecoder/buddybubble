import type {
  EmomMechanicsState,
  EmomSegment,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';

export function emomSegmentPhaseAccentClass(
  segment: EmomSegment,
  opts?: { isPaused?: boolean },
): string {
  if (opts?.isPaused) return 'text-white/50';
  switch (segment) {
    case 'minute':
      return 'text-emerald-300';
    case 'setup':
      return 'text-sky-300';
    default:
      return 'text-white/40';
  }
}

export function emomSegmentProgressFillClass(
  segment: EmomSegment,
  opts?: { isPaused?: boolean },
): string {
  if (opts?.isPaused) return 'bg-white/30';
  switch (segment) {
    case 'minute':
      return 'bg-emerald-400';
    case 'setup':
      return 'bg-sky-400';
    default:
      return 'bg-white/30';
  }
}

export function emomSegmentProgressRatio(remainingSec: number, totalSec: number): number {
  if (totalSec <= 0) return 0;
  const elapsed = totalSec - remainingSec;
  return Math.min(1, Math.max(0, elapsed / totalSec));
}

export function emomOverlayCueSegmentKey(state: EmomMechanicsState): string {
  return `${state.segment}-${state.minute_index}-${state.segment_started_at ?? 'none'}`;
}

export function emomOverlayShowProgress(
  engine: Pick<IntervalSessionEngine, 'timerPhase' | 'totalSec'>,
  state: EmomMechanicsState | null,
): boolean {
  if (engine.timerPhase === 'finished' || engine.totalSec <= 0 || state == null) return false;
  if (state.segment === 'idle' || state.segment === 'done') return false;
  return true;
}

export function emomOverlayAudioIsActive(
  engine: Pick<IntervalSessionEngine, 'timerPhase'>,
  state: EmomMechanicsState | null,
): boolean {
  if (engine.timerPhase !== 'work' || state == null) return false;
  if (state.is_paused === true) return false;
  if (state.segment_started_at == null) return false;
  return state.segment === 'setup' || state.segment === 'minute';
}
