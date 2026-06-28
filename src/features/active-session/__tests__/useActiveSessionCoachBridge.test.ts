import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WORKOUT_COACH_SENTINEL_DISPLAY_TEXT } from '@/components/chat/WorkoutCoachRail';
import {
  MESSAGE_METADATA_SESSION_TELEMETRY_FINGERPRINT_KEY,
  MESSAGE_METADATA_SESSION_TELEMETRY_KEY,
} from '@/lib/agents/coach/coach-telemetry-bridge';
import {
  SESSION_READINESS_CONTEXT_VERSION,
  buildSessionReadinessContext,
} from '@/lib/workout-factory/session-readiness-context';
import {
  SESSION_TELEMETRY_SCHEMA_VERSION,
  attachElapsedToSessionTelemetry,
} from '@/lib/workout-factory/session-telemetry';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import {
  buildActiveSessionSentinelMetadata,
  buildActiveSessionTelemetry,
  fireActiveSessionCoachSentinel,
  shouldSkipSentinelForSession,
  shouldSkipSentinelForTelemetryFingerprint,
  threadHasCoachWorkoutOpenReplyForSession,
  threadHasWorkoutOpenSentinelForSession,
  type ActiveSessionCoachTelemetrySource,
  type FireActiveSessionCoachSentinelDeps,
} from '../lib/active-session-coach-telemetry';
import {
  createDefaultInput,
  createEditedDraftLogs,
  createSampleDraftLogs,
  TEST_SESSION_ID,
  TEST_SOURCE_TASK_ID,
} from './test-utils/fixtures';

function createTelemetrySource(
  overrides: Partial<ActiveSessionCoachTelemetrySource> = {},
): ActiveSessionCoachTelemetrySource {
  const input = createDefaultInput();
  return {
    sessionId: input.sessionId,
    sourceTaskId: input.sourceTaskId,
    logTaskId: null,
    draftLogs: input.draftLogs,
    ghostLogs: [],
    elapsedSec: 90,
    startedAt: '2026-05-24T15:30:00.000Z',
    intervalRowSnapshots: {},
    sessionVm: input.sessionVm,
    ...overrides,
  };
}

