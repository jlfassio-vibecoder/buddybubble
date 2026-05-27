import { describe, expect, it } from 'vitest';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildPlayerInitialLogs } from '@/lib/workout-factory/resolve-player-log-row-count';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import {
  SESSION_TELEMETRY_SCHEMA_VERSION,
  buildSessionTelemetrySnapshot,
  computeSessionTelemetryFingerprint,
  type BuildSessionTelemetryContext,
} from './session-telemetry';

const CAPTURED_AT = '2026-05-26T12:00:00.000Z';
const STARTED_AT = '2026-05-26T11:30:00.000Z';

function baseContext(
  overrides: Partial<BuildSessionTelemetryContext> = {},
): BuildSessionTelemetryContext {
  const source = {
    exercises: [
      { name: 'Back Squat', sets: 3, reps: 8, weight: 135 },
      { name: 'Bench Press', sets: 3, reps: 10, weight: 95 },
    ],
  };
  const sessionVm = buildWorkoutSessionViewModel(source as Json);
  const draftLogs = buildPlayerInitialLogs(sessionVm.flatExercises, sessionVm.blocks);

  return {
    sessionId: 'session-001',
    sourceTaskId: 'source-task-001',
    logTaskId: null,
    draftLogs,
    ghostLogs: [],
    elapsedSec: 0,
    startedAt: STARTED_AT,
    intervalRowSnapshots: {},
    sessionVm,
    ...overrides,
  };
}

function snapshotFor(context: BuildSessionTelemetryContext, capturedAt = CAPTURED_AT) {
  return buildSessionTelemetrySnapshot({ context, capturedAt });
}

