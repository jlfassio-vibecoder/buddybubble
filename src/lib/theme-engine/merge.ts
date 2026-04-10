import type { CSSProperties } from 'react';
import type { WorkspaceCategory } from '@/types/database';
import { THEME_REGISTRY } from '@/lib/theme-engine/registry';

const DEFAULT_CATEGORY: WorkspaceCategory = 'business';

function normalizeCategory(
  category: WorkspaceCategory | string | null | undefined,
): WorkspaceCategory {
  const c = String(category ?? '').toLowerCase();
  if (c === 'business' || c === 'kids' || c === 'class' || c === 'community' || c === 'fitness') {
    return c;
  }
  return DEFAULT_CATEGORY;
}

/** Kanban / task badge tokens — same structure as theme mock; rgba in dark for softer fills. */
function kanbanAccentVariables(isDark: boolean): Record<string, string> {
  if (isDark) {
    return {
      '--accent-yellow': '#facc15',
      '--accent-yellow-bg': 'rgba(250, 204, 21, 0.15)',
      '--accent-yellow-text': '#fef08a',
      '--accent-red': '#ef4444',
      '--accent-red-bg': 'rgba(239, 68, 68, 0.15)',
      '--accent-red-text': '#fca5a5',
      '--accent-orange': '#f97316',
      '--accent-orange-bg': 'rgba(249, 115, 22, 0.15)',
      '--accent-orange-text': '#fdba74',
      '--accent-blue': '#3b82f6',
      '--accent-blue-bg': 'rgba(59, 130, 246, 0.15)',
      '--accent-blue-text': '#93c5fd',
      '--accent-green': '#10b981',
      '--accent-green-bg': 'rgba(16, 185, 129, 0.15)',
      '--accent-green-text': '#6ee7b7',
    };
  }
  return {
    '--accent-yellow': '#facc15',
    '--accent-yellow-bg': '#fef9c3',
    '--accent-yellow-text': '#854d0e',
    '--accent-red': '#ef4444',
    '--accent-red-bg': '#fee2e2',
    '--accent-red-text': '#991b1b',
    '--accent-orange': '#f97316',
    '--accent-orange-bg': '#ffedd5',
    '--accent-orange-text': '#9a3412',
    '--accent-blue': '#3b82f6',
    '--accent-blue-bg': '#dbeafe',
    '--accent-blue-text': '#1e40af',
    '--accent-green': '#10b981',
    '--accent-green-bg': '#d1fae5',
    '--accent-green-text': '#065f46',
  };
}

/**
 * Merge category chrome, light/dark semantic tokens, and Kanban accent variables for inline `style`.
 */
export function getThemeVariables(
  category: WorkspaceCategory | string | null | undefined,
  isDark: boolean,
): CSSProperties {
  const key = normalizeCategory(category);
  const entry = THEME_REGISTRY[key];
  const modeMap = isDark ? entry.dark : entry.light;
  const merged: Record<string, string> = {
    ...entry.chrome,
    ...modeMap,
    ...kanbanAccentVariables(isDark),
  };
  return merged as CSSProperties;
}
