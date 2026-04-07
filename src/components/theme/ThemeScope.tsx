'use client';

import { useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { getThemeVariables } from '@/lib/theme-engine/merge';
import type { WorkspaceCategory } from '@/types/database';

type Props = {
  children: ReactNode;
  /** Active BuddyBubble category; defaults to business if null/invalid. */
  category: WorkspaceCategory | string | null | undefined;
};

function subscribeToRootClass(callback: () => void) {
  const el = document.documentElement;
  const obs = new MutationObserver(callback);
  obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
}

function snapshotHtmlIsDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

/**
 * SSR has no access to `localStorage` or the injected theme class; we default to light.
 * Client reads the live `dark` class (next-themes + blocking script) so the first paint
 * matches the user’s mode without waiting for an extra mount gate (which caused a light flash).
 */
function serverSnapshotIsDark(): boolean {
  return false;
}

/**
 * Injects category + resolved light/dark CSS variables for descendants.
 * Uses `display: contents` so layout is unchanged.
 *
 * Light/dark follows the **`dark` class on `document.documentElement`**, same source
 * `next-themes` uses after its script runs, via `useSyncExternalStore` + `MutationObserver`.
 * The wrapper uses `suppressHydrationWarning` because the server snapshot is always light
 * while the client may already have `dark` before hydration.
 */
export function ThemeScope({ category, children }: Props) {
  const isDark = useSyncExternalStore(
    subscribeToRootClass,
    snapshotHtmlIsDark,
    serverSnapshotIsDark,
  );

  const style = useMemo(
    () => getThemeVariables(category, isDark) as CSSProperties,
    [category, isDark],
  );

  return (
    <div className="contents" style={style} suppressHydrationWarning>
      {children}
    </div>
  );
}
