import { describe, expect, it } from 'vitest';
import {
  ACTIVE_SESSION_SURFACE_VALUE,
  formatSessionTelemetryForPrompt,
  isActiveSessionSurfaceFromMetadata,
  parseSessionTelemetryFromMetadata,
  SESSION_TELEMETRY_HEADER,
  SESSION_TELEMETRY_INTERVAL_HEADER,
  SESSION_TELEMETRY_RAIL_MAX_BYTES,
  summarizeTelemetryDeltas,
  type SessionTelemetrySnapshotV1,
} from './session-telemetry-format';

function sampleSnapshot(
  overrides: Partial<SessionTelemetrySnapshotV1> = {},
): SessionTelemetrySnapshotV1 {
  return {
    schema_version: 1,
    session_id: 'session-001',
    source_task_id: 'source-task-001',
    fingerprint: 'cf17de55',
    elapsed_sec: 1080,
    performance_summary: {
      total_sets_planned: 6,
      total_sets_logged: 4,
      total_sets_completed: 4,
      total_volume_kg: 12450,
      skipped_exercise_indices: [],
      elapsed_sec: 1080,
    },
    live_set_counts: [2, 2, 0],
    exercise_deltas: [
      {
        exercise_index: 0,
        name: 'Back Squat',
        planned_set_count: 3,
        logged_set_count: 2,
        completed_set_count: 2,
        sets: [
          {
            set_index: 0,
            planned: { weight: '135', reps: '8', target_label: '135 x 8' },
            actual: { weight: '135', reps: '8', rpe: '7.5', done: true },
            status: 'done',
          },
          {
            set_index: 1,
            planned: { weight: '135', reps: '8', target_label: null },
            actual: { weight: '135', reps: '7', rpe: '8', done: true },
            status: 'done',
          },
          {
            set_index: 2,
            planned: { weight: '135', reps: '8', target_label: null },
            actual: { weight: '', reps: '', rpe: '', done: false },
            status: 'not_started',
          },
        ],
      },
      {
        exercise_index: 2,
        name: 'RDL',
        planned_set_count: 3,
        logged_set_count: 0,
        completed_set_count: 0,
        sets: [
          {
            set_index: 0,
            planned: { weight: '185', reps: '8', target_label: null },
            actual: { weight: '', reps: '', rpe: '', done: false },
            status: 'not_started',
          },
        ],
      },
    ],
    interval_performance: [
      {
        block_id: 'block-main-tabata',
        format: 'tabata',
        rounds_completed: 6,
        rounds_target: 8,
        last_phase: 'work',
        elapsed_in_block_sec: 240,
      },
    ],
    ...overrides,
  };
}

describe('parseSessionTelemetryFromMetadata', () => {
  it('parses valid session_telemetry from metadata', () => {
    const snap = sampleSnapshot();
    const parsed = parseSessionTelemetryFromMetadata({ session_telemetry: snap });
    expect(parsed?.fingerprint).toBe('cf17de55');
    expect(parsed?.exercise_deltas).toHaveLength(2);
  });

  it('rejects schema_version !== 1', () => {
    const snap = sampleSnapshot({ schema_version: 2 as 1 });
    expect(parseSessionTelemetryFromMetadata({ session_telemetry: snap })).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    expect(parseSessionTelemetryFromMetadata(null)).toBeNull();
    expect(
      parseSessionTelemetryFromMetadata({ session_telemetry: { schema_version: 1 } }),
    ).toBeNull();
  });
});

describe('isActiveSessionSurfaceFromMetadata', () => {
  it('detects nested workout_context.surface active_session', () => {
    expect(
      isActiveSessionSurfaceFromMetadata({
        workout_context: { surface: ACTIVE_SESSION_SURFACE_VALUE },
      }),
    ).toBe(true);
    expect(isActiveSessionSurfaceFromMetadata({ workout_context: { surface: 'other' } })).toBe(
      false,
    );
  });
});

