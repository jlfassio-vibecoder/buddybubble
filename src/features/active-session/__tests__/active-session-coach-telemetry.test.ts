import { describe, expect, it } from 'vitest';
import {
  appendActiveSessionFollowUpCoachMetadata,
  buildActiveSessionSentinelMetadata,
} from '@/features/active-session/lib/active-session-coach-telemetry';
import type { SessionTelemetrySnapshot } from '@/lib/workout-factory/session-telemetry';

const readiness = {
  v: 1 as const,
  captured_at: '2026-05-28T10:00:00.000Z',
  readiness: 7,
  sleep_quality: 8,
  soreness: ['Legs'],
  source: 'task_modal_preflight' as const,
};

const emptyTelemetry = {
  v: 1,
  fingerprint: 'fp',
  captured_at: '2026-05-28T10:00:00.000Z',
  session_id: 'sess-1',
  source_task_id: 'task-1',
  log_task_id: null,
  elapsed_sec: 0,
  started_at: null,
  exercise_logs: [],
  interval_timers: [],
} as unknown as SessionTelemetrySnapshot;

describe('appendActiveSessionFollowUpCoachMetadata', () => {
  it('attaches active_session surface and readiness when present', () => {
    const base = {
      default_agent_slug: 'coach',
      workoutContext: { exercises: [] },
    };
    const meta = appendActiveSessionFollowUpCoachMetadata(base, {
      sessionId: 'sess-1',
      classInstanceId: null,
      sessionReadinessContext: readiness,
    });
    expect(meta.sessionId).toBe('sess-1');
    expect(meta.workout_context).toEqual({
      source: 'workout_player',
      surface: 'active_session',
      sessionId: 'sess-1',
      class_instance_id: null,
      isMemberView: true,
    });
    expect(meta.session_readiness_context).toEqual(readiness);
    expect(meta.workoutContext).toEqual({ exercises: [] });
  });

  it('omits readiness key when null but still sets surface', () => {
    const meta = appendActiveSessionFollowUpCoachMetadata(
      { workoutContext: { exercises: [] } },
      {
        sessionId: 'sess-2',
        classInstanceId: 'ci-1',
        sessionReadinessContext: null,
      },
    );
    expect(meta.workout_context).toMatchObject({
      surface: 'active_session',
      sessionId: 'sess-2',
      class_instance_id: 'ci-1',
    });
    expect(meta).not.toHaveProperty('session_readiness_context');
  });

  it('persists sleep_quality, readiness, and soreness on follow-up metadata', () => {
    const meta = appendActiveSessionFollowUpCoachMetadata(
      { workoutContext: { exercises: [] } },
      {
        sessionId: 'sess-3',
        classInstanceId: null,
        sessionReadinessContext: readiness,
      },
    );
    const ctx = meta.session_readiness_context as typeof readiness;
    expect(ctx.readiness).toBe(7);
    expect(ctx.sleep_quality).toBe(8);
    expect(ctx.soreness).toEqual(['Legs']);
  });
});

describe('buildActiveSessionSentinelMetadata surface fields', () => {
  it('shares the same workout_context.surface shape as follow-ups', () => {
    const sentinel = buildActiveSessionSentinelMetadata({
      workoutTitle: 'Leg Day',
      sessionId: 'sess-1',
      classInstanceId: null,
      workoutContext: { exercises: [] },
      sessionTelemetry: emptyTelemetry,
      sessionReadinessContext: readiness,
    }) as Record<string, unknown>;
    const followUp = appendActiveSessionFollowUpCoachMetadata(
      { workoutContext: { exercises: [] } },
      {
        sessionId: 'sess-1',
        classInstanceId: null,
        sessionReadinessContext: readiness,
      },
    );
    expect(sentinel.workout_context).toEqual(followUp.workout_context);
    expect(sentinel.session_readiness_context).toEqual(followUp.session_readiness_context);
  });
});
