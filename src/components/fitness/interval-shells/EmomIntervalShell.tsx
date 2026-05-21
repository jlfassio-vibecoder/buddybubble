'use client';

import { useEffect, useMemo } from 'react';
import { TimerDisplay } from '@/components/timer';
import { Button } from '@/components/ui/button';
import { useEmomTimerEngine } from '@/hooks/use-emom-timer-engine';
import { useIntervalShellPolish } from '@/hooks/use-interval-shell-polish';
import { IntervalShellAudioToggle } from '@/components/fitness/interval-shells/IntervalShellAudioToggle';
import { resolveEmomTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-emom-timer-config';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { cn } from '@/lib/utils';

export type EmomIntervalShellProps = {
  block: WorkoutSessionBlockView;
  onSnapshot: (blockId: string, snapshot: IntervalRowSnapshot | null) => void;
};

export function EmomIntervalShell({ block, onSnapshot }: EmomIntervalShellProps) {
  const config = useMemo(() => resolveEmomTimerConfig(block), [block]);

  if (!config) return null;

  return <EmomIntervalShellInner blockId={block.id} config={config} onSnapshot={onSnapshot} />;
}

function EmomIntervalShellInner({
  blockId,
  config,
  onSnapshot,
}: {
  blockId: string;
  config: NonNullable<ReturnType<typeof resolveEmomTimerConfig>>;
  onSnapshot: EmomIntervalShellProps['onSnapshot'];
}) {
  const { snapshot, start, pause, resume, reset } = useEmomTimerEngine(config);
  const { audioEnabled, toggleAudio, primeAudio } = useIntervalShellPolish({
    isRunning: snapshot.isRunning,
    isPaused: snapshot.isPaused,
    remainingMs: snapshot.remainingMs,
    cueSegmentKey: String(snapshot.roundIndex),
  });

  const handleStart = async () => {
    await primeAudio();
    start();
  };

  useEffect(() => {
    if (snapshot.phase === 'idle' || snapshot.phase === 'done') {
      onSnapshot(blockId, null);
      return;
    }
    const activeSetPhase = snapshot.phase === 'paused' ? 'paused' : 'work';
    onSnapshot(blockId, { roundIndex: snapshot.roundIndex, activeSetPhase });
  }, [blockId, onSnapshot, snapshot.phase, snapshot.roundIndex, snapshot.isPaused]);

  const phaseLabel =
    snapshot.phase === 'idle'
      ? 'Ready'
      : snapshot.phase === 'done'
        ? 'Complete'
        : snapshot.isPaused
          ? 'Paused'
          : 'EMOM';

  const roundLabel =
    config.intervalSeconds === 60
      ? `Minute ${snapshot.displayRound} of ${snapshot.totalRounds}`
      : `Round ${snapshot.displayRound} of ${snapshot.totalRounds}`;

  const showRound = snapshot.phase !== 'idle' && snapshot.phase !== 'done';
  const getElapsedMs = () => Math.max(0, snapshot.intervalMs - snapshot.remainingMs);

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-muted/30 px-4 py-3',
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
      )}
      data-testid={`emom-interval-shell-${blockId}`}
      data-region="emom-interval-shell"
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {phaseLabel}
        </span>
        <TimerDisplay
          getElapsedMs={getElapsedMs}
          isActive={snapshot.isRunning && !snapshot.isPaused}
          format="countdown-seconds"
          totalMs={snapshot.intervalMs}
          className="text-3xl"
        />
        {showRound ? <span className="text-xs text-muted-foreground">{roundLabel}</span> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <IntervalShellAudioToggle audioEnabled={audioEnabled} onToggle={toggleAudio} />
        {snapshot.phase === 'idle' || snapshot.phase === 'done' ? (
          <Button type="button" size="sm" onClick={handleStart}>
            {snapshot.phase === 'done' ? 'Restart' : 'Start'}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={snapshot.isPaused ? resume : pause}
            >
              {snapshot.isPaused ? 'Resume' : 'Pause'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={reset}>
              Reset
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
