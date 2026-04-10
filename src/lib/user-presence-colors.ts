/** Fixed palette for stable per-user presence rings (hex for inline styles). */
const PRESENCE_HEX_PALETTE = [
  '#10b981',
  '#8b5cf6',
  '#f43f5e',
  '#f59e0b',
  '#0ea5e9',
  '#6366f1',
  '#ec4899',
];

/**
 * Deterministic string hash to a non-negative integer (FNV-1a style, 32-bit).
 */
function hashStringToUint(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/**
 * Stable display color for a user id (same id always maps to the same hex).
 */
export function getUserColor(userId: string): string {
  if (!userId) return PRESENCE_HEX_PALETTE[0];
  const idx = hashStringToUint(userId) % PRESENCE_HEX_PALETTE.length;
  return PRESENCE_HEX_PALETTE[idx];
}
