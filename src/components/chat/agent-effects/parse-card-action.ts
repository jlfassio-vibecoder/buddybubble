import type { CardAction, CardActionKind } from './types';

const KNOWN_KINDS: ReadonlySet<CardActionKind> = new Set([
  'trigger_generation',
  'regenerate_from_outline',
]);

export function parseCardActionFromMetadata(raw: unknown): CardAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.kind !== 'string' || !KNOWN_KINDS.has(o.kind as CardActionKind)) return null;
  return { v: 1, kind: o.kind as CardActionKind };
}
