'use client';

import { useEffect, useMemo } from 'react';
import { TimerDisplay } from '@/components/timer';
import { Button } from '@/components/ui/button';
import { useIntervalShellPolish } from '@/hooks/use-interval-shell-polish';
import { useIntervalTimerEngine } from '@/hooks/use-interval-timer-engine';
import { IntervalShellAudioToggle } from '@/components/fitness/interval-shells/IntervalShellAudioToggle';
import { resolveTabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import {
  intervalTimerSnapshotToRowSnapshot,
  type IntervalRowSnapshot,
} from '@/lib/workout-factory/interval-timer/types';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { cn } from '@/lib/utils';

export type TabataIntervalShellProps = {
  block: WorkoutSessionBlockView;
  onSnapshot: (blockId: string, snapshot: IntervalRowSnapshot | null) => void;
};

const PHASE_LABELS: Record<string, string> = {
  idle: 'Ready',
  prepare: 'Prepare',
  work: 'Work',
  rest: 'Rest',
  done: 'Complete',
  paused: 'Paused',
};

export function TabataIntervalShell({ block, onSnapshot }: TabataIntervalShellProps) {
  const config = useMemo(() => resolveTabataTimerConfig(block), [block]);

  if (!config) return null;

  return <TabataIntervalShellInner blockId={block.id} config={config} onSnapshot={onSnapshot} />;
}

function TabataIntervalShellInner({
  blockId,
  config,
  onSnapshot,
}: {
  blockId: string;
  config: NonNullable<ReturnType<typeof resolveTabataTimerConfig>>;
  onSnapshot: TabataIntervalShellProps['onSnapshot'];
}) {
  const { snapshot, start, pause, resume, reset } = useIntervalTimerEngine(config);
  const cueSegmentKey = `${snapshot.phase}-${snapshot.roundIndex}`;
  const { audioEnabled, toggleAudio, primeAudio } = useIntervalShellPolish({
    isRunning: snapshot.isRunning,
    isPaused: snapshot.isPaused,
    remainingMs: snapshot.remainingMs,
    cueSegmentKey,
  });

  const handleStart = async () => {
    await primeAudio();
    start();
  };

  useEffect(() => {
    onSnapshot(blockId, intervalTimerSnapshotToRowSnapshot(snapshot));
  }, [blockId, onSnapshot, snapshot.phase, snapshot.roundIndex, snapshot.isPaused]);

  const phaseLabel = PHASE_LABELS[snapshot.phase] ?? snapshot.phase;
  const showRound =
    snapshot.phase !== 'idle' && snapshot.totalRounds > 0 && snapshot.phase !== 'done';

  const getElapsedMs = () => Math.max(0, snapshot.phaseDurationMs - snapshot.remainingMs);

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-muted/30 px-4 py-3',
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
      )}
      data-testid={`tabata-interval-shell-${blockId}`}
      data-region="tabata-interval-shell"
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {phaseLabel}
        </span>
        <TimerDisplay
          getElapsedMs={getElapsedMs}
          isActive={snapshot.isRunning && !snapshot.isPaused}
          format="countdown-tenths"
          totalMs={snapshot.phaseDurationMs}
          className="text-3xl"
        />
        {showRound ? (
          <span className="text-xs text-muted-foreground">
            Round {snapshot.displayRound} of {snapshot.totalRounds}
          </span>
        ) : null}
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
