import { fromCallback } from 'xstate';
import { AUTOSAVE_MS, type ActiveSessionEvent } from '../machines/types';

export type PersistenceAdapter = {
  insertDraft: () => Promise<{ logTaskId: string }>;
  updateDraft: (logTaskId: string) => Promise<void>;
};

export type PersistenceActorInput = {
  adapter: PersistenceAdapter;
};

export type PersistenceSnapshot = {
  logTaskId: string | null;
  pendingInsert: boolean;
};

export type PersistenceActorEvent =
  | ({ type: 'SCHEDULE_AUTOSAVE' } & PersistenceSnapshot)
  | ({ type: 'FLUSH_AUTOSAVE' } & PersistenceSnapshot)
  | { type: 'CANCEL_AUTOSAVE' };

/** Phase 0 no-op adapter; Phase 2 replaces with Supabase-backed persistence. */
export function createNoOpPersistenceAdapter(): PersistenceAdapter {
  return {
    insertDraft: async () => ({ logTaskId: 'noop-draft' }),
    updateDraft: async () => {},
  };
}

/** @deprecated Phase 2 — use `createNoOpPersistenceAdapter` until Supabase wiring ships. */
export function createProductionPersistenceAdapter(): PersistenceAdapter {
  return createNoOpPersistenceAdapter();
}

export const persistenceActor = fromCallback<
  ActiveSessionEvent,
  PersistenceActorInput,
  PersistenceActorEvent
>(({ input, sendBack, receive }) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let runId = 0;
  let latestSnapshot: PersistenceSnapshot = { logTaskId: null, pendingInsert: false };

  const clearScheduled = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const runAutosave = async (currentRunId: number, snapshot: PersistenceSnapshot) => {
    sendBack({ type: 'AUTOSAVE_STARTED' });

    try {
      const { adapter } = input;
      const { logTaskId, pendingInsert } = snapshot;

      if (logTaskId != null) {
        await adapter.updateDraft(logTaskId);
        if (currentRunId !== runId) return;
        sendBack({ type: 'AUTOSAVE_DONE', logTaskId });
        return;
      }

      if (pendingInsert) {
        if (currentRunId !== runId) return;
        sendBack({ type: 'AUTOSAVE_FAILED', error: 'insert_already_pending' });
        return;
      }

      const { logTaskId: insertedId } = await adapter.insertDraft();
      if (currentRunId !== runId) return;
      sendBack({ type: 'AUTOSAVE_DONE', logTaskId: insertedId });
    } catch (error) {
      if (currentRunId !== runId) return;
      sendBack({
        type: 'AUTOSAVE_FAILED',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const scheduleAutosave = (snapshot: PersistenceSnapshot) => {
    latestSnapshot = snapshot;
    clearScheduled();
    sendBack({ type: 'AUTOSAVE_SCHEDULED' });
    timeoutId = setTimeout(() => {
      timeoutId = null;
      const currentRunId = ++runId;
      void runAutosave(currentRunId, latestSnapshot);
    }, AUTOSAVE_MS);
  };

  receive((event) => {
    const e = event as unknown as PersistenceActorEvent;
    if (e.type === 'SCHEDULE_AUTOSAVE') {
      latestSnapshot = {
        logTaskId: e.logTaskId,
        pendingInsert: e.pendingInsert,
      };
      scheduleAutosave(latestSnapshot);
      return;
    }
    if (e.type === 'FLUSH_AUTOSAVE') {
      latestSnapshot = {
        logTaskId: e.logTaskId,
        pendingInsert: e.pendingInsert,
      };
      clearScheduled();
      const currentRunId = ++runId;
      void runAutosave(currentRunId, latestSnapshot);
      return;
    }
    if (e.type === 'CANCEL_AUTOSAVE') {
      runId += 1;
      clearScheduled();
    }
  });

  return () => {
    runId += 1;
    clearScheduled();
  };
});
