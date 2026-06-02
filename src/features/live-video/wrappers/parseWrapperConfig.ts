import { isUuidString } from '@/lib/is-uuid';

export function parseUuidField(config: unknown, field: string): string | null {
  if (!config || typeof config !== 'object') return null;
  const value = (config as Record<string, unknown>)[field];
  if (typeof value !== 'string') return null;
  return isUuidString(value) ? value : null;
}

export function parseIntervalSessionIdFromWrapperConfig(config: unknown): string | null {
  return (
    parseUuidField(config, 'interval_session_id') ?? parseUuidField(config, 'amrap_session_id')
  );
}

/** @deprecated Use parseIntervalSessionIdFromWrapperConfig */
export function parseAmrapSessionIdFromWrapperConfig(config: unknown): string | null {
  return parseIntervalSessionIdFromWrapperConfig(config);
}
