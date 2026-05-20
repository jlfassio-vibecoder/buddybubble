import type { Json } from '@/types/database';

/** Normalize DB `metadata` jsonb for form state (object only; otherwise {}). */
export function parseTaskMetadata(value: unknown): Json {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Json;
  return {};
}
