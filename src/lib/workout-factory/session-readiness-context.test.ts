import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  SESSION_READINESS_CONTEXT_VERSION,
  buildSessionReadinessContext,
  mergeSessionReadinessIntoMetadata,
  mergeSessionReadinessOntoFormSavePayload,
  readActiveSessionIdFromMetadata,
  readSessionReadinessContext,
  readSessionReadinessContextFromSessionThread,
} from './session-readiness-context';

describe('session-readiness-context', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T14:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buildSessionReadinessContext clamps readiness and sleep, normalizes soreness', () => {
    const ctx = buildSessionReadinessContext({
      readiness: 12,
      sleepQuality: 0,
      soreness: ['Legs', 'None', 'Legs', 'Invalid'],
    });

    expect(ctx).toEqual({
      v: SESSION_READINESS_CONTEXT_VERSION,
      captured_at: '2026-05-28T14:00:00.000Z',
      readiness: 10,
      sleep_quality: 1,
      soreness: ['Legs'],
      source: 'task_modal_preflight',
    });
  });

  it('defaults soreness to None when empty after filtering', () => {
    const ctx = buildSessionReadinessContext({
      readiness: 5,
      sleepQuality: 7,
      soreness: ['bogus'],
    });
    expect(ctx.soreness).toEqual(['None']);
  });

  it('readSessionReadinessContext parses valid metadata', () => {
    const ctx = buildSessionReadinessContext({
      readiness: 6,
      sleepQuality: 8,
      soreness: ['Back'],
    });
    const metadata = mergeSessionReadinessIntoMetadata({}, ctx);
    expect(readSessionReadinessContext(metadata)).toEqual(ctx);
  });

  it('readSessionReadinessContext returns null for invalid shapes', () => {
    expect(readSessionReadinessContext(null)).toBeNull();
    expect(readSessionReadinessContext({ session_readiness_context: { v: 2 } })).toBeNull();
    expect(
      readSessionReadinessContext({
        session_readiness_context: {
          v: 1,
          captured_at: '',
          readiness: 5,
          sleep_quality: 5,
          soreness: ['None'],
          source: 'task_modal_preflight',
        },
      }),
    ).toBeNull();
    expect(
      readSessionReadinessContext({
        session_readiness_context: {
          v: 1,
          captured_at: '2026-01-01T00:00:00.000Z',
          readiness: 'five',
          sleep_quality: 5,
          soreness: ['None'],
          source: 'task_modal_preflight',
        },
      }),
    ).toBeNull();
  });

  it('mergeSessionReadinessIntoMetadata preserves other metadata keys', () => {
    const ctx = buildSessionReadinessContext({
      readiness: 4,
      sleepQuality: 6,
      soreness: ['None'],
    });
    const merged = mergeSessionReadinessIntoMetadata({ foo: 'bar' }, ctx) as Record<
      string,
      unknown
    >;
    expect(merged.foo).toBe('bar');
    expect(merged.session_readiness_context).toEqual(ctx);
  });

  it('mergeSessionReadinessOntoFormSavePayload overlays readiness without dropping outline', () => {
    const ctx = buildSessionReadinessContext({
      readiness: 7,
      sleepQuality: 8,
      soreness: ['Legs'],
    });
    const form = {
      ai_workout_factory: { workout_set: { blocks: [{ name: 'Main' }] } },
      exercises: [{ name: 'Squat' }],
      duration_minutes: 45,
    };
    const override = mergeSessionReadinessIntoMetadata({ stale: true }, ctx);
    const merged = mergeSessionReadinessOntoFormSavePayload(form, override);
    expect(merged.ai_workout_factory).toEqual(form.ai_workout_factory);
    expect(merged.exercises).toEqual(form.exercises);
    expect(merged.duration_minutes).toBe(45);
    expect(merged.session_readiness_context).toEqual(ctx);
    expect(merged).not.toHaveProperty('stale');
  });

  it('mergeSessionReadinessOntoFormSavePayload leaves form unchanged when override lacks readiness', () => {
    const form = { ai_workout_factory: { v: 1 }, exercises: [] };
    const merged = mergeSessionReadinessOntoFormSavePayload(form, { foo: 1 });
    expect(merged).toEqual(form);
  });

  it('readActiveSessionIdFromMetadata reads top-level and workout_context sessionId', () => {
    expect(readActiveSessionIdFromMetadata({ sessionId: 'sess-a' })).toBe('sess-a');
    expect(
      readActiveSessionIdFromMetadata({
        workout_context: { sessionId: 'sess-b', surface: 'active_session' },
      }),
    ).toBe('sess-b');
    expect(readActiveSessionIdFromMetadata({})).toBeNull();
  });

  it('readSessionReadinessContextFromSessionThread ignores other sessions', () => {
    const ctxOld = buildSessionReadinessContext({
      readiness: 3,
      sleepQuality: 4,
      soreness: ['Legs'],
    });
    const ctxNew = buildSessionReadinessContext({
      readiness: 8,
      sleepQuality: 9,
      soreness: ['None'],
    });
    const messages = [
      {
        metadata: mergeSessionReadinessIntoMetadata({ sessionId: 'sess-old' }, ctxOld),
      },
      {
        metadata: { sessionId: 'sess-new' },
      },
      {
        metadata: mergeSessionReadinessIntoMetadata(
          { workout_context: { sessionId: 'sess-new' } },
          ctxNew,
        ),
      },
    ];
    expect(readSessionReadinessContextFromSessionThread(messages, 'sess-new')).toEqual(ctxNew);
    expect(readSessionReadinessContextFromSessionThread(messages, 'sess-missing')).toBeNull();
  });
});
