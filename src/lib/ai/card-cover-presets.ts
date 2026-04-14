import { normalizeItemType, type ItemType } from '@/types/database';

export interface CardCoverPreset {
  id: string;
  label: string;
  /** Scene / lighting / mood snippet for Imagen (no demographic lock-in). */
  text: string;
}

export interface CardCoverPresetGroup {
  group: string;
  options: CardCoverPreset[];
}

export const CARD_COVER_PRESET_GROUPS: CardCoverPresetGroup[] = [
  {
    group: 'Professional / Work',
    options: [
      {
        id: 'pro-office-soft',
        label: 'Modern office',
        text: 'Modern office, soft natural lighting, workshop table with notebooks and laptop, collaborative professional mood.',
      },
      {
        id: 'pro-focus-desk',
        label: 'Deep focus',
        text: 'Quiet desk scene, shallow depth of field, warm task lamp, organized workspace, calm concentration.',
      },
    ],
  },
  {
    group: 'Community / Social',
    options: [
      {
        id: 'comm-gathering-warm',
        label: 'Gathering',
        text: 'Community gathering, warm atmosphere, diverse group in casual conversation, welcoming inclusive vibe.',
      },
      {
        id: 'comm-outdoor-park',
        label: 'Outdoor meetup',
        text: 'Outdoor park meetup, golden hour light, picnic or circle discussion, friendly and open.',
      },
    ],
  },
  {
    group: 'Personal / Memory',
    options: [
      {
        id: 'mem-polaroid',
        label: 'Nostalgic candid',
        text: 'Nostalgic polaroid-inspired look, intimate lighting, candid feel, soft grain, emotional warmth.',
      },
      {
        id: 'mem-home-soft',
        label: 'Home moment',
        text: 'Cozy home interior, soft window light, personal milestone atmosphere, gentle and sincere.',
      },
    ],
  },
  {
    group: 'Abstract / Minimal',
    options: [
      {
        id: 'abs-geo-gradient',
        label: 'Geometric gradients',
        text: 'Clean 3D geometric shapes, minimalist composition, vibrant gradients, no text, modern UI-adjacent aesthetic.',
      },
      {
        id: 'abs-paper-cut',
        label: 'Paper & layers',
        text: 'Layered paper-cut style, soft shadows, restrained palette, abstract but structured.',
      },
    ],
  },
  {
    group: 'Fitness / movement',
    options: [
      {
        id: 'fit-gym-clean',
        label: 'Training space',
        text: 'Bright athletic training space, clean gym lighting, motion and energy, safe for work, no graphic injury imagery.',
      },
    ],
  },
];

/** Short label for the layered prompt “card of type …” line. */
export function itemTypeLabelForPrompt(t: ItemType): string {
  switch (t) {
    case 'task':
      return 'general task';
    case 'event':
      return 'event';
    case 'experience':
      return 'experience';
    case 'memory':
      return 'memory';
    case 'idea':
      return 'idea';
    case 'workout':
      return 'workout';
    case 'workout_log':
      return 'workout log';
    case 'program':
      return 'training program';
    default:
      return 'task';
  }
}

export function getPresetTextById(id: string): string | undefined {
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  for (const g of CARD_COVER_PRESET_GROUPS) {
    const found = g.options.find((o) => o.id === trimmed);
    if (found) return found.text;
  }
  return undefined;
}

/**
 * Default scene archetype when the user does not pick a preset — tuned per `ItemType`.
 */
export function getDefaultPresetForItemType(itemType: string): string {
  const t = normalizeItemType(itemType);
  switch (t) {
    case 'event':
      return getPresetTextById('comm-gathering-warm') ?? '';
    case 'idea':
      return getPresetTextById('abs-geo-gradient') ?? '';
    case 'memory':
      return getPresetTextById('mem-polaroid') ?? '';
    case 'experience':
      return getPresetTextById('mem-home-soft') ?? '';
    case 'workout':
    case 'workout_log':
    case 'program':
      return getPresetTextById('fit-gym-clean') ?? '';
    case 'task':
    default:
      return getPresetTextById('pro-office-soft') ?? '';
  }
}

/** Flat list of all presets (e.g. for Select). */
export function allCardCoverPresets(): CardCoverPreset[] {
  const out: CardCoverPreset[] = [];
  for (const g of CARD_COVER_PRESET_GROUPS) {
    out.push(...g.options);
  }
  return out;
}
