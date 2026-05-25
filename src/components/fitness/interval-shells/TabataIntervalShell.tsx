'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { TimerDisplay } from '@/components/timer';
import { Button } from '@/components/ui/button';
import { useIntervalShellPolish } from '@/hooks/use-interval-shell-polish';
import { useIntervalTimerEngine } from '@/hooks/use-interval-timer-engine';
import { IntervalShellAudioToggle } from '@/components/fitness/interval-shells/IntervalShellAudioToggle';
import { resolveTabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import { deriveIntervalTimerSnapshot } from '@/lib/workout-factory/interval-timer/interval-timer-engine';
import {
  intervalTimerSnapshotToRowSnapshot,
  type IntervalRowSnapshot,
} from '@/lib/workout-factory/interval-timer/types';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { IntervalShellMachineControl } from '@/components/fitness/interval-shells/interval-shell-control';
import { IntervalStartOnlyShell } from '@/components/fitness/interval-shells/IntervalStartOnlyShell';
import {
  deriveTabataDisplayFromEngine,
  useIntervalBlockEngine,
  useIntervalBlockGetElapsedMs,
} from '@/hooks/use-interval-block-actor-display';
import { cn } from '@/lib/utils';

export type TabataIntervalShellProps = {
  block: WorkoutSessionBlockView;
  onSnapshot: (blockId: string, snapshot: IntervalRowSnapshot | null) => void;
  machineControl?: IntervalShellMachineControl;
  onMachineStart?: () => void;
};

const PHASE_LABELS: Record<string, string> = {
  idle: 'Ready',
  prepare: 'Prepare',
  work: 'Work',
  rest: 'Rest',
  done: 'Complete',
  paused: 'Paused',
};

const shellClassName = cn(
  'rounded-lg border border-border bg-muted/30 px-4 py-3',
  'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
);

function TabataShellControls({
  phase,
  isPaused,
  audioEnabled,
  onToggleAudio,
  onStart,
  onPause,
  onResume,
  onReset,
}: {
  phase: string;
  isPaused: boolean;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onStart: () => void | Promise<void>;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
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
    </div>
  );
}

function TabataShellLayout({
  blockId,
  phaseLabel,
  showRound,
  snapshot,
  getElapsedMs,
  isActive,
  controls,
}: {
  blockId: string;
  phaseLabel: string;
  showRound: boolean;
  snapshot: { displayRound: number; totalRounds: number; phaseDurationMs: number };
  getElapsedMs: () => number;
  isActive: boolean;
  controls: ReactNode;
}) {
  return (
    <div
      className={shellClassName}
      data-testid={`tabata-interval-shell-${blockId}`}
      data-region="tabata-interval-shell"
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {phaseLabel}
        </span>
        <TimerDisplay
          getElapsedMs={getElapsedMs}
          isActive={isActive}
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
      {controls}
    </div>
  );
}

export function TabataIntervalShell({
  block,
  onSnapshot,
  machineControl,
  onMachineStart,
}: TabataIntervalShellProps) {
  const config = useMemo(() => resolveTabataTimerConfig(block), [block]);

  if (!config) return null;

  if (machineControl?.intervalBlockRef) {
    return (
      <TabataIntervalShellMachine
        blockId={block.id}
        machineControl={machineControl}
        onMachineStart={onMachineStart}
      />
    );
  }

  if (onMachineStart) {
    return <IntervalStartOnlyShell blockId={block.id} label="Tabata" onStart={onMachineStart} />;
  }

  return <TabataIntervalShellHook blockId={block.id} config={config} onSnapshot={onSnapshot} />;
}

function TabataIntervalShellMachine({
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
  const snapshot = engine ? deriveTabataDisplayFromEngine(engine) : null;

  if (!snapshot || engine?.format !== 'tabata') return null;

  const cueSegmentKey = `${snapshot.phase}-${snapshot.roundIndex}`;
  const { audioEnabled, toggleAudio, primeAudio } = useIntervalShellPolish({
    isRunning: snapshot.isRunning,
    isPaused: snapshot.isPaused,
    remainingMs: snapshot.remainingMs,
    cueSegmentKey,
  });

  const phaseLabel = PHASE_LABELS[snapshot.phase] ?? snapshot.phase;
  const showRound =
    snapshot.phase !== 'idle' && snapshot.totalRounds > 0 && snapshot.phase !== 'done';

  const handleStart = async () => {
    await primeAudio();
    if (snapshot.phase === 'idle' && onMachineStart) {
      onMachineStart();
      return;
    }
    machineControl.onStart();
  };

  return (
    <TabataShellLayout
      blockId={blockId}
      phaseLabel={phaseLabel}
      showRound={showRound}
      snapshot={snapshot}
      getElapsedMs={getElapsedMs}
      isActive={snapshot.isRunning && !snapshot.isPaused}
      controls={
        <TabataShellControls
          phase={snapshot.phase}
          isPaused={snapshot.isPaused}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleAudio}
          onStart={handleStart}
          onPause={machineControl.onPause}
          onResume={machineControl.onResume}
          onReset={machineControl.onReset}
        />
      }
    />
  );
}

function TabataIntervalShellHook({
  blockId,
  config,
  onSnapshot,
}: {
  blockId: string;
  config: NonNullable<ReturnType<typeof resolveTabataTimerConfig>>;
  onSnapshot: TabataIntervalShellProps['onSnapshot'];
}) {
  const { snapshot, engineStateRef, start, pause, resume, reset } = useIntervalTimerEngine(config);
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

  const getElapsedMs = () => {
    const live = deriveIntervalTimerSnapshot(engineStateRef.current, Date.now());
    return Math.max(0, live.phaseDurationMs - live.remainingMs);
  };

  return (
    <TabataShellLayout
      blockId={blockId}
      phaseLabel={phaseLabel}
      showRound={showRound}
      snapshot={snapshot}
      getElapsedMs={getElapsedMs}
      isActive={snapshot.isRunning && !snapshot.isPaused}
      controls={
        <TabataShellControls
          phase={snapshot.phase}
          isPaused={snapshot.isPaused}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleAudio}
          onStart={handleStart}
          onPause={pause}
          onResume={resume}
          onReset={reset}
        />
      }
    />
  );
}
