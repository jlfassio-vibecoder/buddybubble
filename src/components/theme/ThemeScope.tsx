'use client';

import { useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { getThemeVariables } from '@/lib/theme-engine/merge';
import { cn } from '@/lib/utils';
import type { WorkspaceCategory } from '@/types/database';

type Props = {
  children: ReactNode;
  /** Active BuddyBubble category; defaults to business if null/invalid. */
  category: WorkspaceCategory | string | null | undefined;
  className?: string;
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
 *
 * Uses a real layout box (not `display: contents`) so custom-property updates invalidate
 * descendants reliably across browsers when switching BuddyBubble categories.
 */
export function ThemeScope({ category, children, className }: Props) {
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
    <div
      data-bb-theme={String(category ?? 'business').toLowerCase()}
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
      style={style}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}
