import { vi } from 'vitest';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { GhostSetSnapshot } from '@/lib/workout-factory/ghost-set-snapshot';
import type { FinishWorkoutRunner, FinishWorkoutResult } from '../../actors/finish-workout.actor';
import type { ActiveSessionContext } from '../../machines/types';
import type { MockPersistenceHandle } from './mock-persistence';

export type ShellHydrateResult = {
  draftLogs: SetDraft[][];
  ghostLogs: GhostSetSnapshot[][];
  logTaskId: string | null;
};

const shellTestState = vi.hoisted(() => {
  const router = {
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  };

  return {
    router,
    searchParams: new URLSearchParams(),
    persistenceHandle: null as MockPersistenceHandle | null,
    finishRunner: null as FinishWorkoutRunner | null,
    hydrateResult: {
      draftLogs: [[{ weight: '100', reps: '5', rpe: '8', done: true }]] as SetDraft[][],
      ghostLogs: [] as GhostSetSnapshot[][],
      logTaskId: null as string | null,
    } satisfies ShellHydrateResult,
  };
});

export function getShellTestState() {
  return shellTestState;
}

vi.mock('next/navigation', () => ({
  useRouter: () => shellTestState.router,
  useSearchParams: () => shellTestState.searchParams,
}));

vi.mock('@/lib/workout-factory/recover-workout-session-logs', () => ({
  recoverWorkoutSessionLogs: vi.fn(async () => shellTestState.hydrateResult),
}));

vi.mock('@/components/modals/task-modal/hooks/useWorkoutUnitSystem', () => ({
  useWorkoutUnitSystem: () => ({ workoutUnitSystem: 'metric' }),
}));

vi.mock('@/features/active-session/hooks/useActiveSessionCoachBridge', () => ({
  useActiveSessionCoachBridge: () => ({
    coachWorkoutData: null,
    coachBubbleRow: null,
    canPostMessages: false,
    messageThread: { messages: [], isLoading: false },
  }),
}));

vi.mock('@/features/active-session/components/SessionLogSurface', async () => {
  const React = await import('react');
  const { createEditedDraftLogs } = await import('./fixtures');
  return {
    SessionLogSurface: ({
      onDraftLogsChange,
    }: {
      onDraftLogsChange: (next: SetDraft[][]) => void;
    }) =>
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'dirty-set',
          onClick: () => onDraftLogsChange(createEditedDraftLogs()),
        },
        'Dirty set',
      ),
  };
});

vi.mock('@/features/active-session/components/SessionCoachPane', () => ({
  SessionCoachPane: () => null,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@utils/supabase/client', () => ({
  createClient: () => ({}),
}));

vi.mock('@/features/active-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/active-session')>();
  const { createMockPersistenceAdapter: createMockAdapter } = await import('./mock-persistence');
  return {
    ...actual,
    createProductionPersistenceAdapter: () => {
      if (!shellTestState.persistenceHandle) {
        shellTestState.persistenceHandle = createMockAdapter();
      }
      return shellTestState.persistenceHandle.adapter;
    },
    createProductionFinishWorkoutRunner: () => {
      const runner = shellTestState.finishRunner;
      if (!runner) {
        return async (ctx: ActiveSessionContext): Promise<FinishWorkoutResult> => ({
          logTaskId: ctx.logTaskId ?? 'fallback-log',
          op: 'finish_update',
        });
      }
      return runner;
    },
  };
});
