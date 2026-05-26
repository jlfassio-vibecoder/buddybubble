import './test-utils/active-session-shell.test-setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ActiveSessionContext } from '../machines/types';
import type { FinishWorkoutResult } from '../actors/finish-workout.actor';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { createInitialContext } from '../machines/types';
import { executeFinishWorkout } from '../actors/finish-workout.actor';
import { createDefaultInput, createSampleDraftLogs } from './test-utils/fixtures';
import { createSessionTaskFixture } from './test-utils/session-task-fixture';
import {
  flushPromises,
  renderActiveSessionShell,
  resetShellTestState,
} from './test-utils/render-active-session-shell';
import {
  TEST_COACH_BUBBLE_ID,
  TEST_WORKOUT_LOGS_BUBBLE_ID,
  TEST_WORKSPACE_ID,
} from './test-utils/session-task-fixture';
import { createFinishSupabaseMock } from './test-utils/supabase-tasks-mock';

vi.mock('@/lib/task-assignees-db', () => ({
  replaceTaskAssigneesWithUserIds: vi.fn(async () => ({ error: null })),
}));

describe('ActiveSessionShell exit flows', () => {
  beforeEach(() => {
    resetShellTestState();
  });

  afterEach(() => {
    cleanup();
  });

  describe('abandon', () => {
    it('defers abandon navigation until persistence flush resolves', async () => {
      const { router, persistence, waitForHydrated } = renderActiveSessionShell({
        persistenceOptions: {
          blockInsertUntilResolved: true,
          logTaskId: 'log-draft-001',
        },
        hydrateResult: {
          draftLogs: createSampleDraftLogs(),
          ghostLogs: [],
          logTaskId: null,
        },
      });

      await waitForHydrated();

      fireEvent.click(screen.getByTestId('dirty-set'));
      fireEvent.click(screen.getByRole('button', { name: /^back$/i }));

      await flushPromises();

      expect(router.back).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
      expect(persistence.ops).toContain('insert');
      expect(screen.getAllByRole('button', { name: /saving/i }).length).toBeGreaterThan(0);

      persistence.resolveInsert();
      await flushPromises();

      await waitFor(() => {
        expect(router.back).toHaveBeenCalledTimes(1);
      });
      expect(router.push).not.toHaveBeenCalled();
    });

    it('navigates to return URL after abandon flush when ?return= is set', async () => {
      const returnPath = `/app/${TEST_WORKSPACE_ID}/tasks`;

      const { router, persistence, waitForHydrated } = renderActiveSessionShell({
        searchParams: { return: returnPath },
        persistenceOptions: {
          blockInsertUntilResolved: true,
          logTaskId: 'log-draft-001',
        },
        hydrateResult: {
          draftLogs: createSampleDraftLogs(),
          ghostLogs: [],
          logTaskId: null,
        },
      });

      await waitForHydrated();

      fireEvent.click(screen.getByTestId('dirty-set'));
      fireEvent.click(screen.getByRole('button', { name: /^back$/i }));

      await flushPromises();

      expect(router.push).not.toHaveBeenCalled();
      expect(router.back).not.toHaveBeenCalled();

      persistence.resolveInsert();
      await flushPromises();

      await waitFor(() => {
        expect(router.push).toHaveBeenCalledWith(returnPath);
      });
      expect(router.back).not.toHaveBeenCalled();
    });
  });

  describe('finish', () => {
    it('finish completes on Workout Logs bubble and replaces to workspace home', async () => {
      const capture = { context: null as ActiveSessionContext | null };
      let resolveFinish: (value: FinishWorkoutResult) => void = () => {};
      const finishPromise = new Promise<FinishWorkoutResult>((resolve) => {
        resolveFinish = resolve;
      });

      const finishRunner = vi.fn(async (ctx: ActiveSessionContext) => {
        capture.context = ctx;
        return finishPromise;
      });

      const { router, waitForHydrated, task } = renderActiveSessionShell({
        finishRunner,
        hydrateResult: {
          draftLogs: createSampleDraftLogs(),
          ghostLogs: [],
          logTaskId: 'existing-log-99',
        },
      });

      await waitForHydrated();

      fireEvent.click(screen.getByRole('button', { name: /^finish$/i }));

      await flushPromises();

      expect(finishRunner).toHaveBeenCalledTimes(1);
      expect(router.replace).not.toHaveBeenCalled();

      resolveFinish({ logTaskId: 'existing-log-99', op: 'finish_update' });
      await flushPromises();

      await waitFor(() => {
        expect(router.replace).toHaveBeenCalledWith(`/app/${TEST_WORKSPACE_ID}`);
      });

      expect(capture.context?.targetBubbleId).toBe(task.target_bubble_id);
      expect(capture.context?.targetBubbleId).toBe(TEST_WORKOUT_LOGS_BUBBLE_ID);
      expect(capture.context?.targetBubbleId).not.toBe(TEST_COACH_BUBBLE_ID);
      expect(router.back).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledTimes(1);
    });

    it('finish_insert targets Workout Logs bubble_id in tasks.insert payload', async () => {
      const task = createSessionTaskFixture();
      const { supabase, logInserts } = createFinishSupabaseMock({ insertedLogId: 'new-log-55' });
      const sessionVm = buildWorkoutSessionViewModel(task.metadata);
      const draftLogs = createSampleDraftLogs();

      const context = {
        ...createInitialContext(
          createDefaultInput({
            sourceTaskId: task.id,
            bubbleId: task.bubble_id,
            targetBubbleId: task.target_bubble_id,
            sourceMetadata: task.metadata,
            workoutTitle: task.title ?? 'Test Workout',
            sessionVm,
            draftLogs,
          }),
        ),
        logTaskId: null,
        draftLogs,
        elapsedSec: 90,
      };

      const result = await executeFinishWorkout(context, {
        supabase,
        sourceMetadata: task.metadata,
        sessionVm,
        workoutTitle: task.title ?? 'Test Workout',
      });

      expect(result).toEqual({ logTaskId: 'new-log-55', op: 'finish_insert' });
      expect(logInserts).toHaveLength(1);
      expect(logInserts[0]).toEqual({
        bubble_id: TEST_WORKOUT_LOGS_BUBBLE_ID,
        item_type: 'workout_log',
        status: 'completed',
      });
      expect(logInserts[0]?.bubble_id).not.toBe(TEST_COACH_BUBBLE_ID);
    });

    it('defers finish navigation until autosave and finish runner complete', async () => {
      let resolveFinish: (value: FinishWorkoutResult) => void = () => {};
      const finishPromise = new Promise<FinishWorkoutResult>((resolve) => {
        resolveFinish = resolve;
      });

      const finishRunner = vi.fn(async () => finishPromise);

      const { router, persistence, waitForHydrated } = renderActiveSessionShell({
        persistenceOptions: {
          blockInsertUntilResolved: true,
          logTaskId: 'log-draft-001',
        },
        finishRunner,
        hydrateResult: {
          draftLogs: createSampleDraftLogs(),
          ghostLogs: [],
          logTaskId: null,
        },
      });

      await waitForHydrated();

      fireEvent.click(screen.getByTestId('dirty-set'));
      fireEvent.click(screen.getByRole('button', { name: /^finish$/i }));

      await flushPromises();

      expect(router.replace).not.toHaveBeenCalled();
      expect(persistence.ops).toContain('insert');

      persistence.resolveInsert();
      await flushPromises();

      expect(router.replace).not.toHaveBeenCalled();

      resolveFinish({ logTaskId: 'log-draft-001', op: 'finish_update' });
      await flushPromises();

      await waitFor(() => {
        expect(router.replace).toHaveBeenCalledWith(`/app/${TEST_WORKSPACE_ID}`);
      });
      expect(router.replace).toHaveBeenCalledTimes(1);
    });
  });
});
