import {
  CHAT_AREA_DEFAULT_AGENT_SLUG,
  MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY,
  MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY,
} from '@/components/chat/workout-coach-rail.constants';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import { sessionTelemetryMetadataFields } from '@/lib/agents/coach/coach-telemetry-bridge';
import type { SessionReadinessContext } from '@/lib/workout-factory/session-readiness-context';
import type { GhostSetSnapshot } from '@/lib/workout-factory/ghost-set-snapshot';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
import {
  attachElapsedToSessionTelemetry,
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
  sessionReadinessContext?: SessionReadinessContext | null;
}): Json {
  const {
    workoutTitle,
    sessionId,
    classInstanceId,
    workoutContext,
    sessionTelemetry,
    sessionReadinessContext,
  } = params;

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
    ...(sessionReadinessContext
      ? { session_readiness_context: sessionReadinessContext as unknown as Json }
      : {}),
    ...sessionTelemetryMetadataFields(sessionTelemetry),
  } satisfies Json;
}

/** @deprecated Session-scoped dedupe replaces fingerprint matching; kept for tests. */
export function shouldSkipSentinelForTelemetryFingerprint(
  fingerprint: string,
  lastSentFingerprint: string | null,
  readinessCapturedAt?: string | null,
  lastSentReadinessCapturedAt?: string | null,
): boolean {
  if (lastSentFingerprint == null || lastSentFingerprint !== fingerprint) return false;
  const currentCapturedAt = readinessCapturedAt ?? null;
  const lastCapturedAt = lastSentReadinessCapturedAt ?? null;
  return currentCapturedAt === lastCapturedAt;
}

export function shouldSkipSentinelForSession(
  sessionId: string,
  lastSentSessionId: string | null,
): boolean {
  if (!sessionId.trim()) return false;
  return lastSentSessionId != null && lastSentSessionId === sessionId;
}

function readWorkoutOpenSessionIdFromMetadata(metadata: unknown): string | null {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const o = metadata as Record<string, unknown>;
  if (typeof o.sessionId === 'string' && o.sessionId.trim()) return o.sessionId.trim();
  const wctx = o.workout_context;
  if (wctx != null && typeof wctx === 'object' && !Array.isArray(wctx)) {
    const sid = (wctx as Record<string, unknown>).sessionId;
    if (typeof sid === 'string' && sid.trim()) return sid.trim();
  }
  return null;
}

/** True when the thread already contains a workout-open silent sentinel for this session. */
export function threadHasWorkoutOpenSentinelForSession(
  messages: ReadonlyArray<{ metadata: Json | null; created_at?: string }>,
  sessionId: string,
): boolean {
  if (!sessionId.trim()) return false;
  for (const message of messages) {
    const meta = message.metadata;
    if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) continue;
    const o = meta as Record<string, unknown>;
    if (o.is_silent_sentinel !== true) continue;
    const wctx = o.workout_context;
    if (wctx == null || typeof wctx !== 'object' || Array.isArray(wctx)) continue;
    if ((wctx as Record<string, unknown>).source !== 'workout_player') continue;
    const sid = readWorkoutOpenSessionIdFromMetadata(meta);
    if (sid === sessionId) return true;
  }
  return false;
}

function parseMessageTimestampMs(createdAt: string | undefined): number | null {
  if (typeof createdAt !== 'string' || !createdAt.trim()) return null;
  const ms = Date.parse(createdAt.trim());
  return Number.isFinite(ms) ? ms : null;
}

function findLatestWorkoutOpenSentinelCreatedAt(
  messages: ReadonlyArray<{ metadata: Json | null; created_at?: string }>,
  sessionId: string,
): string | null {
  if (!sessionId.trim()) return null;
  let latestCreatedAt: string | null = null;
  let latestMs = -1;
  for (const message of messages) {
    const meta = message.metadata;
    if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) continue;
    const o = meta as Record<string, unknown>;
    if (o.is_silent_sentinel !== true) continue;
    const wctx = o.workout_context;
    if (wctx == null || typeof wctx !== 'object' || Array.isArray(wctx)) continue;
    if ((wctx as Record<string, unknown>).source !== 'workout_player') continue;
    const sid = readWorkoutOpenSessionIdFromMetadata(meta);
    if (sid !== sessionId) continue;
    const ms = parseMessageTimestampMs(message.created_at);
    if (ms === null) continue;
    if (ms >= latestMs) {
      latestMs = ms;
      latestCreatedAt = message.created_at!.trim();
    }
  }
  return latestCreatedAt;
}

/**
 * True when Coach already replied after the workout-open sentinel for this session.
 * Used to mark sentinel satisfied on remount without blocking the first greeting.
 */
export function threadHasCoachWorkoutOpenReplyForSession(
  messages: ReadonlyArray<{
    user_id: string;
    created_at: string;
    metadata: Json | null;
  }>,
  sessionId: string,
  coachAuthUserId: string | null,
): boolean {
  if (!coachAuthUserId?.trim()) return false;
  const sentinelCreatedAt = findLatestWorkoutOpenSentinelCreatedAt(messages, sessionId);
  if (sentinelCreatedAt === null) return false;
  const sentinelMs = Date.parse(sentinelCreatedAt);
  if (!Number.isFinite(sentinelMs)) return false;
  for (const message of messages) {
    if (message.user_id !== coachAuthUserId) continue;
    const meta = message.metadata;
    if (meta != null && typeof meta === 'object' && !Array.isArray(meta)) {
      const o = meta as Record<string, unknown>;
      if (o.is_silent_sentinel === true) continue;
    }
    const msgMs = parseMessageTimestampMs(message.created_at);
    if (msgMs === null) continue;
    if (msgMs >= sentinelMs) return true;
  }
  return false;
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
  /** Performance snapshot (elapsedSec: 0) — fingerprint stable across SESSION_TICK. */
  performanceTelemetrySnapshot: SessionTelemetrySnapshot;
  elapsedSec: number;
  /** Session-scoped send dedupe — one open sentinel per active session. */
  lastSentSessionIdRef: { current: string | null };
  sessionReadinessContext?: SessionReadinessContext | null;
};

/** Returns true when a sentinel message was sent; false when deduped. */
export async function fireActiveSessionCoachSentinel(
  deps: FireActiveSessionCoachSentinelDeps,
): Promise<boolean> {
  const { performanceTelemetrySnapshot } = deps;
  if (shouldSkipSentinelForSession(deps.sessionId, deps.lastSentSessionIdRef.current)) {
    return false;
  }

  const sessionTelemetry = attachElapsedToSessionTelemetry(
    performanceTelemetrySnapshot,
    deps.elapsedSec,
  );

  const sentinelMetadata = buildActiveSessionSentinelMetadata({
    workoutTitle: deps.workoutTitle,
    sessionId: deps.sessionId,
    classInstanceId: deps.classInstanceId,
    workoutContext: deps.workoutContext,
    sessionTelemetry,
    sessionReadinessContext: deps.sessionReadinessContext ?? null,
  });

  await deps.sendMessage(deps.displayText, undefined, undefined, { metadata: sentinelMetadata });
  deps.lastSentSessionIdRef.current = deps.sessionId;
  return true;
}
