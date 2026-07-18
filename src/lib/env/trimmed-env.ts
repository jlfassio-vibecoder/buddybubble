/**
 * Trim environment values and treat blank / whitespace-only strings as unset.
 * Shared by server-side Agora failover helpers (no secrets live here).
 */
export function trimmedEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
