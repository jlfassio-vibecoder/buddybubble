import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  IDLE_TIMEOUT_MS,
  WARNING_COUNTDOWN_MS,
  overtimeTimeoutMs,
  useStudioFailsafe,
  type UseStudioFailsafeArgs,
} from './useStudioFailsafe';
import type { SoloStudioRecorderStatus } from './useSoloStudioRecorder';

describe('useStudioFailsafe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function baseProps(overrides: Partial<UseStudioFailsafeArgs> = {}): UseStudioFailsafeArgs {
    return {
      enabled: true,
      estimatedDurationMin: 15,
      recordingStatus: 'idle',
      onForceExit: vi.fn(),
      ...overrides,
    };
  }

  it('does nothing when disabled', () => {
    const onForceExit = vi.fn();
    const { result } = renderHook(() =>
      useStudioFailsafe(baseProps({ enabled: false, onForceExit })),
    );
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS + WARNING_COUNTDOWN_MS + 1000);
    });
    expect(result.current.showWarning).toBe(false);
    expect(onForceExit).not.toHaveBeenCalled();
  });

  it('fires idle warning after 5 minutes when status stays idle', () => {
    const { result } = renderHook(() => useStudioFailsafe(baseProps()));
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    });
    expect(result.current.showWarning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.warningReason).toBe('idle');
    expect(result.current.warningSecondsLeft).toBe(30);
  });

  it('clears idle timer when recording starts', () => {
    const { result, rerender } = renderHook(
      (props: UseStudioFailsafeArgs) => useStudioFailsafe(props),
      { initialProps: baseProps() },
    );

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000);
    });
    rerender(baseProps({ recordingStatus: 'recording' as SoloStudioRecorderStatus }));
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    });
    expect(result.current.showWarning).toBe(false);
    expect(result.current.warningReason).toBeNull();
  });

  it('fires overtime warning after estimated + 5 minutes', () => {
    const { result } = renderHook(() =>
      useStudioFailsafe(baseProps({ recordingStatus: 'recording' })),
    );
    const overtimeMs = overtimeTimeoutMs(15);
    act(() => {
      vi.advanceTimersByTime(overtimeMs - 1);
    });
    expect(result.current.showWarning).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.warningReason).toBe('overtime');
  });

  it('calls onForceExit once when warning countdown reaches 0', () => {
    const onForceExit = vi.fn();
    const { result } = renderHook(() => useStudioFailsafe(baseProps({ onForceExit })));

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    });
    expect(result.current.showWarning).toBe(true);

    act(() => {
      vi.advanceTimersByTime(WARNING_COUNTDOWN_MS + 500);
    });
    expect(onForceExit).toHaveBeenCalledTimes(1);
  });

  it('acknowledgeWarning dismisses and restarts idle timer', () => {
    const onForceExit = vi.fn();
    const { result } = renderHook(() => useStudioFailsafe(baseProps({ onForceExit })));

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    });
    expect(result.current.showWarning).toBe(true);

    act(() => {
      result.current.acknowledgeWarning();
    });
    expect(result.current.showWarning).toBe(false);
    expect(result.current.warningReason).toBeNull();

    act(() => {
      vi.advanceTimersByTime(WARNING_COUNTDOWN_MS + 1000);
    });
    expect(onForceExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.warningReason).toBe('idle');
  });

  it('does not restart overtime when recordingStatus changes', () => {
    const { result, rerender } = renderHook(
      (props: UseStudioFailsafeArgs) => useStudioFailsafe(props),
      { initialProps: baseProps({ recordingStatus: 'recording' }) },
    );
    const overtimeMs = overtimeTimeoutMs(15);

    act(() => {
      vi.advanceTimersByTime(overtimeMs - 5_000);
    });
    rerender(baseProps({ recordingStatus: 'uploading' as SoloStudioRecorderStatus }));
    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(result.current.showWarning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.warningReason).toBe('overtime');
  });

  it('swallows onForceExit rejections without throwing', async () => {
    const onForceExit = vi.fn().mockRejectedValue(new Error('leave failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useStudioFailsafe(baseProps({ onForceExit })));

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    });
    expect(result.current.showWarning).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(WARNING_COUNTDOWN_MS + 500);
      await Promise.resolve();
    });
    expect(onForceExit).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[useStudioFailsafe] onForceExit', 'leave failed');
  });

  it('clears timers on unmount without force exit', () => {
    const onForceExit = vi.fn();
    const { unmount } = renderHook(() => useStudioFailsafe(baseProps({ onForceExit })));
    unmount();
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS + WARNING_COUNTDOWN_MS + 1000);
    });
    expect(onForceExit).not.toHaveBeenCalled();
  });
});
