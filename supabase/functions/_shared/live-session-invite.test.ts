import { describe, expect, it } from 'vitest';
import { parseAsyncSessionFromInstanceMetadata } from './live-session-invite';

/**
 * Deno edge mirror of `parseAsyncSessionFromInstanceMetadata` — keep behavior aligned with
 * `src/types/live-session-invite.ts`.
 */
describe('parseAsyncSessionFromInstanceMetadata (edge mirror)', () => {
  const valid = {
    async_session: {
      type: 'async_session',
      sessionId: 'bb-class-deck:abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      hostUserId: 'host-uuid',
    },
  };

  it('parses active async_session', () => {
    const p = parseAsyncSessionFromInstanceMetadata(valid);
    expect(p?.type).toBe('async_session');
    expect(p?.sessionId).toBe('bb-class-deck:abc');
    expect(p?.endedAt).toBeUndefined();
  });

  it('returns null when missing or invalid', () => {
    expect(parseAsyncSessionFromInstanceMetadata(null)).toBeNull();
    expect(parseAsyncSessionFromInstanceMetadata({})).toBeNull();
  });

  it('includes endedAt when set', () => {
    const p = parseAsyncSessionFromInstanceMetadata({
      async_session: {
        ...valid.async_session,
        endedAt: '2026-01-02T00:00:00.000Z',
      },
    });
    expect(p?.endedAt).toBe('2026-01-02T00:00:00.000Z');
  });
});
