import { isUuidString } from '@/lib/is-uuid';

/** Query param for mobile bubble-thread deep link (`?thread={rootMessageId}`). */
export const THREAD_SEARCH_PARAM = 'thread';

/** Returns a validated root message UUID from `?thread=`, or null if missing/invalid. */
export function parseThreadMessageIdFromSearchParam(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const id = raw.trim();
  return isUuidString(id) ? id : null;
}
