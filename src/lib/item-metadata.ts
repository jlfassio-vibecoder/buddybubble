import type { ItemType, Json } from '@/types/database';

/** Normalize DB `metadata` jsonb for form state (object only; otherwise {}). */
export function parseTaskMetadata(value: unknown): Json {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Json;
  return {};
}

const MANAGED_METADATA_KEYS = ['location', 'url', 'season', 'end_date', 'caption'] as const;

export type TaskMetadataFormFields = {
  eventLocation: string;
  eventUrl: string;
  experienceSeason: string;
  /** YYYY-MM-DD; experience span end (start is `scheduled_on`). */
  experienceEndDate: string;
  memoryCaption: string;
};

/** Read string inputs from saved metadata (for TaskModal local state). */
export function metadataFieldsFromParsed(meta: unknown): TaskMetadataFormFields {
  const o = parseTaskMetadata(meta) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const endRaw = str(o.end_date);
  return {
    eventLocation: str(o.location),
    eventUrl: str(o.url),
    experienceSeason: str(o.season),
    experienceEndDate: endRaw.length >= 10 ? endRaw.slice(0, 10) : endRaw,
    memoryCaption: str(o.caption),
  };
}

/**
 * Merge type-specific fields into metadata; strips managed keys first so switching `item_type`
 * does not leave stale keys. Preserves other keys (e.g. future `votes` on ideas).
 */
export function buildTaskMetadataPayload(
  itemType: ItemType,
  fields: TaskMetadataFormFields,
  base: unknown,
): Json {
  const o = { ...(parseTaskMetadata(base) as Record<string, unknown>) };
  for (const k of MANAGED_METADATA_KEYS) {
    delete o[k];
  }
  const t = (s: string) => s.trim();
  switch (itemType) {
    case 'event':
      if (t(fields.eventLocation)) o.location = t(fields.eventLocation);
      if (t(fields.eventUrl)) o.url = t(fields.eventUrl);
      break;
    case 'experience':
      if (t(fields.experienceSeason)) o.season = t(fields.experienceSeason);
      if (t(fields.experienceEndDate)) o.end_date = t(fields.experienceEndDate).slice(0, 10);
      break;
    case 'memory':
      if (t(fields.memoryCaption)) o.caption = t(fields.memoryCaption);
      break;
    default:
      break;
  }
  return o as Json;
}
