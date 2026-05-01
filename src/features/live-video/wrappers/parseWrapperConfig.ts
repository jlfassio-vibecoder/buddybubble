const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuidField(config: unknown, field: string): string | null {
  if (!config || typeof config !== 'object') return null;
  const value = (config as Record<string, unknown>)[field];
  if (typeof value !== 'string') return null;
  return UUID_RE.test(value) ? value : null;
}

export function parseAmrapSessionIdFromWrapperConfig(config: unknown): string | null {
  return parseUuidField(config, 'amrap_session_id');
}
