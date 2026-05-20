/** Query param for mobile bubble-thread deep link (`?thread={rootMessageId}`). */
export const THREAD_SEARCH_PARAM = 'thread';

const MESSAGE_ID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns a validated root message UUID from `?thread=`, or null if missing/invalid. */
export function parseThreadMessageIdFromSearchParam(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const id = raw.trim();
  return MESSAGE_ID_SEGMENT.test(id) ? id : null;
}
