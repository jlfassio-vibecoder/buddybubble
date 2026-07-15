'use client';

import { Button } from '@/components/ui/button';
import { IntervalShellAudioToggle } from '@/components/fitness/interval-shells/IntervalShellAudioToggle';
import { IntervalOverlayHostControls } from '@/features/live-video/wrappers/interval/mechanics/IntervalOverlayHostControls';
import { isTabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import {
  resolveTabataOverlayHeader,
  resolveTabataOverlayPhaseLabel,
  resolveTabataOverlaySubtitle,
  tabataOverlayShowProgress,
  tabataSegmentPhaseAccentClass,
  tabataSegmentProgressFillClass,
  tabataSegmentProgressRatio,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-overlay-display';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';
import { useTimerAudioPreference } from '@/hooks/use-timer-audio-preference';
import { formatCountdownMmSs } from '@/lib/timer';

import { cn } from '@/lib/utils';

export type TabataTimerOverlayProps = {
  engine: IntervalSessionEngine;
  audioEnabled?: boolean;
  onToggleAudio?: () => void;
  showHostControls?: boolean;
  canPause?: boolean;
  canResume?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  showStart?: boolean;
  onStart?: () => void;
};

export default function TabataTimerOverlay({
  engine,
  audioEnabled: audioEnabledProp,
  onToggleAudio,
  showHostControls = false,
  canPause = false,
  canResume = false,
  onPause,
  onResume,
  showStart = false,
  onStart,
}: TabataTimerOverlayProps) {
  const preference = useTimerAudioPreference();
  const audioEnabled = onToggleAudio != null ? (audioEnabledProp ?? true) : preference.audioEnabled;
  const handleToggleAudio = onToggleAudio ?? preference.toggleAudio;

  const ms = isTabataMechanicsState(engine.mechanicsState) ? engine.mechanicsState : null;
  const formatParams = engine.blockSnapshot?.format_params;
  const exercises = engine.blockSnapshot?.exercises ?? [];
  const headerLabel = resolveTabataOverlayHeader(formatParams);
  const subtitle = resolveTabataOverlaySubtitle({ formatParams, mechanics: ms, exercises });

  const isFinished = engine.timerPhase === 'finished';
  const phaseLabel = resolveTabataOverlayPhaseLabel({
    mechanics: ms,
    formatParams,
    segmentLabel: engine.segmentLabel,
    isFinished,
  });
  // Finished stays title-case (legacy); runnable phases are uppercase chips.
  const phaseText = isFinished ? phaseLabel : phaseLabel.toUpperCase() || 'Ready';
  const phaseAccentClass =
    isFinished || ms == null
      ? 'text-white/40'
      : tabataSegmentPhaseAccentClass(ms.segment, { isPaused: ms.is_paused });

  const showProgress = tabataOverlayShowProgress(engine, ms);
  const progressRatio = showProgress
    ? tabataSegmentProgressRatio(engine.remainingSec, engine.totalSec)
    : 0;
  const progressFillClass =
    ms != null
      ? tabataSegmentProgressFillClass(ms.segment, { isPaused: ms.is_paused })
      : 'bg-white/30';

  return (
    <div className="pointer-events-none absolute inset-0 z-[43]">
      <div className="pointer-events-auto absolute top-4 left-4 flex w-full max-w-[min(100vw-2rem,20rem)] flex-col">
        <div className="rounded-xl border border-white/10 bg-black/50 p-4 text-white shadow-lg backdrop-blur-md">
          <div className="flex items-start justify-between gap-2">
            <p
              className="text-[10px] font-medium uppercase tracking-wider text-white/50"
              data-testid="tabata-overlay-header-label"
            >
              {headerLabel}
            </p>
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
            data-testid="tabata-overlay-phase-label"
          >
            {phaseText}
          </p>
          {subtitle ? (
            <p
              className="mt-0.5 text-xs font-medium text-white/60"
              data-testid="tabata-overlay-subtitle"
            >
              {subtitle}
            </p>
          ) : null}
          {showProgress ? (
            <div
              className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10"
              data-testid="tabata-overlay-progress-track"
            >
              <div
                className={cn('h-full transition-[width] duration-200', progressFillClass)}
                data-testid="tabata-overlay-progress-fill"
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

        <div
          className={cn(
            'mt-1.5 overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none',
            showStart ? 'max-h-24 opacity-100' : 'pointer-events-none max-h-0 opacity-0',
          )}
          aria-hidden={!showStart}
        >
          <div
            className={cn(
              'rounded-lg border border-white/10 bg-black/60 p-2 shadow-lg backdrop-blur-md',
              'transition-transform duration-300 ease-out motion-reduce:transition-none',
              showStart ? 'translate-y-0' : '-translate-y-full',
            )}
          >
            <Button
              type="button"
              className="h-9 w-full bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-400"
              data-testid="interval-overlay-start"
              aria-label="Start timer"
              disabled={!showStart || onStart == null}
              onClick={() => onStart?.()}
            >
              Start
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
