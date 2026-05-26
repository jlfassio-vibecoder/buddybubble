import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WORKOUT_COACH_SENTINEL_DISPLAY_TEXT } from '@/components/chat/WorkoutCoachRail';
import {
  MESSAGE_METADATA_SESSION_TELEMETRY_FINGERPRINT_KEY,
  MESSAGE_METADATA_SESSION_TELEMETRY_KEY,
} from '@/lib/agents/coach/coach-telemetry-bridge';
import { SESSION_TELEMETRY_SCHEMA_VERSION } from '@/lib/workout-factory/session-telemetry';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import {
  buildActiveSessionSentinelMetadata,
  buildActiveSessionTelemetry,
  fireActiveSessionCoachSentinel,
  shouldSkipSentinelForTelemetryFingerprint,
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

  it('shouldSkipSentinelForTelemetryFingerprint skips only exact fingerprint matches', () => {
    expect(shouldSkipSentinelForTelemetryFingerprint('abc123', null)).toBe(false);
    expect(shouldSkipSentinelForTelemetryFingerprint('abc123', 'def456')).toBe(false);
    expect(shouldSkipSentinelForTelemetryFingerprint('abc123', 'abc123')).toBe(true);
  });

  it('fireActiveSessionCoachSentinel sends telemetry metadata once per fingerprint', async () => {
    const sendMessage = vi.fn(async () => ({
      id: 'msg-1',
    })) as FireActiveSessionCoachSentinelDeps['sendMessage'];
    const lastSentFingerprintRef = { current: null as string | null };
    const source = createTelemetrySource();

    const baseDeps = {
      sendMessage,
      displayText: WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
      workoutTitle: 'Test Workout',
      sessionId: TEST_SESSION_ID,
      classInstanceId: null,
      workoutContext: { exercises: [] },
      lastSentFingerprintRef,
    };

    const sentFirst = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      telemetrySource: source,
    });
    expect(sentFirst).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const firstMetadata = (sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[3]
      ?.metadata as Record<string, unknown>;
    expect(firstMetadata.session_telemetry).toBeDefined();
    expect(firstMetadata.session_telemetry_fingerprint).toBe(lastSentFingerprintRef.current);

    const sentDuplicate = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      telemetrySource: source,
    });
    expect(sentDuplicate).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const editedSource = createTelemetrySource({ draftLogs: createEditedDraftLogs() });
    const sentAfterEdit = await fireActiveSessionCoachSentinel({
      ...baseDeps,
      telemetrySource: editedSource,
    });
    expect(sentAfterEdit).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    const secondMetadata = (sendMessage as ReturnType<typeof vi.fn>).mock.calls[1]?.[3]
      ?.metadata as Record<string, unknown>;
    expect(secondMetadata.session_telemetry_fingerprint).not.toBe(
      firstMetadata.session_telemetry_fingerprint,
    );
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
