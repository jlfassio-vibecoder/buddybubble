import { expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ActiveSessionTaskPayload } from '@/features/active-session/types/session-task';
import type { FinishWorkoutRunner } from '../../actors/finish-workout.actor';
import { ActiveSessionShell } from '../../components/ActiveSessionShell';
import { getShellTestState, type ShellHydrateResult } from './active-session-shell.test-setup';
import { createSampleDraftLogs } from './fixtures';
import {
  createMockPersistenceAdapter,
  flushPromises,
  type MockPersistenceHandle,
  type MockPersistenceOptions,
} from './mock-persistence';
import { createSessionTaskFixture, TEST_WORKSPACE_ID } from './session-task-fixture';

export { flushPromises };

export type RenderActiveSessionShellOptions = {
  workspaceId?: string;
  task?: ActiveSessionTaskPayload;
  searchParams?: Record<string, string>;
  persistenceOptions?: MockPersistenceOptions;
  persistence?: MockPersistenceHandle;
  finishRunner?: FinishWorkoutRunner;
  hydrateResult?: Partial<ShellHydrateResult>;
};

export type RenderActiveSessionShellResult = {
  router: ReturnType<typeof getShellTestState>['router'];
  persistence: MockPersistenceHandle;
  waitForHydrated: () => Promise<void>;
  task: ActiveSessionTaskPayload;
};

export function resetShellTestState(): void {
  const shellTestState = getShellTestState();
  shellTestState.router.push.mockReset();
  shellTestState.router.back.mockReset();
  shellTestState.router.replace.mockReset();
  shellTestState.searchParams = new URLSearchParams();
  shellTestState.persistenceHandle = null;
  shellTestState.finishRunner = null;
  shellTestState.hydrateResult = {
    draftLogs: createSampleDraftLogs(),
    ghostLogs: [],
    logTaskId: null,
  } satisfies ShellHydrateResult;
}

export function renderActiveSessionShell(
  options: RenderActiveSessionShellOptions = {},
): RenderActiveSessionShellResult {
  const shellTestState = getShellTestState();
  const task = options.task ?? createSessionTaskFixture();
  const workspaceId = options.workspaceId ?? TEST_WORKSPACE_ID;

  shellTestState.searchParams = new URLSearchParams(options.searchParams ?? {});

  if (options.hydrateResult) {
    shellTestState.hydrateResult = {
      ...shellTestState.hydrateResult,
      ...options.hydrateResult,
    } satisfies ShellHydrateResult;
  }

  shellTestState.persistenceHandle =
    options.persistence ?? createMockPersistenceAdapter(options.persistenceOptions ?? {});

  if (options.finishRunner) {
    shellTestState.finishRunner = options.finishRunner;
  }

  render(<ActiveSessionShell workspaceId={workspaceId} task={task} />);

  const waitForHydrated = async () => {
    await waitFor(() => {
      expect(screen.queryByText('Loading session…')).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^back$/i })).toBeTruthy();
    });
  };

  return {
    router: shellTestState.router,
    persistence: shellTestState.persistenceHandle,
    waitForHydrated,
    task,
  };
}
