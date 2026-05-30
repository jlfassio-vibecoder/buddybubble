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

  it('preflight mode ignores duration and phase intent patches', () => {
    const { result } = renderHook(() =>
      useWorkoutIntakeWizardState('existing:t1', {}, { mode: 'preflight' }),
    );

    act(() => {
      result.current.setDurationMinutes(30);
      result.current.setPhaseIntent('aggressive_overload');
    });

    act(() => {
      result.current.applyTaskModalIntakePatchFromMessage({
        messageId: 'm-preflight',
        messageCreatedAtMs: Date.now(),
        patch: {
          duration_minutes: 60,
          phase_intent: 'technical_baseline',
          sleep_quality: 6,
        },
      });
    });

    expect(result.current.durationMinutes).toBe(30);
    expect(result.current.phaseIntent).toBe('aggressive_overload');
    expect(result.current.sleepQuality).toBe(6);
  });

  it('buildPreflightPayload omits duration and intensity', () => {
    const { result } = renderHook(() =>
      useWorkoutIntakeWizardState('existing:t1', {}, { mode: 'preflight' }),
    );

    act(() => {
      result.current.setReadiness(7);
      result.current.setSleepQuality(8);
      result.current.toggleSoreness('Legs');
    });

    expect(result.current.buildPreflightPayload()).toEqual({
      readiness: 7,
      sleepQuality: 8,
      soreness: ['Legs'],
    });
  });

  it('preflight mode clamps wizard step to 2', () => {
    const { result } = renderHook(() =>
      useWorkoutIntakeWizardState('existing:t1', {}, { mode: 'preflight' }),
    );

    act(() => {
      result.current.setStep(3);
    });

    expect(result.current.step).toBe(2);
    expect(result.current.maxStep).toBe(2);
    expect(result.current.mode).toBe('preflight');
  });

  it('generation mode uses maxStep 2 and buildWizardPayload emits macro fields', () => {
    const { result } = renderHook(() =>
      useWorkoutIntakeWizardState('existing:t1', {}, { mode: 'generation' }),
    );

    expect(result.current.maxStep).toBe(2);

    act(() => {
      result.current.setDurationMinutes(30);
      result.current.setPhaseIntent('aggressive_overload');
      result.current.setProgressionTrend('Hitting a Plateau');
      result.current.setAnchorLiftName('Back Squat');
      result.current.setAnchorLiftWeight(225);
      result.current.setAnchorLiftReps(5);
      result.current.setTemporaryLimitations('Left shoulder tweak');
    });

    expect(result.current.buildWizardPayload()).toEqual({
      durationMinutes: 30,
      phaseIntent: 'aggressive_overload',
      progressionTrend: 'Hitting a Plateau',
      anchorLift: { name: 'Back Squat', weight: 225, reps: 5 },
      temporaryLimitations: 'Left shoulder tweak',
    });
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
