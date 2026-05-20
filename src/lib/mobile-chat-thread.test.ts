import { describe, expect, it } from 'vitest';
import { parseThreadMessageIdFromSearchParam, THREAD_SEARCH_PARAM } from '@/lib/mobile-chat-thread';

describe('mobile-chat-thread', () => {
  it('exports thread search param key', () => {
    expect(THREAD_SEARCH_PARAM).toBe('thread');
  });

  it('parses valid UUID', () => {
    const id = '62392704-f0d2-452e-be42-89b65c8a4f01';
    expect(parseThreadMessageIdFromSearchParam(id)).toBe(id);
  });

  it('returns null for missing or invalid values', () => {
    expect(parseThreadMessageIdFromSearchParam(null)).toBeNull();
    expect(parseThreadMessageIdFromSearchParam('')).toBeNull();
    expect(parseThreadMessageIdFromSearchParam('not-a-uuid')).toBeNull();
    expect(parseThreadMessageIdFromSearchParam('123')).toBeNull();
  });
});