describe('summarizeTelemetryDeltas', () => {
  it('formats multi-set exercise with planned vs actual lines', () => {
    const out = summarizeTelemetryDeltas(sampleSnapshot());
    expect(out).toContain(SESSION_TELEMETRY_HEADER);
    expect(out).toContain('global_session_time_elapsed=18m');
    expect(out).toContain('clock_scope=wall_time_since_session_start');
    expect(out).toContain('sets_completed=4/6');
    expect(out).toContain('Ex0 Back Squat | planned=3 logged=2 done=2');
    expect(out).toContain('s0: target 135 x 8 -> actual 135x8 rpe7.5 [done]');
    expect(out).toContain('s1: target 135x8 -> actual 135x7 rpe8 [done]');
    expect(out).toContain('s2: target 135x8 -> [not_started]');
    expect(out).toContain(SESSION_TELEMETRY_INTERVAL_HEADER);
    expect(out).toContain('block_id=block-main-tabata | format=tabata');
    expect(out).toContain('rounds_completed=6 | rounds_target=8');
    expect(out).toContain('running_block_clock_elapsed=4m0s');
    expect(out).toContain('clock_scope=block_local_NOT_global_session');
    expect(out).not.toContain('Ex2 RDL');
  });

  it('disambiguates global session clock from block interval clock', () => {
    const out = summarizeTelemetryDeltas(
      sampleSnapshot({
        elapsed_sec: 2040,
        performance_summary: {
          total_sets_planned: 6,
          total_sets_logged: 4,
          total_sets_completed: 4,
          total_volume_kg: 12450,
          skipped_exercise_indices: [],
          elapsed_sec: 2040,
        },
        interval_performance: [
          {
            block_id: 'block-amrap-main',
            format: 'amrap',
            rounds_completed: 3,
            rounds_target: null,
            last_phase: 'work',
            elapsed_in_block_sec: 600,
          },
        ],
      }),
    );
    expect(out).toContain('global_session_time_elapsed=34m');
    expect(out).toContain('clock_scope=wall_time_since_session_start');
    expect(out).toContain(SESSION_TELEMETRY_INTERVAL_HEADER);
    expect(out).toContain('running_block_clock_elapsed=10m0s');
    expect(out).toContain('clock_scope=block_local_NOT_global_session');
    expect(out).not.toMatch(/\belapsed=/);
    expect(out).not.toMatch(/\| 600s$/m);
  });

  it('respects byte cap and adds truncation footer', () => {
    const manyExercises: SessionTelemetrySnapshotV1['exercise_deltas'] = [];
    for (let i = 0; i < 40; i += 1) {
      manyExercises.push({
        exercise_index: i,
        name: `Exercise ${i}`,
        planned_set_count: 3,
        logged_set_count: 2,
        completed_set_count: 2,
        sets: [
          {
            set_index: 0,
            planned: { weight: '100', reps: '10', target_label: null },
            actual: { weight: '100', reps: '10', rpe: '8', done: true },
            status: 'done',
          },
        ],
      });
    }
    const out = summarizeTelemetryDeltas(
      sampleSnapshot({
        exercise_deltas: manyExercises,
        live_set_counts: manyExercises.map(() => 1),
      }),
      800,
    );
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(800);
    expect(out).toContain('...(truncated:');
  });
});

describe('formatSessionTelemetryForPrompt', () => {
  it('summarizes on rail and active session surfaces', () => {
    const snap = sampleSnapshot();
    const rail = formatSessionTelemetryForPrompt(snap, { rail: true });
    const active = formatSessionTelemetryForPrompt(snap, { activeSession: true });
    expect(rail).toContain('Ex0 Back Squat');
    expect(active).toContain('Ex0 Back Squat');
    expect(new TextEncoder().encode(rail).length).toBeLessThanOrEqual(
      SESSION_TELEMETRY_RAIL_MAX_BYTES,
    );
  });
});
