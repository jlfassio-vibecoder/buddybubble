import { fromPromise } from 'xstate';

/** Phase 1+ — wall-clock elapsed_sec ticker (stub). */
export const sessionClockActorStub = fromPromise(async () => {
  throw new Error('sessionClockActor is not wired until Phase 1.');
});

export { sessionClockActorStub as sessionClockActor };
