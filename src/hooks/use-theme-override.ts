'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { categoryThemeOverrideStorageKey } from '@/lib/layout-collapse-keys';
import type { WorkspaceCategory } from '@/types/database';

/** Retired global key — read once to migrate into the current workspace, then removed. */
const LEGACY_GLOBAL_KEY = 'bb_category_theme_override';

const BB_CATEGORY_THEME_OVERRIDE_EVENT = 'bb:category-theme-override';

export type CategoryThemeOverride = 'auto' | WorkspaceCategory;

type OverrideChangeDetail = { workspaceId: string };

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

function notifyOverrideChange(workspaceId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<OverrideChangeDetail>(BB_CATEGORY_THEME_OVERRIDE_EVENT, {
      detail: { workspaceId },
    }),
  );
}

/**
 * Read paint override for one BuddyBubble. Migrates legacy global key into this
 * workspace once (other workspaces stay `auto`), then deletes the global key.
 */
export function readCategoryThemeOverride(workspaceId: string): CategoryThemeOverride {
  if (!workspaceId.trim() || typeof window === 'undefined') return 'auto';
  const key = categoryThemeOverrideStorageKey(workspaceId);
  try {
    const raw = localStorage.getItem(key);
    if (raw && isCategoryThemeOverride(raw)) return raw;

    const legacy = localStorage.getItem(LEGACY_GLOBAL_KEY);
    if (legacy && isCategoryThemeOverride(legacy)) {
      localStorage.removeItem(LEGACY_GLOBAL_KEY);
      if (legacy === 'auto') return 'auto';
      localStorage.setItem(key, legacy);
      return legacy;
    }
  } catch {
    /* ignore quota / private mode */
  }
  return 'auto';
}

/** Persist paint override for one BuddyBubble. `auto` removes that workspace’s key only. */
export function writeCategoryThemeOverride(
  workspaceId: string,
  value: CategoryThemeOverride,
): void {
  if (!workspaceId.trim() || typeof window === 'undefined') return;
  const key = categoryThemeOverrideStorageKey(workspaceId);
  try {
    if (value === 'auto') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
    // Ensure retired global key cannot re-apply on a later read.
    localStorage.removeItem(LEGACY_GLOBAL_KEY);
    notifyOverrideChange(workspaceId);
  } catch {
    /* ignore quota / private mode */
  }
}

function subscribeOverride(workspaceId: string, onStoreChange: () => void) {
  if (typeof window === 'undefined' || !workspaceId.trim()) return () => {};
  const key = categoryThemeOverrideStorageKey(workspaceId);
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) onStoreChange();
  };
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<OverrideChangeDetail>).detail;
    if (detail?.workspaceId === workspaceId) onStoreChange();
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
 * Persists BuddyBubble **category palette** preference for one socialspace
 * (not light/dark — that remains `next-themes`).
 * Reads `localStorage` synchronously on the client via `useSyncExternalStore`.
 */
export function useThemeOverride(workspaceId: string): {
  categoryOverride: CategoryThemeOverride;
  setCategoryOverride: (value: CategoryThemeOverride) => void;
  /** False during SSR / before client snapshot; true once reading from the browser. */
  mounted: boolean;
} {
  const id = workspaceId.trim();
  const categoryOverride = useSyncExternalStore(
    (onStoreChange) => subscribeOverride(id, onStoreChange),
    () => readCategoryThemeOverride(id),
    () => 'auto' as CategoryThemeOverride,
  );
  const mounted = useSyncExternalStore(
    (onStoreChange) => subscribeOverride(id, onStoreChange),
    () => true,
    () => false,
  );

  const setCategoryOverride = useCallback(
    (value: CategoryThemeOverride) => {
      writeCategoryThemeOverride(id, value);
    },
    [id],
  );

  return { categoryOverride, setCategoryOverride, mounted };
}
