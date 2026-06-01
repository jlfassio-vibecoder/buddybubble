import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  SESSION_READINESS_CONTEXT_VERSION,
  buildSessionReadinessContext,
  mergeSessionReadinessIntoMetadata,
  readSessionReadinessContext,
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
});
