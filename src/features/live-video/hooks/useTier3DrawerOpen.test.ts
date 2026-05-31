import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTier3DrawerOpen } from './useTier3DrawerOpen';

type HookProps = { selectionKey: string | null; selectionActive: boolean };

describe('useTier3DrawerOpen', () => {
  it('auto-opens when selection becomes active (T3-SELECTION-AUTO-OPEN)', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useTier3DrawerOpen>, HookProps>(
      (props) => useTier3DrawerOpen(props),
      {
        initialProps: { selectionKey: null, selectionActive: false },
      },
    );

    expect(result.current.open).toBe(false);

    rerender({ selectionKey: 'deck-1', selectionActive: true });
    expect(result.current.open).toBe(true);
  });

  it('allows manual dismiss without clearing selection', () => {
    const { result } = renderHook(() =>
      useTier3DrawerOpen({ selectionKey: 'deck-1', selectionActive: true }),
    );

    expect(result.current.open).toBe(true);

    act(() => {
      result.current.onOpenChange(false);
    });

    expect(result.current.open).toBe(false);
  });

  it('re-opens when selection key changes after dismiss', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useTier3DrawerOpen>, HookProps>(
      (props) => useTier3DrawerOpen(props),
      {
        initialProps: { selectionKey: 'deck-1', selectionActive: true },
      },
    );

    act(() => {
      result.current.onOpenChange(false);
    });
    expect(result.current.open).toBe(false);

    rerender({ selectionKey: 'deck-2', selectionActive: true });
    expect(result.current.open).toBe(true);
  });

  it('closes when selection clears', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useTier3DrawerOpen>, HookProps>(
      (props) => useTier3DrawerOpen(props),
      {
        initialProps: { selectionKey: 'deck-1', selectionActive: true },
      },
    );

    expect(result.current.open).toBe(true);

    rerender({ selectionKey: null, selectionActive: false });
    expect(result.current.open).toBe(false);
  });
});
