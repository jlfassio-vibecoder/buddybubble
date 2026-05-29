import { fromCallback } from 'xstate';
import { shouldHideWorkoutCoachSentinelFromRail } from '@/components/chat/WorkoutCoachRail';
import { executionPatchFingerprint } from '@/lib/workout-player-execution-patch-bridge';
import { parseExecutionPatchFromMetadata } from '@/types/execution-patch';
import type { Json } from '@/types/database';
import type { ActiveSessionEvent } from '../machines/types';

export type CoachThreadMessageSlice = {
  id: string;
  user_id: string;
  created_at: string;
  metadata: Json | null;
  content?: string | null;
};

export type CoachThreadSnapshot = {
  messages: CoachThreadMessageSlice[];
  isLoading: boolean;
  coachAuthUserId: string | null;
  /** Active Session start — coach patches at or before this time are not replayed into the grid. */
  sessionStartedAt?: string | null;
};

export type CoachSyncAdapter = {
  fireSentinel: () => Promise<void>;
  canAttemptSentinel: () => boolean;
};

export type CoachSyncActorInput = {
  adapter: CoachSyncAdapter;
};

export type CoachSyncActorEvent =
  | { type: 'THREAD_SNAPSHOT'; snapshot: CoachThreadSnapshot }
  | { type: 'TRY_SENTINEL' }
  | { type: 'RESET' };

export function createNoOpCoachSyncAdapter(): CoachSyncAdapter {
  return {
    fireSentinel: async () => {},
    canAttemptSentinel: () => false,
  };
}

export const coachSyncActor = fromCallback<
  ActiveSessionEvent,
  CoachSyncActorInput,
  CoachSyncActorEvent
>(({ input, sendBack, receive }) => {
  const appliedPatchFingerprints = new Map<string, string>();
  let sentinelAttemptInFlight = false;

  const sweepExecutionPatches = (snapshot: CoachThreadSnapshot) => {
    if (snapshot.isLoading) return;
    if (!snapshot.coachAuthUserId) return;
    if (snapshot.messages.length === 0) return;

    const sessionStartedMs =
      snapshot.sessionStartedAt != null && snapshot.sessionStartedAt.trim()
        ? new Date(snapshot.sessionStartedAt).getTime()
        : null;

    const coachRows = snapshot.messages.filter(
      (m) =>
        m.user_id === snapshot.coachAuthUserId &&
        m.id &&
        !shouldHideWorkoutCoachSentinelFromRail(m),
    );

    for (const row of coachRows) {
      const id = row.id;
      if (!id) continue;
      const meta = row.metadata;
      const raw =
        meta != null && typeof meta === 'object' && !Array.isArray(meta)
          ? (meta as { execution_patch?: unknown }).execution_patch
          : undefined;
      const fp = executionPatchFingerprint(raw);
      if (fp != null && appliedPatchFingerprints.get(id) === fp) {
        continue;
      }

      const messageCreatedMs =
        typeof row.created_at === 'string' && row.created_at.trim()
          ? new Date(row.created_at).getTime()
          : null;
      if (
        sessionStartedMs != null &&
        messageCreatedMs != null &&
        messageCreatedMs <= sessionStartedMs
      ) {
        if (fp != null) appliedPatchFingerprints.set(id, fp);
        continue;
      }

      let patch = null;
      try {
        patch = parseExecutionPatchFromMetadata(raw);
      } catch {
        continue;
      }
      if (!patch) {
        if (fp != null) appliedPatchFingerprints.set(id, fp);
        continue;
      }
      sendBack({ type: 'COACH_PATCH', patch });
      if (fp != null) appliedPatchFingerprints.set(id, fp);
    }
  };

  receive((event) => {
    const e = event as unknown as CoachSyncActorEvent;
    if (e.type === 'THREAD_SNAPSHOT') {
      sweepExecutionPatches(e.snapshot);
      return;
    }
    if (e.type === 'TRY_SENTINEL') {
      if (sentinelAttemptInFlight) return;
      if (!input.adapter.canAttemptSentinel()) return;
      sentinelAttemptInFlight = true;
      sendBack({ type: 'COACH_SENTINEL_SEND' });
      void input.adapter
        .fireSentinel()
        .then(() => {
          sendBack({ type: 'COACH_SENTINEL_DONE' });
        })
        .catch(() => {
          sendBack({ type: 'COACH_SENTINEL_FAILED' });
        })
        .finally(() => {
          sentinelAttemptInFlight = false;
        });
      return;
    }
    if (e.type === 'RESET') {
      appliedPatchFingerprints.clear();
      sentinelAttemptInFlight = false;
    }
  });

  return () => {
    appliedPatchFingerprints.clear();
    sentinelAttemptInFlight = false;
  };
});
