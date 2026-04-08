/**
 * Storefront presentation for `tasks.item_type` — mirrors CRM `item-type-styles.ts`
 * with Tailwind classes tuned for the public marketing grid.
 */
export type PublicCardVisual = {
  /** User-facing type label on the chip */
  label: string;
  /** Subtle card surface */
  bg: string;
  /** Accent border (full card outline) */
  border: string;
  /** Type chip: background + text (+ border) */
  chip: string;
};

const FALLBACK: PublicCardVisual = {
  label: 'Card',
  bg: 'bg-slate-50/90',
  border: 'border-slate-400',
  chip: 'border border-slate-200 bg-slate-100 text-slate-800',
};

const BY_TYPE: Record<string, PublicCardVisual> = {
  event: {
    label: 'Event',
    bg: 'bg-amber-50/50',
    border: 'border-amber-500',
    chip: 'border border-amber-200/90 bg-amber-100 text-amber-900',
  },
  experience: {
    label: 'Experience',
    bg: 'bg-indigo-50/50',
    border: 'border-indigo-500',
    chip: 'border border-indigo-200/90 bg-indigo-100 text-indigo-800',
  },
  memory: {
    label: 'Memory',
    bg: 'bg-rose-50/50',
    border: 'border-rose-500',
    chip: 'border border-rose-200/90 bg-rose-100 text-rose-900',
  },
  idea: {
    label: 'Idea',
    bg: 'bg-yellow-50/60',
    border: 'border-yellow-500',
    chip: 'border border-yellow-200/90 bg-yellow-100 text-yellow-900',
  },
  task: {
    label: 'Card',
    bg: 'bg-slate-50/90',
    border: 'border-blue-500',
    chip: 'border border-blue-200/90 bg-blue-100 text-blue-900',
  },
};

export function getPublicCardVisual(itemType: string): PublicCardVisual {
  const key = (itemType || 'task').toLowerCase();
  return BY_TYPE[key] ?? FALLBACK;
}
