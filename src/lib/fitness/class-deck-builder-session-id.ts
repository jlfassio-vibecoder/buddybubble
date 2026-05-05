/** Namespace for draft class workout decks in `live_session_deck_items.session_id` (not a live invite session UUID). */
export const CLASS_DECK_BUILDER_SESSION_PREFIX = 'bb-class-deck:' as const;

export function classDeckBuilderSessionId(classInstanceId: string): string {
  return `${CLASS_DECK_BUILDER_SESSION_PREFIX}${classInstanceId.trim()}`;
}

export function parseClassInstanceIdFromDeckBuilderSessionId(sessionId: string): string | null {
  const t = sessionId.trim();
  if (!t.startsWith(CLASS_DECK_BUILDER_SESSION_PREFIX)) return null;
  const id = t.slice(CLASS_DECK_BUILDER_SESSION_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}
