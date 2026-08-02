import type { WorkspaceCategory } from '@/types/database';

/**
 * Distinct ring colors per workspace category for rail / mobile strip tiles.
 * Uses fixed Tailwind colors (not theme tokens) so icons stay differentiable
 * even before ThemeScope paints.
 */
export function categoryRailRingClass(
  category: WorkspaceCategory | string | null | undefined,
): string {
  switch (category) {
    case 'business':
      return 'ring-indigo-400/70';
    case 'kids':
      return 'ring-amber-400/80';
    case 'class':
      return 'ring-orange-400/70';
    case 'community':
      return 'ring-rose-400/70';
    case 'fitness':
      return 'ring-emerald-400/70';
    default:
      return 'ring-white/30';
  }
}
