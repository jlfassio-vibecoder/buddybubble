import {
  CHAT_AREA_DEFAULT_AGENT_SLUG,
  MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY,
  MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY,
} from '@/components/chat/workout-coach-rail.constants';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import { sessionTelemetryMetadataFields } from '@/lib/agents/coach/coach-telemetry-bridge';
import type { GhostSetSnapshot } from '@/lib/workout-factory/ghost-set-snapshot';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
import {
  buildSessionTelemetrySnapshot,
  type SessionTelemetrySnapshot,
} from '@/lib/workout-factory/session-telemetry';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { Json } from '@/types/database';

export type ActiveSessionCoachTelemetrySource = {
  sessionId: string;
  sourceTaskId: string;
  logTaskId: string | null;
  draftLogs: SetDraft[][];
  ghostLogs: GhostSetSnapshot[][];
  elapsedSec: number;
  startedAt: string;
  intervalRowSnapshots: Record<string, IntervalRowSnapshot | null>;
  sessionVm: WorkoutSessionViewModel;
};

export function buildActiveSessionTelemetry(
  source: ActiveSessionCoachTelemetrySource,
  capturedAt?: string,
): SessionTelemetrySnapshot {
  return buildSessionTelemetrySnapshot({
    context: {
      sessionId: source.sessionId,
      sourceTaskId: source.sourceTaskId,
      logTaskId: source.logTaskId,
      draftLogs: source.draftLogs,
      ghostLogs: source.ghostLogs,
      elapsedSec: source.elapsedSec,
      startedAt: source.startedAt,
      intervalRowSnapshots: source.intervalRowSnapshots,
      sessionVm: source.sessionVm,
    },
    capturedAt,
  });
}

export function buildActiveSessionSentinelMetadata(params: {
  workoutTitle: string;
  sessionId: string;
  classInstanceId: string | null;
  workoutContext: Json;
  sessionTelemetry: SessionTelemetrySnapshot;
}): Json {
  const { workoutTitle, sessionId, classInstanceId, workoutContext, sessionTelemetry } = params;

  return {
    [MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY]: CHAT_AREA_DEFAULT_AGENT_SLUG,
    [MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY]: workoutTitle.trim() || 'this workout',
    sessionId,
    class_instance_id: classInstanceId,
    workoutContext,
    is_silent_sentinel: true,
    workout_context: {
      source: 'workout_player',
      surface: 'active_session',
      sessionId,
      class_instance_id: classInstanceId,
      isMemberView: true,
    },
    ...sessionTelemetryMetadataFields(sessionTelemetry),
  } satisfies Json;
}

export function shouldSkipSentinelForTelemetryFingerprint(
  fingerprint: string,
  lastSentFingerprint: string | null,
): boolean {
  return lastSentFingerprint != null && lastSentFingerprint === fingerprint;
}

export type FireActiveSessionCoachSentinelDeps = {
  sendMessage: (
    content: string,
    replyToId: string | undefined,
    files: File[] | undefined,
    options: { metadata: Json },
  ) => Promise<unknown>;
  displayText: string;
  workoutTitle: string;
  sessionId: string;
  classInstanceId: string | null;
  workoutContext: Json;
  telemetrySource: ActiveSessionCoachTelemetrySource;
  lastSentFingerprintRef: { current: string | null };
};

/** Returns true when a sentinel message was sent; false when deduped. */
export async function fireActiveSessionCoachSentinel(
  deps: FireActiveSessionCoachSentinelDeps,
): Promise<boolean> {
  const sessionTelemetry = buildActiveSessionTelemetry(deps.telemetrySource);
  if (
    shouldSkipSentinelForTelemetryFingerprint(
      sessionTelemetry.fingerprint,
      deps.lastSentFingerprintRef.current,
    )
  ) {
    return false;
  }

  const sentinelMetadata = buildActiveSessionSentinelMetadata({
    workoutTitle: deps.workoutTitle,
    sessionId: deps.sessionId,
    classInstanceId: deps.classInstanceId,
    workoutContext: deps.workoutContext,
    sessionTelemetry,
  });

  await deps.sendMessage(deps.displayText, undefined, undefined, { metadata: sentinelMetadata });
  deps.lastSentFingerprintRef.current = sessionTelemetry.fingerprint;
  return true;
}
