'use client';

import { useMemo, useState } from 'react';
import { TimerDisplay } from '@/components/timer';
import { Button } from '@/components/ui/button';
import { useAmrapTimerEngine } from '@/hooks/use-amrap-timer-engine';
import { resolveAmrapTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-amrap-timer-config';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { cn } from '@/lib/utils';

export type AmrapIntervalShellProps = {
  block: WorkoutSessionBlockView;
  onLogRound: (blockId: string) => void;
};

export function AmrapIntervalShell({ block, onLogRound }: AmrapIntervalShellProps) {
  const config = useMemo(() => resolveAmrapTimerConfig(block), [block]);

  if (!config) return null;

  return <AmrapIntervalShellInner blockId={block.id} config={config} onLogRound={onLogRound} />;
}

function AmrapIntervalShellInner({
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

  const canLogRound = snapshot.phase === 'running' && !snapshot.isPaused;
  const phaseLabel =
    snapshot.phase === 'idle'
      ? 'Ready'
      : snapshot.phase === 'done'
        ? 'Time cap'
        : snapshot.isPaused
          ? 'Paused'
          : 'AMRAP';

  const handleLogRound = () => {
    if (!canLogRound) return;
    onLogRound(blockId);
    setRoundCount((n) => n + 1);
  };

  const getElapsedMs = () => snapshot.elapsedMs;

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-muted/30 px-4 py-3',
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
      )}
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
          {roundCount > 0 ? (
            <>
              Rounds logged: {roundCount}
              {config.targetRounds != null ? ` · Target ${config.targetRounds}` : ''}
            </>
          ) : config.targetRounds != null ? (
            `Target ${config.targetRounds} rounds`
          ) : (
            'Log each round when you finish the circuit'
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {snapshot.phase === 'idle' || snapshot.phase === 'done' ? (
          <Button type="button" size="sm" onClick={start}>
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
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={!canLogRound}
          onClick={handleLogRound}
        >
          Log Round
        </Button>
      </div>
    </div>
  );
}
