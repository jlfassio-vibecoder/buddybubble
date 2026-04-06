import type { CSSProperties } from 'react';
import type { WorkspaceCategory } from '@/types/database';

/** Visual treatment for the public invite preview card (matches workspace category “rings” / intent). */
export function invitePreviewPageBackgroundClass(category: string | null | undefined): string {
  const c = (category ?? 'business') as WorkspaceCategory;
  switch (c) {
    case 'business':
      return 'bg-gradient-to-br from-indigo-100/90 via-slate-50 to-slate-50';
    case 'kids':
      return 'bg-gradient-to-br from-violet-100/90 via-slate-50 to-fuchsia-50/80';
    case 'class':
      return 'bg-gradient-to-br from-amber-100/80 via-slate-50 to-slate-50';
    case 'community':
      return 'bg-gradient-to-br from-orange-200/50 via-amber-50 to-stone-100';
    default:
      return 'bg-slate-50';
  }
}

/** Card shell: gradient border / fill for the rich preview. */
export function invitePreviewCardClass(category: string | null | undefined): string {
  const c = (category ?? 'business') as WorkspaceCategory;
  switch (c) {
    case 'business':
      return 'border-indigo-300/60 bg-gradient-to-br from-indigo-500/10 via-card to-card shadow-indigo-500/10';
    case 'kids':
      return 'border-violet-300/55 bg-gradient-to-br from-violet-500/12 via-card to-fuchsia-50/40 shadow-violet-500/10';
    case 'class':
      return 'border-amber-300/55 bg-gradient-to-br from-amber-500/12 via-card to-card shadow-amber-500/10';
    case 'community':
      return 'border-orange-400/45 bg-gradient-to-br from-orange-600/15 via-card to-amber-50/50 shadow-orange-900/10';
    default:
      return 'border-border bg-card';
  }
}

/** Optional CSS variables for nested components (theme engine hook). */
export function invitePreviewThemeVars(category: string | null | undefined): CSSProperties {
  const c = (category ?? 'business') as WorkspaceCategory;
  const accents: Record<WorkspaceCategory, { hue: string; soft: string }> = {
    business: { hue: '239 84% 67%', soft: '239 84% 97%' },
    kids: { hue: '270 90% 65%', soft: '270 90% 97%' },
    class: { hue: '38 92% 50%', soft: '38 92% 96%' },
    community: { hue: '24 90% 48%', soft: '32 95% 94%' },
  };
  const a = accents[c] ?? accents.business;
  return {
    '--invite-accent': `hsl(${a.hue})`,
    '--invite-accent-soft': `hsl(${a.soft})`,
  } as CSSProperties;
}
