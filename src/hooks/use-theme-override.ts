'use client';

import { useCallback, useEffect, useState } from 'react';
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

/**
 * Resolves workspace category for ThemeScope / Kanban labels when an optional user override is set.
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
 * SSR-safe: always `'auto'` until after mount, then reads `localStorage`.
 * Multiple hook instances stay in sync via a custom event + `storage` (other tabs).
 */
export function useThemeOverride(): {
  categoryOverride: CategoryThemeOverride;
  setCategoryOverride: (value: CategoryThemeOverride) => void;
  /** False until client has hydrated from `localStorage` */
  mounted: boolean;
} {
  const [mounted, setMounted] = useState(false);
  const [categoryOverride, setCategoryOverrideState] = useState<CategoryThemeOverride>('auto');

  const applyFromStorage = useCallback(() => {
    setCategoryOverrideState(readStoredOverride());
  }, []);

  useEffect(() => {
    setMounted(true);
    applyFromStorage();
  }, [applyFromStorage]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== BB_CATEGORY_THEME_OVERRIDE_KEY) return;
      applyFromStorage();
    };
    const onCustom = () => {
      applyFromStorage();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(BB_CATEGORY_THEME_OVERRIDE_EVENT, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(BB_CATEGORY_THEME_OVERRIDE_EVENT, onCustom);
    };
  }, [applyFromStorage]);

  const setCategoryOverride = useCallback((value: CategoryThemeOverride) => {
    setCategoryOverrideState(value);
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
