import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkoutIntakeWizardState } from '@/components/modals/task-modal/hooks/useWorkoutIntakeWizardState';

describe('useWorkoutIntakeWizardState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('C2: keeps wizard values when sessionKey stays on the same create:* key across rerenders', () => {
    const { result, rerender } = renderHook(
      ({ sessionKey }: { sessionKey: string }) => useWorkoutIntakeWizardState(sessionKey),
      { initialProps: { sessionKey: 'create:abc' } },
    );

    act(() => {
      result.current.setReadiness(8);
    });
    expect(result.current.readiness).toBe(8);

    rerender({ sessionKey: 'create:abc' });
    expect(result.current.readiness).toBe(8);
  });

  it('C2: resets wizard when sessionKey transitions existing:A -> existing:B', () => {
    const { result, rerender } = renderHook(
      ({ sessionKey }: { sessionKey: string }) => useWorkoutIntakeWizardState(sessionKey),
      { initialProps: { sessionKey: 'existing:a' } },
    );

    act(() => {
      result.current.setReadiness(9);
    });
    expect(result.current.readiness).toBe(9);

    rerender({ sessionKey: 'existing:b' });
    expect(result.current.readiness).toBe(5);
  });

  it('C4: skips stale agent field when user touched later; still applies untouched fields in same patch', () => {
    const { result } = renderHook(() => useWorkoutIntakeWizardState('existing:t1'));

    vi.setSystemTime(new Date('2026-01-15T12:00:02.000Z'));
    act(() => {
      result.current.setReadiness(8);
    });

    act(() => {
      result.current.applyTaskModalIntakePatchFromMessage({
        messageId: 'm1',
        messageCreatedAtMs: new Date('2026-01-15T12:00:01.000Z').getTime(),
        patch: { readiness: 3, sleep_quality: 4 },
      });
    });

    expect(result.current.readiness).toBe(8);
    expect(result.current.sleepQuality).toBe(4);
  });

  it('C4: applies agent patch when message is newer than user touch', () => {
    const { result } = renderHook(() => useWorkoutIntakeWizardState('existing:t1'));

    vi.setSystemTime(new Date('2026-01-15T12:00:02.000Z'));
    act(() => {
      result.current.setReadiness(8);
    });

    act(() => {
      result.current.applyTaskModalIntakePatchFromMessage({
        messageId: 'm2',
        messageCreatedAtMs: new Date('2026-01-15T12:00:03.000Z').getTime(),
        patch: { readiness: 2 },
      });
    });

    expect(result.current.readiness).toBe(2);
  });

  it('emits telemetry on skip and apply', () => {
    const onPatchFieldSkipped = vi.fn();
    const onPatchFieldApplied = vi.fn();

    const { result } = renderHook(() =>
      useWorkoutIntakeWizardState('existing:t1', {
        onPatchFieldSkipped,
        onPatchFieldApplied,
      }),
    );

    vi.setSystemTime(new Date('2026-01-15T12:00:02.000Z'));
    act(() => {
      result.current.setReadiness(8);
    });

    act(() => {
      result.current.applyTaskModalIntakePatchFromMessage({
        messageId: 'm-old',
        messageCreatedAtMs: new Date('2026-01-15T12:00:01.000Z').getTime(),
        patch: { readiness: 1, sleep_quality: 9 },
      });
    });

    expect(onPatchFieldSkipped).toHaveBeenCalledWith('readiness', 'stale_vs_user', 'm-old');
    expect(onPatchFieldApplied).toHaveBeenCalledWith('sleep_quality', 'm-old');
  });
});
