/**
 * Restrict redirects to same-origin path + query (blocks protocol-relative //evil.com).
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  if (!t || !t.startsWith('/') || t.startsWith('//')) return null;
  return t;
}
