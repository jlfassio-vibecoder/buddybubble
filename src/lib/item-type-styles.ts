import type { LucideIcon } from 'lucide-react';
import {
  Camera,
  CheckSquare,
  ClipboardList,
  Dumbbell,
  Lightbulb,
  MapPin,
  Sparkles,
} from 'lucide-react';
import type { ItemType } from '@/types/database';

/** Presentation config for `tasks.item_type` (Kanban, calendar micro cells, modal). */
export type ItemTypeVisual = {
  Icon: LucideIcon;
  /** Human-readable — tooltips and aria */
  label: string;
  /** `border-l-2` is applied on the card; this is the bar color */
  leftBar: string;
  /** Subtle card background tint */
  surface: string;
  /** Icon color (micro row, type chip) */
  iconText: string;
  /** Type chip: border + background + text */
  typeChip: string;
};

export const ITEM_TYPES_ORDER: ItemType[] = [
  'task',
  'event',
  'experience',
  'idea',
  'memory',
  'workout',
  'workout_log',
];

export const ITEM_TYPE_VISUAL: Record<ItemType, ItemTypeVisual> = {
  task: {
    Icon: CheckSquare,
    label: 'Card',
    leftBar: 'border-l-muted-foreground/45',
    surface: 'bg-muted/25 dark:bg-muted/20',
    iconText: 'text-muted-foreground',
    typeChip:
      'border-border/50 bg-muted/60 text-muted-foreground dark:border-border/60 dark:bg-muted/40',
  },
  event: {
    Icon: MapPin,
    label: 'Event',
    leftBar: 'border-l-blue-500 dark:border-l-blue-400',
    surface: 'bg-blue-500/[0.07] dark:bg-blue-500/[0.12]',
    iconText: 'text-blue-600 dark:text-blue-400',
    typeChip:
      'border-blue-200/90 bg-blue-100 text-blue-800 dark:border-blue-800/50 dark:bg-blue-950/70 dark:text-blue-200',
  },
  experience: {
    Icon: Sparkles,
    label: 'Experience',
    leftBar: 'border-l-indigo-500 dark:border-l-indigo-400',
    surface: 'bg-indigo-500/[0.07] dark:bg-indigo-500/[0.12]',
    iconText: 'text-indigo-600 dark:text-indigo-400',
    typeChip:
      'border-indigo-200/90 bg-indigo-100 text-indigo-800 dark:border-indigo-800/50 dark:bg-indigo-950/70 dark:text-indigo-200',
  },
  idea: {
    Icon: Lightbulb,
    label: 'Idea',
    leftBar: 'border-l-amber-500 dark:border-l-amber-400',
    surface: 'bg-amber-500/[0.07] dark:bg-amber-500/[0.12]',
    iconText: 'text-amber-700 dark:text-amber-400',
    typeChip:
      'border-amber-200/90 bg-amber-100 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/70 dark:text-amber-200',
  },
  memory: {
    Icon: Camera,
    label: 'Memory',
    leftBar: 'border-l-rose-500 dark:border-l-rose-400',
    surface: 'bg-rose-500/[0.07] dark:bg-rose-500/[0.12]',
    iconText: 'text-rose-600 dark:text-rose-400',
    typeChip:
      'border-rose-200/90 bg-rose-100 text-rose-800 dark:border-rose-800/50 dark:bg-rose-950/70 dark:text-rose-200',
  },
  workout: {
    Icon: Dumbbell,
    label: 'Workout',
    leftBar: 'border-l-emerald-500 dark:border-l-emerald-400',
    surface: 'bg-emerald-500/[0.07] dark:bg-emerald-500/[0.12]',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    typeChip:
      'border-emerald-200/90 bg-emerald-100 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/70 dark:text-emerald-200',
  },
  workout_log: {
    Icon: ClipboardList,
    label: 'Workout log',
    leftBar: 'border-l-teal-500 dark:border-l-teal-400',
    surface: 'bg-teal-500/[0.07] dark:bg-teal-500/[0.12]',
    iconText: 'text-teal-600 dark:text-teal-400',
    typeChip:
      'border-teal-200/90 bg-teal-100 text-teal-900 dark:border-teal-800/50 dark:bg-teal-950/70 dark:text-teal-200',
  },
};

export function getItemTypeVisual(type: ItemType): ItemTypeVisual {
  return ITEM_TYPE_VISUAL[type];
}

/** Lowercase user-facing noun for modal/button copy (`task` → "card"). */
export const ITEM_TYPE_UI_NOUN: Record<ItemType, string> = {
  task: 'card',
  event: 'event',
  experience: 'experience',
  idea: 'idea',
  memory: 'memory',
  workout: 'workout',
  workout_log: 'workout log',
};

export function itemTypeUiNoun(type: ItemType): string {
  return ITEM_TYPE_UI_NOUN[type];
}

export function indefiniteArticleForUiNoun(noun: string): 'a' | 'an' {
  return /^[aeiou]/i.test(noun.trim()) ? 'an' : 'a';
}
