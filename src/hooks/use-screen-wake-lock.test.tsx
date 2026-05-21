import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useScreenWakeLock } from './use-screen-wake-lock';

describe('useScreenWakeLock', () => {
  const release = vi.fn(async () => {});
  const request = vi.fn(async () => ({
    release,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
      writable: true,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
      writable: true,
    });
  });

  it('reports unsupported when wakeLock missing', () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    const { result } = renderHook(() => useScreenWakeLock(true));
    expect(result.current.isSupported).toBe(false);
    expect(result.current.status).toBe('unsupported');
  });

  it('requests screen lock when requested', async () => {
    const { result } = renderHook(() => useScreenWakeLock(true));
    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen');
      expect(result.current.status).toBe('held');
    });
  });

  it('releases when requested becomes false', async () => {
    const { rerender } = renderHook(({ requested }) => useScreenWakeLock(requested), {
      initialProps: { requested: true },
    });
    await waitFor(() => expect(request).toHaveBeenCalled());
    rerender({ requested: false });
    await waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('re-requests on visibility visible when still requested', async () => {
    renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
      writable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    request.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
      writable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(request).toHaveBeenCalled());
  });

  it('releases on unmount', async () => {
    const { unmount } = renderHook(() => useScreenWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(release).toHaveBeenCalled());
  });
});
