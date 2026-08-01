import type { Json } from '@/types/database';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';

export const FIELD_PROVENANCE_KEY = 'field_provenance' as const;

export type FieldProvenanceBy = 'agent' | 'user';

export type FieldProvenanceEntry = {
  by: FieldProvenanceBy;
  agent_slug?: string;
  at?: string;
};

export type FieldProvenanceMap = Record<string, FieldProvenanceEntry>;

/** Stable TaskModal / canvas keys for first-wave Coach chrome. */
export const TASK_MODAL_PROVENANCE_SCALAR_KEYS = [
  'title',
  'description',
  'location',
  'url',
  'bring',
  'going',
  'capacity',
  'going_people',
  'season',
  'end_date',
  'caption',
  'workout_type',
  'duration_min',
  'exercises',
  'goal',
  'duration_weeks',
  'current_week',
  'schedule',
  'program_source_title',
  'card_cover_path',
  'blocks',
  'coach_workout_outline',
  'ai_workout_factory',
] as const;

export type StampAgentOptions = {
  agentSlug?: string;
  at?: string;
};

function asRecord(meta: unknown): Record<string, unknown> {
  return { ...(parseTaskMetadata(meta ?? {}) as Record<string, unknown>) };
}

function isEntry(v: unknown): v is FieldProvenanceEntry {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const by = (v as { by?: unknown }).by;
  return by === 'agent' || by === 'user';
}

/** Read `metadata.field_provenance` (empty object when absent/invalid). */
export function readFieldProvenance(metadata: unknown): FieldProvenanceMap {
  const o = asRecord(metadata);
  const raw = o[FIELD_PROVENANCE_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: FieldProvenanceMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k.trim() || !isEntry(v)) continue;
    const entry: FieldProvenanceEntry = { by: v.by };
    if (typeof v.agent_slug === 'string' && v.agent_slug.trim()) {
      entry.agent_slug = v.agent_slug.trim();
    }
    if (typeof v.at === 'string' && v.at.trim()) entry.at = v.at.trim();
    out[k] = entry;
  }
  return out;
}

export function isAgentFilled(metadata: unknown, key: string): boolean {
  const e = readFieldProvenance(metadata)[key];
  return e?.by === 'agent';
}

export function countAgentFilledFields(metadata: unknown): number {
  return Object.values(readFieldProvenance(metadata)).filter((e) => e.by === 'agent').length;
}

export function listAgentFilledKeys(metadata: unknown): string[] {
  return Object.entries(readFieldProvenance(metadata))
    .filter(([, e]) => e.by === 'agent')
    .map(([k]) => k)
    .sort();
}

/**
 * True when the field is agent-filled and not in the demoted (user-dirty) set.
 * Use for UI tint before save demotes provenance on disk.
 */
export function isAgentFilledForDisplay(
  metadata: unknown,
  key: string,
  demotedKeys?: ReadonlySet<string> | readonly string[] | null,
): boolean {
  if (!isAgentFilled(metadata, key)) return false;
  if (!demotedKeys) return true;
  const set = demotedKeys instanceof Set ? demotedKeys : new Set(demotedKeys);
  return !set.has(key);
}

/** Merge agent stamps for the given keys into `field_provenance` on a metadata object. */
export function stampAgentFields(
  metadata: unknown,
  keys: readonly string[],
  options?: StampAgentOptions,
): Record<string, unknown> {
  const next = asRecord(metadata);
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (unique.length === 0) return next;

  const map = { ...readFieldProvenance(next) };
  const at = options?.at ?? new Date().toISOString();
  const normalizedAgentSlug = options?.agentSlug?.trim();
  const agentSlug =
    normalizedAgentSlug && normalizedAgentSlug.length > 0 ? normalizedAgentSlug : 'unknown_agent';
  for (const key of unique) {
    map[key] = { by: 'agent', agent_slug: agentSlug, at };
  }
  next[FIELD_PROVENANCE_KEY] = map;
  return next;
}

/** Demote keys to `by: 'user'` (clears Coach tint after human overwrite). */
export function stampUserFields(
  metadata: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const next = asRecord(metadata);
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (unique.length === 0) return next;

  const map = { ...readFieldProvenance(next) };
  const at = new Date().toISOString();
  let changed = false;
  for (const key of unique) {
    const prev = map[key];
    if (prev?.by === 'user' && !prev.agent_slug) continue;
    map[key] = { by: 'user', at };
    changed = true;
  }
  if (!changed && unique.every((k) => map[k]?.by === 'user')) {
    // still write map if missing entirely for those keys
    for (const key of unique) {
      if (!map[key]) {
        map[key] = { by: 'user', at };
        changed = true;
      }
    }
  }
  if (changed || unique.some((k) => map[k]?.by === 'user')) {
    next[FIELD_PROVENANCE_KEY] = map;
  }
  return next;
}

/**
 * Map Coach merge-log touch tokens → provenance keys.
 * Structural / proposed merges often report section names; canvas chrome uses `blocks`.
 */
export function provenanceKeysFromMergeTouched(touched: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const t of touched) {
    const x = t.trim();
    if (!x) continue;
    if (
      x === 'exerciseBlocks' ||
      x === 'warmup' ||
      x === 'finisher' ||
      x === 'cooldown' ||
      x === 'warmupBlocks' ||
      x === 'finisherBlocks' ||
      x === 'cooldownBlocks'
    ) {
      keys.add('blocks');
      keys.add('ai_workout_factory');
      continue;
    }
    keys.add(x);
  }
  return [...keys];
}

/** Attach agent stamps onto metadata (mutates copy); for Edge/strategy after merges. */
export function withAgentProvenance(
  metadata: Record<string, unknown> | null | undefined,
  keys: readonly string[],
  options?: StampAgentOptions,
): Record<string, unknown> | null {
  if (metadata == null) return null;
  return stampAgentFields(metadata, keys, options) as Record<string, unknown>;
}

/**
 * Shallow metadata patch containing only an updated `field_provenance` map.
 * Use when Coach updates title/description without a full metadata rewrite.
 */
export function agentProvenanceMetadataPatch(
  baseMetadata: unknown,
  keys: readonly string[],
  options?: StampAgentOptions,
): Record<string, unknown> | null {
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  const stamped = stampAgentFields(baseMetadata, unique, options);
  return { [FIELD_PROVENANCE_KEY]: stamped[FIELD_PROVENANCE_KEY] };
}
