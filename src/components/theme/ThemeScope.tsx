'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { getThemeVariables } from '@/lib/theme-engine/merge';
import type { WorkspaceCategory } from '@/types/database';

type Props = {
  children: ReactNode;
  /** Active BuddyBubble category; defaults to business if null/invalid. */
  category: WorkspaceCategory | string | null | undefined;
};

/**
 * Injects category + resolved light/dark CSS variables for descendants.
 * Uses `display: contents` so layout is unchanged.
 *
 * `next-themes` does not know `resolvedTheme` on the server; on the client it can be `dark`
 * immediately. Using that on the first paint makes inline `style` differ from SSR and triggers
 * a hydration mismatch. We apply **light** palette until mount, then sync to `resolvedTheme`.
 */
export function ThemeScope({ category, children }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { resolvedTheme } = useTheme();
  const isDark = mounted && resolvedTheme === 'dark';

  const style = useMemo(
    () => getThemeVariables(category, isDark) as CSSProperties,
    [category, isDark],
  );

  return (
    <div className="contents" style={style}>
      {children}
    </div>
  );
}
