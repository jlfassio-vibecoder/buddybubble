import { fromCallback } from 'xstate';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildWorkoutLogDraftMetadata } from '@/lib/workout-factory/build-workout-log-finish-metadata';
import { logsEqualTemplate } from '@/lib/workout-factory/workout-log-matrix';
import {
  buildSessionTelemetrySnapshot,
  type BuildSessionTelemetryContext,
} from '@/lib/workout-factory/session-telemetry';
import type { Json } from '@/types/database';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { AUTOSAVE_MS, type ActiveSessionEvent } from '../machines/types';
import type { ActiveSessionContext } from '../machines/types';

export type PersistenceAdapter = {
  insertDraft: () => Promise<{ logTaskId: string }>;
  updateDraft: (logTaskId: string) => Promise<void>;
};

export class AutosaveSkippedError extends Error {
  constructor() {
    super('autosave_skipped');
    this.name = 'AutosaveSkippedError';
  }
}

export type ProductionPersistenceDeps = {
  supabase: SupabaseClient;
  getContext: () => ActiveSessionContext;
  sourceMetadata: Json | null;
  sessionVm: WorkoutSessionViewModel;
  workoutTitle: string;
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

/** Phase 0 no-op adapter; tests use mock adapter. */
export function createNoOpPersistenceAdapter(): PersistenceAdapter {
  return {
    insertDraft: async () => ({ logTaskId: 'noop-draft' }),
    updateDraft: async () => {},
  };
}

export function createProductionPersistenceAdapter(
  deps: ProductionPersistenceDeps,
): PersistenceAdapter {
  const buildTelemetryContext = (ctx: ActiveSessionContext): BuildSessionTelemetryContext => ({
    sessionId: ctx.sessionId,
    sourceTaskId: ctx.sourceTaskId,
    logTaskId: ctx.logTaskId,
    draftLogs: ctx.draftLogs,
    ghostLogs: ctx.ghostLogs,
    elapsedSec: ctx.elapsedSec,
    startedAt: ctx.startedAt,
    intervalRowSnapshots: ctx.intervalRowSnapshots,
    sessionVm: ctx.sessionVm,
  });

  const buildMeta = (ctx: ActiveSessionContext) =>
    buildWorkoutLogDraftMetadata({
      sourceMetadata: deps.sourceMetadata,
      sessionVm: deps.sessionVm,
      sourceTaskId: ctx.sourceTaskId,
      draftLogs: ctx.draftLogs,
      classInstanceId: ctx.classInstanceId ?? null,
      sessionTelemetry: buildSessionTelemetrySnapshot({
        context: buildTelemetryContext(ctx),
      }),
    });

  return {
    insertDraft: async () => {
      const ctx = deps.getContext();
      if (
        ctx.logTaskId == null &&
        !ctx.hasUserEdited &&
        logsEqualTemplate(ctx.draftLogs, deps.sessionVm.flatExercises, deps.sessionVm.blocks)
      ) {
        throw new AutosaveSkippedError();
      }

      const meta = buildMeta(ctx);
      const { data, error } = await deps.supabase
        .from('tasks')
        .insert({
          bubble_id: ctx.targetBubbleId,
          title: `${deps.workoutTitle} — Log`,
          item_type: 'workout_log',
          status: 'in_progress',
          metadata: meta,
        })
        .select('id')
        .maybeSingle();

      if (error || !data?.id) {
        throw error ?? new Error('draft_insert_failed');
      }

      return { logTaskId: data.id };
    },
    updateDraft: async (logTaskId: string) => {
      const ctx = deps.getContext();
      const meta = buildMeta(ctx);
      const { error } = await deps.supabase
        .from('tasks')
        .update({ metadata: meta })
        .eq('id', logTaskId);

      if (error) {
        throw error;
      }
    },
  };
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
      if (error instanceof AutosaveSkippedError) {
        sendBack({ type: 'AUTOSAVE_SKIPPED' });
        return;
      }
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
