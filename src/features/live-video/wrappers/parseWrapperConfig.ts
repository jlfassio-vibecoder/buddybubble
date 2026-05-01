import { isUuidString } from '@/lib/is-uuid';

export function parseUuidField(config: unknown, field: string): string | null {
  if (!config || typeof config !== 'object') return null;
  const value = (config as Record<string, unknown>)[field];
  if (typeof value !== 'string') return null;
  return isUuidString(value) ? value : null;
}

export function parseAmrapSessionIdFromWrapperConfig(config: unknown): string | null {
  return parseUuidField(config, 'amrap_session_id');
}
