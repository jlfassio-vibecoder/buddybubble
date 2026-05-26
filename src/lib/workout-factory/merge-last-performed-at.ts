import type { Json } from '@/types/database';

/** Merge denormalized last execution timestamp into task metadata (Playbook readiness). */
export function mergeLastPerformedAtIntoTaskMetadata(
  existingMetadata: unknown,
  performedAt: string,
): Record<string, unknown> {
  const base =
    existingMetadata != null &&
    typeof existingMetadata === 'object' &&
    !Array.isArray(existingMetadata)
      ? { ...(existingMetadata as Record<string, unknown>) }
      : {};
  return { ...base, last_performed_at: performedAt };
}

export function lastPerformedAtFromMetadata(metadata: unknown): string | null {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const v = (metadata as Record<string, unknown>).last_performed_at;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export type JsonMetadata = Json;
