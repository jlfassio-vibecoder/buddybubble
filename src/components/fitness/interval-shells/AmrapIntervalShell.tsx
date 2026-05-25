'use client';

import { useMemo, useState } from 'react';
import { TimerDisplay } from '@/components/timer';
import { Button } from '@/components/ui/button';
import { useAmrapTimerEngine } from '@/hooks/use-amrap-timer-engine';
import { useIntervalShellPolish } from '@/hooks/use-interval-shell-polish';
import { IntervalShellAudioToggle } from '@/components/fitness/interval-shells/IntervalShellAudioToggle';
import { IntervalStartOnlyShell } from '@/components/fitness/interval-shells/IntervalStartOnlyShell';
import { resolveAmrapTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-amrap-timer-config';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { IntervalShellMachineControl } from '@/components/fitness/interval-shells/interval-shell-control';
import {
  deriveAmrapDisplayFromEngine,
  useIntervalBlockAmrapRoundCount,
  useIntervalBlockEngine,
  useIntervalBlockGetElapsedMs,
} from '@/hooks/use-interval-block-actor-display';
import { cn } from '@/lib/utils';

export type AmrapIntervalShellProps = {
  block: WorkoutSessionBlockView;
  onLogRound: (blockId: string) => void;
  machineControl?: IntervalShellMachineControl;
  onMachineStart?: () => void;
};

const shellClassName = cn(
  'rounded-lg border border-border bg-muted/30 px-4 py-3',
  'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
);

function AmrapRoundLabel({
  roundCount,
  targetRounds,
}: {
  roundCount: number;
  targetRounds: number | null | undefined;
}) {
  if (roundCount > 0) {
    return (
      <>
        Rounds logged: {roundCount}
        {targetRounds != null ? ` · Target ${targetRounds}` : ''}
      </>
    );
  }
  if (targetRounds != null) {
    return <>Target {targetRounds} rounds</>;
  }
  return <>Log each round when you finish the circuit</>;
}

function AmrapShellControls({
  phase,
  isPaused,
  isActive,
  audioEnabled,
  onToggleAudio,
  onStart,
  onPause,
  onResume,
  onReset,
  onLogRound,
}: {
  phase: string;
  isPaused: boolean;
  isActive: boolean;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onStart: () => void | Promise<void>;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onLogRound: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <IntervalShellAudioToggle audioEnabled={audioEnabled} onToggle={onToggleAudio} />
      {phase === 'idle' || phase === 'done' ? (
        <Button type="button" size="sm" onClick={() => void onStart()}>
          {phase === 'done' ? 'Restart' : 'Start'}
        </Button>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={isPaused ? onResume : onPause}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onReset}>
            Reset
          </Button>
        </>
      )}
      <Button type="button" size="sm" variant="default" disabled={!isActive} onClick={onLogRound}>
        Log Round
      </Button>
    </div>
  );
}

export function AmrapIntervalShell({
  block,
  onLogRound,
  machineControl,
  onMachineStart,
}: AmrapIntervalShellProps) {
  const config = useMemo(() => resolveAmrapTimerConfig(block), [block]);

  if (!config) return null;

  if (machineControl?.intervalBlockRef) {
    return (
      <AmrapIntervalShellMachine
        blockId={block.id}
        config={config}
        machineControl={machineControl}
        onLogRound={onLogRound}
        onMachineStart={onMachineStart}
      />
    );
  }

  if (onMachineStart) {
    return <IntervalStartOnlyShell blockId={block.id} label="AMRAP" onStart={onMachineStart} />;
  }

  return <AmrapIntervalShellHook blockId={block.id} config={config} onLogRound={onLogRound} />;
}

