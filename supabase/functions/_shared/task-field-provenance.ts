/**
 * Durable TaskModal Coach vs user field provenance (`metadata.field_provenance`).
 * Keep in sync with `src/lib/task-field-provenance.ts` (app + Edge share the contract).
 */

export const FIELD_PROVENANCE_KEY = 'field_provenance' as const;

export type FieldProvenanceBy = 'agent' | 'user';

export type FieldProvenanceEntry = {
  by: FieldProvenanceBy;
  agent_slug?: string;
  at?: string;
};

export type FieldProvenanceMap = Record<string, FieldProvenanceEntry>;

export type StampAgentOptions = {
  agentSlug?: string;
  at?: string;
};

function asRecord(meta: unknown): Record<string, unknown> {
  if (meta != null && typeof meta === 'object' && !Array.isArray(meta)) {
    return { ...(meta as Record<string, unknown>) };
  }
  return {};
}

function isEntry(v: unknown): v is FieldProvenanceEntry {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const by = (v as { by?: unknown }).by;
  return by === 'agent' || by === 'user';
}

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

export function withAgentProvenance(
  metadata: Record<string, unknown> | null | undefined,
  keys: readonly string[],
  options?: StampAgentOptions,
): Record<string, unknown> | null {
  if (metadata == null) return null;
  return stampAgentFields(metadata, keys, options);
}

/** Shallow patch with only updated `field_provenance` (title/description-only Coach writes). */
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