describe('buildSessionTelemetrySnapshot', () => {
  it('builds an empty grid with all sets not_started and stable fingerprint', () => {
    const snap = snapshotFor(baseContext());

    expect(snap.schema_version).toBe(SESSION_TELEMETRY_SCHEMA_VERSION);
    expect(snap.captured_at).toBe(CAPTURED_AT);
    expect(snap.performance_summary.total_sets_completed).toBe(0);
    expect(snap.performance_summary.skipped_exercise_indices).toEqual([0, 1]);
    expect(snap.exercise_deltas[0]?.sets.every((s) => s.status === 'skipped')).toBe(true);
    expect(snap.set_logs.length).toBeGreaterThan(0);
    expect(snap.set_logs.every((row) => !row.done)).toBe(true);
    expect(snap.live_set_counts).toEqual([3, 3]);
    expect(snap.fingerprint).toMatch(/^[0-9a-f]{8}$/);

    const snapAgain = snapshotFor(baseContext(), '2026-05-26T13:00:00.000Z');
    expect(snapAgain.fingerprint).toBe(snap.fingerprint);
  });

  it('marks partial sets when values are entered but not done', () => {
    const context = baseContext();
    const draftLogs: SetDraft[][] = [
      [{ weight: '140', reps: '', rpe: '', done: false }],
      context.draftLogs[1] ?? [],
    ];
    const snap = snapshotFor({ ...context, draftLogs });

    expect(snap.exercise_deltas[0]?.sets[0]?.status).toBe('partial');
    expect(snap.exercise_deltas[0]?.completed_set_count).toBe(0);
    expect(snap.performance_summary.total_sets_completed).toBe(0);
  });

  it('records done sets and planned vs actual rep deltas', () => {
    const context = baseContext();
    const draftLogs: SetDraft[][] = [
      [
        { weight: '135', reps: '6', rpe: '8', done: true },
        { weight: '', reps: '', rpe: '', done: false },
        { weight: '', reps: '', rpe: '', done: false },
      ],
      context.draftLogs[1] ?? [],
    ];
    const snap = snapshotFor({ ...context, draftLogs, elapsedSec: 900 });

    const firstSet = snap.exercise_deltas[0]?.sets[0];
    expect(firstSet?.status).toBe('done');
    expect(firstSet?.planned?.reps).toBe('8');
    expect(firstSet?.actual.reps).toBe('6');
    expect(snap.performance_summary.total_sets_completed).toBe(1);
    expect(snap.performance_summary.total_volume_kg).toBe(810);
    expect(snap.performance_summary.skipped_exercise_indices).toEqual([1]);
  });

  it('identifies skipped exercises with no completed sets', () => {
    const context = baseContext();
    const draftLogs: SetDraft[][] = [
      [{ weight: '135', reps: '8', rpe: '7', done: true }],
      [
        { weight: '', reps: '', rpe: '', done: false },
        { weight: '', reps: '', rpe: '', done: false },
        { weight: '', reps: '', rpe: '', done: false },
      ],
    ];
    const snap = snapshotFor({ ...context, draftLogs });

    expect(snap.performance_summary.skipped_exercise_indices).toEqual([1]);
    expect(snap.exercise_deltas[1]?.sets.every((s) => s.status === 'skipped')).toBe(true);
  });

  it('extracts interval performance from intervalRowSnapshots', () => {
    const tabataMeta = richMetadataWithBlockFormat('tabata');
    const sessionVm = buildWorkoutSessionViewModel(tabataMeta as Json);
    const draftLogs = buildPlayerInitialLogs(sessionVm.flatExercises, sessionVm.blocks);
    const tabataBlock = sessionVm.blocks.find((b) => b.blockFormat === 'tabata');
    expect(tabataBlock).toBeTruthy();

    const snap = snapshotFor({
      sessionId: 'session-tabata',
      sourceTaskId: 'source-tabata',
      logTaskId: 'log-tabata',
      draftLogs,
      ghostLogs: [],
      elapsedSec: 420,
      startedAt: STARTED_AT,
      intervalRowSnapshots: {
        [tabataBlock!.id]: { roundIndex: 5, activeSetPhase: 'work' },
      },
      sessionVm,
    });

    expect(snap.interval_performance).toHaveLength(1);
    expect(snap.interval_performance[0]).toMatchObject({
      block_id: tabataBlock!.id,
      format: 'tabata',
      rounds_completed: 6,
      rounds_target: 8,
      last_phase: 'work',
    });
    expect(snap.interval_performance[0]?.elapsed_in_block_sec).toBeGreaterThan(0);
  });

  it('extracts AMRAP interval performance with elapsed block time from snapshot', () => {
    const amrapMeta = richMetadataWithBlockFormat('amrap');
    const sessionVm = buildWorkoutSessionViewModel(amrapMeta as Json);
    const draftLogs = buildPlayerInitialLogs(sessionVm.flatExercises, sessionVm.blocks);
    const amrapBlock = sessionVm.blocks.find((b) => b.blockFormat === 'amrap');
    expect(amrapBlock).toBeTruthy();

    const snap = snapshotFor({
      sessionId: 'session-amrap',
      sourceTaskId: 'source-amrap',
      logTaskId: 'log-amrap',
      draftLogs,
      ghostLogs: [],
      elapsedSec: 2040,
      startedAt: STARTED_AT,
      intervalRowSnapshots: {
        [amrapBlock!.id]: {
          roundIndex: 3,
          activeSetPhase: 'work',
          elapsedInBlockSec: 600,
        },
      },
      sessionVm,
    });

    expect(snap.interval_performance).toHaveLength(1);
    expect(snap.interval_performance[0]).toMatchObject({
      block_id: amrapBlock!.id,
      format: 'amrap',
      rounds_completed: 3,
      rounds_target: null,
      last_phase: 'work',
      elapsed_in_block_sec: 600,
    });
  });

  it('changes fingerprint when a done rep count changes but stays stable otherwise', () => {
    const context = baseContext();
    const draftA: SetDraft[][] = [
      [{ weight: '135', reps: '8', rpe: '8', done: true }],
      context.draftLogs[1] ?? [],
    ];
    const draftB: SetDraft[][] = [
      [{ weight: '135', reps: '7', rpe: '8', done: true }],
      context.draftLogs[1] ?? [],
    ];

    const snapA = snapshotFor({ ...context, draftLogs: draftA, elapsedSec: 100 });
    const snapB = snapshotFor({ ...context, draftLogs: draftB, elapsedSec: 100 });
    const snapAAgain = snapshotFor(
      { ...context, draftLogs: draftA, elapsedSec: 100 },
      '2026-05-26T14:00:00.000Z',
    );

    expect(snapA.fingerprint).not.toBe(snapB.fingerprint);
    expect(snapAAgain.fingerprint).toBe(snapA.fingerprint);
  });
});

describe('computeSessionTelemetryFingerprint', () => {
  it('hashes only performance state (not elapsed_sec)', () => {
    const input = {
      schema_version: SESSION_TELEMETRY_SCHEMA_VERSION,
      session_id: 's1',
      workout_log_task_id: 'log-1',
      set_logs: [
        {
          exercise_index: 0,
          set_index: 0,
          weight: '100',
          reps: '5',
          rpe: null,
          done: true,
        },
      ],
      interval_performance: [],
      skipped_exercise_indices: [],
      live_set_counts: [1],
    } as const;

    expect(computeSessionTelemetryFingerprint(input)).toBe(
      computeSessionTelemetryFingerprint({ ...input }),
    );
  });

  it('ignores elapsed_sec differences in snapshot fingerprint', () => {
    const ctx = baseContext();
    const slow = snapshotFor({ ...ctx, elapsedSec: 30 });
    const fast = snapshotFor({ ...ctx, elapsedSec: 300 });
    expect(slow.fingerprint).toBe(fast.fingerprint);
    expect(slow.elapsed_sec).toBe(30);
    expect(fast.elapsed_sec).toBe(300);
  });
});
