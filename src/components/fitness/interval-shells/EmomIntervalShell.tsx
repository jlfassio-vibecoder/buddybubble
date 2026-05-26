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
import type { IntervalShellMachineControl } from '@/components/fitness/interval-shells/interval-shell-control';
import { IntervalStartOnlyShell } from '@/components/fitness/interval-shells/IntervalStartOnlyShell';
import {
  deriveEmomDisplayFromEngine,
  useIntervalBlockEngine,
  useIntervalBlockGetElapsedMs,
  useIntervalBlockGetRemainingMs,
} from '@/hooks/use-interval-block-actor-display';
import { cn } from '@/lib/utils';

export type EmomIntervalShellProps = {
  block: WorkoutSessionBlockView;
  onSnapshot: (blockId: string, snapshot: IntervalRowSnapshot | null) => void;
  machineControl?: IntervalShellMachineControl;
  onMachineStart?: () => void;
};

const shellClassName = cn(
  'rounded-lg border border-border bg-muted/30 px-4 py-3',
  'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
);

export function EmomIntervalShell({
  block,
  onSnapshot,
  machineControl,
  onMachineStart,
}: EmomIntervalShellProps) {
  const config = useMemo(() => resolveEmomTimerConfig(block), [block]);

  if (!config) return null;

  if (machineControl?.intervalBlockRef) {
    return (
      <EmomIntervalShellMachine
        blockId={block.id}
        machineControl={machineControl}
        onMachineStart={onMachineStart}
      />
    );
  }

  if (onMachineStart) {
    return <IntervalStartOnlyShell blockId={block.id} label="EMOM" onStart={onMachineStart} />;
  }

  return <EmomIntervalShellHook blockId={block.id} config={config} onSnapshot={onSnapshot} />;
}

function EmomIntervalShellMachine({
  blockId,
  machineControl,
  onMachineStart,
}: {
  blockId: string;
  machineControl: IntervalShellMachineControl;
  onMachineStart?: () => void;
}) {
  const { intervalBlockRef } = machineControl;
  const engine = useIntervalBlockEngine(intervalBlockRef);
  const getElapsedMs = useIntervalBlockGetElapsedMs(intervalBlockRef);
  const getRemainingMs = useIntervalBlockGetRemainingMs(intervalBlockRef);
  const snapshot = engine ? deriveEmomDisplayFromEngine(engine) : null;
  const isEmom = snapshot != null && engine?.format === 'emom';

  const { audioEnabled, toggleAudio, primeAudio } = useIntervalShellPolish({
    isRunning: isEmom && snapshot.isRunning,
    isPaused: isEmom && snapshot.isPaused,
    getRemainingMs,
    cueSegmentKey: isEmom ? String(snapshot.roundIndex) : 'idle',
  });

  if (!isEmom) return null;

  const handleStart = async () => {
    await primeAudio();
    if (snapshot.phase === 'idle' && onMachineStart) {
      onMachineStart();
      return;
    }
    machineControl.onStart();
  };

  const phaseLabel =
    snapshot.phase === 'idle'
      ? 'Ready'
      : snapshot.phase === 'done'
        ? 'Complete'
        : snapshot.isPaused
          ? 'Paused'
          : 'EMOM';

  const roundLabel =
    snapshot.intervalMs === 60_000
      ? `Minute ${snapshot.displayRound} of ${snapshot.totalRounds}`
      : `Round ${snapshot.displayRound} of ${snapshot.totalRounds}`;

  const showRound = snapshot.phase !== 'idle' && snapshot.phase !== 'done';

  return (
    <div
      className={shellClassName}
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
          <Button type="button" size="sm" onClick={() => void handleStart()}>
            {snapshot.phase === 'done' ? 'Restart' : 'Start'}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={snapshot.isPaused ? machineControl.onResume : machineControl.onPause}
            >
              {snapshot.isPaused ? 'Resume' : 'Pause'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={machineControl.onReset}>
              Reset
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function EmomIntervalShellHook({
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
    onSnapshot(blockId, {
      roundIndex: snapshot.roundIndex,
      activeSetPhase,
      ...(snapshot.activeStationIndices != null
        ? { activeStationIndices: snapshot.activeStationIndices }
        : {}),
    });
  }, [
    blockId,
    onSnapshot,
    snapshot.phase,
    snapshot.roundIndex,
    snapshot.isPaused,
    snapshot.activeStationIndices,
  ]);

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
      className={shellClassName}
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
