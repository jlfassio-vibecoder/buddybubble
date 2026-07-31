/** Closed emoji set for v1 message reaction pills (handoff `.tm-react`). */
export const MESSAGE_REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀'] as const;

export type MessageReactionEmoji = (typeof MESSAGE_REACTION_EMOJIS)[number];

export type MessageReactionAgg = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export function isMessageReactionEmoji(value: string): value is MessageReactionEmoji {
  return (MESSAGE_REACTION_EMOJIS as readonly string[]).includes(value);
}

export function aggregateMessageReactions(
  rows: readonly { message_id: string; user_id: string; emoji: string }[],
  viewerUserId: string | null | undefined,
): Record<string, MessageReactionAgg[]> {
  const byMessage = new Map<string, Map<string, { count: number; reactedByMe: boolean }>>();

  for (const row of rows) {
    const emoji = row.emoji.trim();
    if (!emoji) continue;
    let emojiMap = byMessage.get(row.message_id);
    if (!emojiMap) {
      emojiMap = new Map();
      byMessage.set(row.message_id, emojiMap);
    }
    const cur = emojiMap.get(emoji) ?? { count: 0, reactedByMe: false };
    cur.count += 1;
    if (viewerUserId && row.user_id === viewerUserId) cur.reactedByMe = true;
    emojiMap.set(emoji, cur);
  }

  const out: Record<string, MessageReactionAgg[]> = {};
  for (const [messageId, emojiMap] of byMessage) {
    const list: MessageReactionAgg[] = [...emojiMap.entries()].map(([emoji, v]) => ({
      emoji,
      count: v.count,
      reactedByMe: v.reactedByMe,
    }));
    list.sort((a, b) => {
      const ai = MESSAGE_REACTION_EMOJIS.indexOf(a.emoji as MessageReactionEmoji);
      const bi = MESSAGE_REACTION_EMOJIS.indexOf(b.emoji as MessageReactionEmoji);
      const ao = ai === -1 ? 999 : ai;
      const bo = bi === -1 ? 999 : bi;
      if (ao !== bo) return ao - bo;
      return a.emoji.localeCompare(b.emoji);
    });
    out[messageId] = list;
  }
  return out;
}
