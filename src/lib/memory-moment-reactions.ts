import {
  MESSAGE_REACTION_EMOJIS,
  type MessageReactionAgg,
  type MessageReactionEmoji,
} from '@/lib/message-reactions';

/** Normalized task-metadata moment reaction row. */
export type MemoryMomentReaction = {
  emoji: string;
  count: number;
  reacted_by: string[];
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function readNonNegInt(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
}

/** Parse `metadata.reactions` (supports handoff `{ e, n }` and `{ emoji, count, reacted_by }`). */
export function parseMemoryMomentReactions(value: unknown): MemoryMomentReaction[] {
  if (!Array.isArray(value)) return [];
  const byEmoji = new Map<string, MemoryMomentReaction>();

  for (const row of value) {
    if (typeof row !== 'object' || row === null) continue;
    const o = row as Record<string, unknown>;
    const emojiRaw =
      typeof o.emoji === 'string'
        ? o.emoji
        : typeof o.e === 'string'
          ? o.e
          : typeof o.emoji === 'number'
            ? String(o.emoji)
            : '';
    const emoji = emojiRaw.trim();
    if (!emoji) continue;

    const reactedBy = asStringList(o.reacted_by);
    const rawCount = readNonNegInt(o.count ?? o.n);
    const count = reactedBy.length > 0 ? Math.max(rawCount, reactedBy.length) : rawCount;
    if (count <= 0 && reactedBy.length === 0) continue;

    const prev = byEmoji.get(emoji);
    if (!prev) {
      byEmoji.set(emoji, { emoji, count, reacted_by: reactedBy });
      continue;
    }
    const mergedBy = [...new Set([...prev.reacted_by, ...reactedBy])];
    byEmoji.set(emoji, {
      emoji,
      count: Math.max(prev.count, count, mergedBy.length),
      reacted_by: mergedBy,
    });
  }

  const list = [...byEmoji.values()];
  list.sort((a, b) => {
    const ai = MESSAGE_REACTION_EMOJIS.indexOf(a.emoji as MessageReactionEmoji);
    const bi = MESSAGE_REACTION_EMOJIS.indexOf(b.emoji as MessageReactionEmoji);
    const ao = ai === -1 ? 999 : ai;
    const bo = bi === -1 ? 999 : bi;
    if (ao !== bo) return ao - bo;
    return a.emoji.localeCompare(b.emoji);
  });
  return list;
}

/** Map stored reactions to chat pill aggregates for the current viewer. */
export function memoryReactionAggs(
  reactions: readonly MemoryMomentReaction[],
  userId: string | null | undefined,
): MessageReactionAgg[] {
  return reactions.map((r) => ({
    emoji: r.emoji,
    count: r.reacted_by.length > 0 ? Math.max(r.count, r.reacted_by.length) : r.count,
    reactedByMe: Boolean(userId && r.reacted_by.includes(userId)),
  }));
}

/** Toggle current user's reaction for an emoji (legacy count remainder preserved). */
export function toggleMemoryMomentReaction(
  reactions: readonly MemoryMomentReaction[],
  emoji: string,
  userId: string,
): MemoryMomentReaction[] {
  const trimmed = emoji.trim();
  if (!trimmed || !userId) return [...reactions];

  const next = reactions.map((r) => ({
    ...r,
    reacted_by: [...r.reacted_by],
  }));
  const idx = next.findIndex((r) => r.emoji === trimmed);

  if (idx === -1) {
    next.push({ emoji: trimmed, count: 1, reacted_by: [userId] });
  } else {
    const row = next[idx]!;
    const has = row.reacted_by.includes(userId);
    if (has) {
      row.reacted_by = row.reacted_by.filter((id) => id !== userId);
      row.count = Math.max(0, row.count - 1);
      if (row.count === 0 && row.reacted_by.length === 0) {
        next.splice(idx, 1);
      }
    } else {
      row.reacted_by = [...row.reacted_by, userId];
      row.count = Math.max(row.count, row.reacted_by.length - 1) + 1;
    }
  }

  return parseMemoryMomentReactions(next);
}

/** Serialize for `tasks.metadata.reactions` (omit empty). */
export function serializeMemoryMomentReactions(
  reactions: readonly MemoryMomentReaction[],
): MemoryMomentReaction[] {
  return parseMemoryMomentReactions(reactions).map((r) => ({
    emoji: r.emoji,
    count: r.reacted_by.length > 0 ? Math.max(r.count, r.reacted_by.length) : r.count,
    ...(r.reacted_by.length > 0 ? { reacted_by: r.reacted_by } : {}),
  })) as MemoryMomentReaction[];
}
