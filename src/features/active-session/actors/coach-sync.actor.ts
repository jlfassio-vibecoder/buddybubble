import { fromPromise } from 'xstate';

/** Phase 2 — coach thread subscription + sentinel + execution_patch. */
export const coachSyncActorStub = fromPromise(async () => {
  throw new Error('coachSyncActor is not wired until Phase 2.');
});

export { coachSyncActorStub as coachSyncActor };
