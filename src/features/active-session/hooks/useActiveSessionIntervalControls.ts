'use client';

import { useCallback, useMemo } from 'react';
import type { AnyActorRef } from 'xstate';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { resolveIntervalBlockInput } from '@/lib/workout-factory/interval-timer/resolve-interval-block-input';
import type { IntervalBlockInput } from '@/lib/workout-factory/interval-timer/resolve-interval-block-input';
import type { ActiveSessionEvent } from '@/features/active-session/machines/types';
import type { IntervalShellMachineControl } from '@/components/fitness/interval-shells/interval-shell-control';

type Args = {
  send: (event: ActiveSessionEvent) => void;
  activeIntervalBlockId: string | null;
  activeIntervalInput: IntervalBlockInput | null;
  intervalBlockRef: AnyActorRef | null;
};

export function useActiveSessionIntervalControls({
  send,
  activeIntervalBlockId,
  activeIntervalInput,
  intervalBlockRef,
}: Args) {
  const onIntervalStart = useCallback(
    (block: WorkoutSessionBlockView) => {
      const input = resolveIntervalBlockInput(block);
      if (!input) return;
      send({ type: 'INTERVAL_START', input });
    },
    [send],
  );

  const intervalMachineControlByBlockId = useMemo((): Record<
    string,
    IntervalShellMachineControl | undefined
  > => {
    if (!activeIntervalBlockId || !activeIntervalInput || !intervalBlockRef) return {};

    const restart = () => send({ type: 'INTERVAL_START', input: activeIntervalInput });

    return {
      [activeIntervalBlockId]: {
        intervalBlockRef,
        onStart: restart,
        onPause: () =>
          send({
            type: 'INTERVAL_COMMAND',
            blockId: activeIntervalBlockId,
            command: 'PAUSE',
          }),
        onResume: () =>
          send({
            type: 'INTERVAL_COMMAND',
            blockId: activeIntervalBlockId,
            command: 'RESUME',
          }),
        onReset: () =>
          send({
            type: 'INTERVAL_COMMAND',
            blockId: activeIntervalBlockId,
            command: 'RESET',
          }),
        onLogRound: () =>
          send({
            type: 'INTERVAL_LOG_AMRAP_ROUND',
            blockId: activeIntervalBlockId,
          }),
      },
    };
  }, [activeIntervalBlockId, activeIntervalInput, intervalBlockRef, send]);

  return { onIntervalStart, intervalBlockRef, intervalMachineControlByBlockId };
}
