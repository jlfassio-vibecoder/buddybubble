import { fromPromise } from 'xstate';
import type { ActiveSessionContext } from '../machines/types';
import type { PersistenceAdapter } from './persistence.actor';

export type FinishWorkoutInput = {
  context: ActiveSessionContext;
  adapter: PersistenceAdapter;
};

export type FinishWorkoutResult = {
  logTaskId: string;
  op: 'finish_insert' | 'finish_update';
};

export const finishWorkoutActor = fromPromise<FinishWorkoutResult, FinishWorkoutInput>(
  async ({ input }) => {
    const { context, adapter } = input;
    if (context.logTaskId != null) {
      await adapter.updateDraft(context.logTaskId);
      return { logTaskId: context.logTaskId, op: 'finish_update' };
    }
    const { logTaskId } = await adapter.insertDraft();
    return { logTaskId, op: 'finish_insert' };
  },
);

/** Phase 2 — coach thread subscription + sentinel + execution_patch. */
export const coachSyncActorStub = fromPromise(async () => {
  throw new Error('coachSyncActor is not wired until Phase 2.');
});

export { coachSyncActorStub as coachSyncActor };