describe('active session coach telemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T15:30:00.000Z'));
  });

  it('buildActiveSessionSentinelMetadata includes session_telemetry and fingerprint', () => {
    const source = createTelemetrySource();
    const snapshot = buildActiveSessionTelemetry(source);

    const metadata = buildActiveSessionSentinelMetadata({
      workoutTitle: 'Test Workout',
      sessionId: TEST_SESSION_ID,
      classInstanceId: null,
      workoutContext: { exercises: [] },
      sessionTelemetry: snapshot,
    }) as Record<string, unknown>;

    expect(metadata.session_telemetry).toMatchObject({
      schema_version: SESSION_TELEMETRY_SCHEMA_VERSION,
      session_id: TEST_SESSION_ID,
      source_task_id: TEST_SOURCE_TASK_ID,
    });
    expect(metadata[MESSAGE_METADATA_SESSION_TELEMETRY_KEY]).toBe(metadata.session_telemetry);
    expect(metadata[MESSAGE_METADATA_SESSION_TELEMETRY_FINGERPRINT_KEY]).toBe(snapshot.fingerprint);
    expect(metadata.is_silent_sentinel).toBe(true);
    expect((metadata.workout_context as Record<string, unknown>).surface).toBe('active_session');
  });

  it('buildActiveSessionSentinelMetadata includes session_readiness_context when provided', () => {
    const source = createTelemetrySource();
    const snapshot = buildActiveSessionTelemetry(source);
    const readiness = buildSessionReadinessContext({
      readiness: 6,
      sleepQuality: 8,
      soreness: ['Back'],
    });

    const metadata = buildActiveSessionSentinelMetadata({
      workoutTitle: 'Test Workout',
      sessionId: TEST_SESSION_ID,
      classInstanceId: null,
      workoutContext: { exercises: [] },
      sessionTelemetry: snapshot,
      sessionReadinessContext: readiness,
    }) as Record<string, unknown>;

    expect(metadata.session_readiness_context).toMatchObject({
      v: SESSION_READINESS_CONTEXT_VERSION,
      readiness: 6,
      sleep_quality: 8,
      soreness: ['Back'],
      source: 'task_modal_preflight',
    });
  });

  it('shouldSkipSentinelForSession skips only exact session matches', () => {
    expect(shouldSkipSentinelForSession('session-a', null)).toBe(false);
    expect(shouldSkipSentinelForSession('session-a', 'session-b')).toBe(false);
    expect(shouldSkipSentinelForSession('session-a', 'session-a')).toBe(true);
    expect(shouldSkipSentinelForSession('', 'session-a')).toBe(false);
  });

  it('threadHasWorkoutOpenSentinelForSession detects prior open sentinel for session', () => {
    const metadata = buildActiveSessionSentinelMetadata({
      workoutTitle: 'Test Workout',
      sessionId: TEST_SESSION_ID,
      classInstanceId: null,
      workoutContext: { exercises: [] },
      sessionTelemetry: buildActiveSessionTelemetry(createTelemetrySource()),
    });
    expect(threadHasWorkoutOpenSentinelForSession([], TEST_SESSION_ID)).toBe(false);
    expect(
      threadHasWorkoutOpenSentinelForSession([{ metadata: metadata as never }], TEST_SESSION_ID),
    ).toBe(true);
    expect(
      threadHasWorkoutOpenSentinelForSession([{ metadata: metadata as never }], 'other-session-id'),
    ).toBe(false);
  });

  it('threadHasCoachWorkoutOpenReplyForSession requires coach reply after sentinel', () => {
    const metadata = buildActiveSessionSentinelMetadata({
      workoutTitle: 'Test Workout',
      sessionId: TEST_SESSION_ID,
      classInstanceId: null,
      workoutContext: { exercises: [] },
      sessionTelemetry: buildActiveSessionTelemetry(createTelemetrySource()),
    });
    const coachId = 'coach-auth-user';
    const sentinelRow = {
      user_id: 'member-user',
      created_at: '2026-05-24T15:30:00.000Z',
      metadata: metadata as never,
    };
    expect(threadHasCoachWorkoutOpenReplyForSession([sentinelRow], TEST_SESSION_ID, coachId)).toBe(
      false,
    );
    expect(
      threadHasCoachWorkoutOpenReplyForSession(
        [
          sentinelRow,
          {
            user_id: coachId,
            created_at: '2026-05-24T15:30:01.000Z',
            metadata: null,
          },
        ],
        TEST_SESSION_ID,
        coachId,
      ),
    ).toBe(true);
    expect(threadHasWorkoutOpenSentinelForSession([sentinelRow], TEST_SESSION_ID)).toBe(true);
  });

  it('shouldSkipSentinelForTelemetryFingerprint skips only exact fingerprint matches', () => {
    expect(shouldSkipSentinelForTelemetryFingerprint('abc123', null)).toBe(false);
    expect(shouldSkipSentinelForTelemetryFingerprint('abc123', 'def456')).toBe(false);
    expect(shouldSkipSentinelForTelemetryFingerprint('abc123', 'abc123')).toBe(true);
    expect(
      shouldSkipSentinelForTelemetryFingerprint(
        'abc123',
        'abc123',
        '2026-05-28T10:00:00.000Z',
        '2026-05-28T11:00:00.000Z',
      ),
    ).toBe(false);
    expect(
      shouldSkipSentinelForTelemetryFingerprint(
        'abc123',
        'abc123',
        '2026-05-28T10:00:00.000Z',
        '2026-05-28T10:00:00.000Z',
      ),
    ).toBe(true);
  });

  it('attachElapsedToSessionTelemetry updates elapsed fields without changing fingerprint', () => {
    const source = createTelemetrySource({ elapsedSec: 0 });
    const base = buildActiveSessionTelemetry(source);
    const withElapsed = attachElapsedToSessionTelemetry(base, 120);

    expect(withElapsed.fingerprint).toBe(base.fingerprint);
    expect(withElapsed.elapsed_sec).toBe(120);
    expect(withElapsed.performance_summary.elapsed_sec).toBe(120);
    expect(base.elapsed_sec).toBe(0);
    expect(base.performance_summary.elapsed_sec).toBe(0);
  });

  it('fireActiveSessionCoachSentinel sends telemetry metadata once per session', async () => {
    const sendMessage = vi.fn(async () => ({
      id: 'msg-1',
    })) as FireActiveSessionCoachSentinelDeps['sendMessage'];
    const lastSentSessionIdRef = { current: null as string | null };
    const source = createTelemetrySource({ elapsedSec: 0 });
    const performanceTelemetrySnapshot = buildActiveSessionTelemetry(source);

    const baseDeps = {
      sendMessage,
      displayText: WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
      workoutTitle: 'Test Workout',
      sessionId: TEST_SESSION_ID,
      classInstanceId: null,
      workoutContext: { exercises: [] },
      lastSentSessionIdRef,
    };

    const sentFirst = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      performanceTelemetrySnapshot,
      elapsedSec: 90,
    });
    expect(sentFirst).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const firstMetadata = (sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[3]
      ?.metadata as Record<string, unknown>;
    expect(firstMetadata.session_telemetry).toBeDefined();
    expect(lastSentSessionIdRef.current).toBe(TEST_SESSION_ID);
    expect((firstMetadata.session_telemetry as Record<string, unknown>).elapsed_sec).toBe(90);

    const sentDuplicate = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      performanceTelemetrySnapshot,
      elapsedSec: 120,
    });
    expect(sentDuplicate).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const editedSource = createTelemetrySource({
      draftLogs: createEditedDraftLogs(),
      elapsedSec: 0,
    });
    const editedSnapshot = buildActiveSessionTelemetry(editedSource);
    const sentAfterEdit = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      performanceTelemetrySnapshot: editedSnapshot,
      elapsedSec: 90,
    });
    expect(sentAfterEdit).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('fireActiveSessionCoachSentinel sends again for a new session id', async () => {
    const sendMessage = vi.fn(async () => ({
      id: 'msg-1',
    })) as FireActiveSessionCoachSentinelDeps['sendMessage'];
    const lastSentSessionIdRef = { current: null as string | null };
    const source = createTelemetrySource({ elapsedSec: 0 });
    const performanceTelemetrySnapshot = buildActiveSessionTelemetry(source);

    const baseDeps = {
      sendMessage,
      displayText: WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
      workoutTitle: 'Test Workout',
      sessionId: TEST_SESSION_ID,
      classInstanceId: null,
      workoutContext: { exercises: [] },
      lastSentSessionIdRef,
    };

    const sentFirst = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      performanceTelemetrySnapshot,
      elapsedSec: 0,
    });
    expect(sentFirst).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const sentNewSession = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      sessionId: '00000000-0000-4000-8000-000000000999',
      performanceTelemetrySnapshot,
      elapsedSec: 0,
    });
    expect(sentNewSession).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('fireActiveSessionCoachSentinel sends once per session regardless of readiness changes', async () => {
    const sendMessage = vi.fn(async () => ({
      id: 'msg-1',
    })) as FireActiveSessionCoachSentinelDeps['sendMessage'];
    const lastSentSessionIdRef = { current: null as string | null };
    const source = createTelemetrySource({ elapsedSec: 0 });
    const performanceTelemetrySnapshot = buildActiveSessionTelemetry(source);
    const readinessA = buildSessionReadinessContext({
      readiness: 6,
      sleepQuality: 8,
      soreness: ['Back'],
    });
    const readinessB = {
      ...readinessA,
      captured_at: '2026-05-28T11:00:00.000Z',
    };

    const baseDeps = {
      sendMessage,
      displayText: WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
      workoutTitle: 'Test Workout',
      sessionId: TEST_SESSION_ID,
      classInstanceId: null,
      workoutContext: { exercises: [] },
      lastSentSessionIdRef,
    };

    const sentFirst = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      performanceTelemetrySnapshot,
      elapsedSec: 0,
      sessionReadinessContext: readinessA,
    });
    expect(sentFirst).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const sentDuplicate = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      performanceTelemetrySnapshot,
      elapsedSec: 0,
      sessionReadinessContext: readinessA,
    });
    expect(sentDuplicate).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const sentNewReadiness = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      performanceTelemetrySnapshot,
      elapsedSec: 0,
      sessionReadinessContext: readinessB,
    });
    expect(sentNewReadiness).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('buildActiveSessionTelemetry reflects logged set counts', () => {
    const sourceMetadata = {
      exercises: [{ name: 'Back Squat', sets: 1, reps: 10, weight: 100 }],
    };
    const sessionVm = buildWorkoutSessionViewModel(sourceMetadata);
    const source = createTelemetrySource({
      sessionVm,
      draftLogs: createSampleDraftLogs(),
    });
    const snapshot = buildActiveSessionTelemetry(source);
    expect(snapshot.performance_summary.total_sets_logged).toBe(1);
    expect(snapshot.live_set_counts).toEqual([1]);
  });
});
