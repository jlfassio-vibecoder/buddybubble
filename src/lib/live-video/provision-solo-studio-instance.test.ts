import { describe, expect, it } from 'vitest';
import {
  buildSoloStudioInstanceMetadata,
  resolveLiveSessionCreateAccessMode,
} from '@/lib/live-video/provision-solo-studio-instance';
import { parseAsyncSessionFromInstanceMetadata } from '@/types/live-session-invite';

describe('buildSoloStudioInstanceMetadata', () => {
  it('includes async_session and omits live_session', () => {
    const meta = buildSoloStudioInstanceMetadata({
      sessionId: '11111111-1111-4111-8111-111111111111',
      hostUserId: 'host-user',
      createdAt: '2026-07-15T12:00:00.000Z',
    });

    expect(meta).toEqual({
      async_session: {
        type: 'async_session',
        sessionId: '11111111-1111-4111-8111-111111111111',
        createdAt: '2026-07-15T12:00:00.000Z',
        hostUserId: 'host-user',
      },
    });
    expect(meta).not.toHaveProperty('live_session');

    const parsed = parseAsyncSessionFromInstanceMetadata(meta);
    expect(parsed?.sessionId).toBe('11111111-1111-4111-8111-111111111111');
    expect(parsed?.hostUserId).toBe('host-user');
  });
});

describe('resolveLiveSessionCreateAccessMode', () => {
  it('maps solo_studio for create RPC', () => {
    expect(resolveLiveSessionCreateAccessMode('solo_studio')).toBe('solo_studio');
  });

  it('defaults open for missing or open accessMode', () => {
    expect(resolveLiveSessionCreateAccessMode(undefined)).toBe('open');
    expect(resolveLiveSessionCreateAccessMode('open')).toBe('open');
  });
});