function AmrapIntervalShellMachine({
  blockId,
  config,
  machineControl,
  onLogRound,
  onMachineStart,
}: {
  blockId: string;
  config: NonNullable<ReturnType<typeof resolveAmrapTimerConfig>>;
  machineControl: IntervalShellMachineControl;
  onLogRound: AmrapIntervalShellProps['onLogRound'];
  onMachineStart?: () => void;
}) {
  const { intervalBlockRef } = machineControl;
  const engine = useIntervalBlockEngine(intervalBlockRef);
  const roundCount = useIntervalBlockAmrapRoundCount(intervalBlockRef);
  const getElapsedMs = useIntervalBlockGetElapsedMs(intervalBlockRef);
  const snapshot = engine ? deriveAmrapDisplayFromEngine(engine) : null;

  if (!snapshot || engine?.format !== 'amrap') return null;

  const isActive = snapshot.phase === 'running' && !snapshot.isPaused;
  const { audioEnabled, toggleAudio, primeAudio } = useIntervalShellPolish({
    isRunning: snapshot.phase === 'running',
    isPaused: snapshot.isPaused,
    remainingMs: snapshot.remainingMs,
    cueSegmentKey: 'global',
    amrapTenSecondWarning: true,
  });

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
        ? 'Time cap'
        : snapshot.isPaused
          ? 'Paused'
          : 'AMRAP';

  const handleLogRound = () => {
    if (!isActive) return;
    onLogRound(blockId);
    machineControl.onLogRound?.();
  };

  return (
    <div
      className={shellClassName}
      data-testid={`amrap-interval-shell-${blockId}`}
      data-region="amrap-interval-shell"
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {phaseLabel}
        </span>
        <TimerDisplay
          getElapsedMs={getElapsedMs}
          isActive={snapshot.phase === 'running'}
          format="countdown-seconds"
          totalMs={snapshot.timeCapMs}
          className="text-3xl"
        />
        <span className="text-xs text-muted-foreground">
          <AmrapRoundLabel roundCount={roundCount} targetRounds={config.targetRounds} />
        </span>
      </div>
      <AmrapShellControls
        phase={snapshot.phase}
        isPaused={snapshot.isPaused}
        isActive={isActive}
        audioEnabled={audioEnabled}
        onToggleAudio={toggleAudio}
        onStart={handleStart}
        onPause={machineControl.onPause}
        onResume={machineControl.onResume}
        onReset={machineControl.onReset}
        onLogRound={handleLogRound}
      />
    </div>
  );
}

function AmrapIntervalShellHook({
  blockId,
  config,
  onLogRound,
}: {
  blockId: string;
  config: NonNullable<ReturnType<typeof resolveAmrapTimerConfig>>;
  onLogRound: AmrapIntervalShellProps['onLogRound'];
}) {
  const { snapshot, start, pause, resume, reset } = useAmrapTimerEngine(config);
  const [roundCount, setRoundCount] = useState(0);
  const isActive = snapshot.phase === 'running' && !snapshot.isPaused;
  const { audioEnabled, toggleAudio, primeAudio } = useIntervalShellPolish({
    isRunning: snapshot.phase === 'running',
    isPaused: snapshot.isPaused,
    remainingMs: snapshot.remainingMs,
    cueSegmentKey: 'global',
    amrapTenSecondWarning: true,
  });

  const handleStart = async () => {
    await primeAudio();
    start();
  };

  const phaseLabel =
    snapshot.phase === 'idle'
      ? 'Ready'
      : snapshot.phase === 'done'
        ? 'Time cap'
        : snapshot.isPaused
          ? 'Paused'
          : 'AMRAP';

  const handleLogRound = () => {
    if (!isActive) return;
    onLogRound(blockId);
    setRoundCount((n) => n + 1);
  };

  const getElapsedMs = () => snapshot.elapsedMs;

  return (
    <div
      className={shellClassName}
      data-testid={`amrap-interval-shell-${blockId}`}
      data-region="amrap-interval-shell"
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {phaseLabel}
        </span>
        <TimerDisplay
          getElapsedMs={getElapsedMs}
          isActive={snapshot.phase === 'running'}
          format="countdown-seconds"
          totalMs={snapshot.timeCapMs}
          className="text-3xl"
        />
        <span className="text-xs text-muted-foreground">
          <AmrapRoundLabel roundCount={roundCount} targetRounds={config.targetRounds} />
        </span>
      </div>
      <AmrapShellControls
        phase={snapshot.phase}
        isPaused={snapshot.isPaused}
        isActive={isActive}
        audioEnabled={audioEnabled}
        onToggleAudio={toggleAudio}
        onStart={handleStart}
        onPause={pause}
        onResume={resume}
        onReset={reset}
        onLogRound={handleLogRound}
      />
    </div>
  );
}
