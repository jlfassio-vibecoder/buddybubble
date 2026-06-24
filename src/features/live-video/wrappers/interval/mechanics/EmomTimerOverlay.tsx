'use client';

import { IntervalShellAudioToggle } from '@/components/fitness/interval-shells/IntervalShellAudioToggle';
import { IntervalOverlayHostControls } from '@/features/live-video/wrappers/interval/mechanics/IntervalOverlayHostControls';
import {
  emomMinuteDisplayLabel,
  parseEmomMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import {
  emomOverlayShowProgress,
  emomSegmentPhaseAccentClass,
  emomSegmentProgressFillClass,
  emomSegmentProgressRatio,
} from '@/features/live-video/wrappers/interval/mechanics/emom-overlay-display';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';
import { useTimerAudioPreference } from '@/hooks/use-timer-audio-preference';
import { formatCountdownMmSs } from '@/lib/timer';
import { cn } from '@/lib/utils';

export type EmomTimerOverlayProps = {
  engine: IntervalSessionEngine;
  audioEnabled?: boolean;
  onToggleAudio?: () => void;
  showHostControls?: boolean;
  canPause?: boolean;
  canResume?: boolean;
  onPause?: () => void;
  onResume?: () => void;
};

export default function EmomTimerOverlay({
  engine,
  audioEnabled: audioEnabledProp,
  onToggleAudio,
  showHostControls = false,
  canPause = false,
  canResume = false,
  onPause,
  onResume,
}: EmomTimerOverlayProps) {
  const preference = useTimerAudioPreference();
  const audioEnabled = onToggleAudio != null ? (audioEnabledProp ?? true) : preference.audioEnabled;
  const handleToggleAudio = onToggleAudio ?? preference.toggleAudio;

  const ms = parseEmomMechanicsState(engine.mechanicsState);
  const minuteLabel = ms != null ? emomMinuteDisplayLabel(ms) : null;

  const isFinished = engine.timerPhase === 'finished';
  const phaseText = isFinished ? 'Finished' : engine.segmentLabel.toUpperCase() || 'Ready';
  const phaseAccentClass =
    isFinished || ms == null
      ? 'text-white/40'
      : emomSegmentPhaseAccentClass(ms.segment, { isPaused: ms.is_paused });

  const showProgress = emomOverlayShowProgress(engine, ms);
  const progressRatio = showProgress
    ? emomSegmentProgressRatio(engine.remainingSec, engine.totalSec)
    : 0;
  const progressFillClass =
    ms != null
      ? emomSegmentProgressFillClass(ms.segment, { isPaused: ms.is_paused })
      : 'bg-white/30';

  return (
    <div className="pointer-events-none absolute inset-0 z-[43]">
      <div className="pointer-events-auto absolute top-4 left-4 max-w-[min(100vw-2rem,20rem)] rounded-xl border border-white/10 bg-black/50 p-4 text-white shadow-lg backdrop-blur-md">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">EMOM</p>
          <div className="flex shrink-0 items-center gap-1">
            <IntervalOverlayHostControls
              showHostControls={showHostControls}
              canPause={canPause}
              canResume={canResume}
              onPause={onPause ?? (() => {})}
              onResume={onResume ?? (() => {})}
            />
            <IntervalShellAudioToggle audioEnabled={audioEnabled} onToggle={handleToggleAudio} />
          </div>
        </div>
        <p
          className={cn(
            'mt-0.5 text-[10px] font-medium uppercase tracking-wider',
            phaseAccentClass,
          )}
          data-testid="emom-overlay-phase-label"
        >
          {phaseText}
        </p>
        {minuteLabel ? (
          <p className="mt-0.5 text-xs font-medium text-white/60">{minuteLabel}</p>
        ) : null}
        {showProgress ? (
          <div
            className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10"
            data-testid="emom-overlay-progress-track"
          >
            <div
              className={cn('h-full transition-[width] duration-200', progressFillClass)}
              data-testid="emom-overlay-progress-fill"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
        ) : null}
        <p
          className="mt-1 font-bold tabular-nums text-5xl leading-none tracking-tight text-white"
          aria-live="polite"
        >
          {formatCountdownMmSs(engine.remainingSec)}
        </p>
      </div>
    </div>
  );
}
