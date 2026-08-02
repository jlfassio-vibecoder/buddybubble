'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { WorkspaceCategory } from '@/types/database';

export const BB_CATEGORY_THEME_OVERRIDE_KEY = 'bb_category_theme_override';

const BB_CATEGORY_THEME_OVERRIDE_EVENT = 'bb:category-theme-override';

export type CategoryThemeOverride = 'auto' | WorkspaceCategory;

function isCategoryThemeOverride(val: string): val is CategoryThemeOverride {
  return (
    val === 'auto' ||
    val === 'business' ||
    val === 'kids' ||
    val === 'class' ||
    val === 'community' ||
    val === 'fitness'
  );
}

function readStoredOverride(): CategoryThemeOverride {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = localStorage.getItem(BB_CATEGORY_THEME_OVERRIDE_KEY);
    if (raw && isCategoryThemeOverride(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'auto';
}

function subscribeOverride(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === BB_CATEGORY_THEME_OVERRIDE_KEY || e.key === null) onStoreChange();
  };
  const onCustom = () => {
    onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(BB_CATEGORY_THEME_OVERRIDE_EVENT, onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(BB_CATEGORY_THEME_OVERRIDE_EVENT, onCustom);
  };
}

/**
 * Resolves **paint** category for ThemeScope / portals when an optional user override is set.
 * Product behavior (labels, fitness gates) must use DB `category_type`, not this result.
 */
export function resolveEffectiveCategory(
  override: CategoryThemeOverride,
  workspaceCategory: WorkspaceCategory | string | null | undefined,
): WorkspaceCategory {
  if (override !== 'auto') return override;
  const c = String(workspaceCategory ?? 'business').toLowerCase();
  if (c === 'business' || c === 'kids' || c === 'class' || c === 'community' || c === 'fitness') {
    return c;
  }
  return 'business';
}

/**
 * Persists BuddyBubble **category palette** preference (not light/dark — that remains `next-themes`).
 * Reads `localStorage` synchronously on the client via `useSyncExternalStore` so the first
 * paint does not flash the workspace palette and then snap to a stored override.
 * Multiple hook instances stay in sync via a custom event + `storage` (other tabs).
 */
export function useThemeOverride(): {
  categoryOverride: CategoryThemeOverride;
  setCategoryOverride: (value: CategoryThemeOverride) => void;
  /** False during SSR / before client snapshot; true once reading from the browser. */
  mounted: boolean;
} {
  const categoryOverride = useSyncExternalStore(
    subscribeOverride,
    readStoredOverride,
    () => 'auto' as CategoryThemeOverride,
  );
  const mounted = useSyncExternalStore(
    subscribeOverride,
    () => true,
    () => false,
  );

  const setCategoryOverride = useCallback((value: CategoryThemeOverride) => {
    try {
      if (value === 'auto') {
        localStorage.removeItem(BB_CATEGORY_THEME_OVERRIDE_KEY);
      } else {
        localStorage.setItem(BB_CATEGORY_THEME_OVERRIDE_KEY, value);
      }
      window.dispatchEvent(new Event(BB_CATEGORY_THEME_OVERRIDE_EVENT));
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  return { categoryOverride, setCategoryOverride, mounted };
}
