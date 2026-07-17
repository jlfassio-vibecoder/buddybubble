import { describe, expect, it } from 'vitest';
import {
  buildSoloStudioInstanceMetadata,
  resolveLiveSessionCreateAccessMode,
} from '@/lib/live-video/provision-solo-studio-instance';
import { classDeckBuilderSessionId } from '@/lib/fitness/class-deck-builder-session-id';
import { parseAsyncSessionFromInstanceMetadata } from '@/types/live-session-invite';

describe('buildSoloStudioInstanceMetadata', () => {
  it('pins async_session.sessionId to bb-class-deck namespace and omits live_session', () => {
    const classInstanceId = '11111111-1111-4111-8111-111111111111';
    const meta = buildSoloStudioInstanceMetadata({
      classInstanceId,
      hostUserId: 'host-user',
      createdAt: '2026-07-15T12:00:00.000Z',
    });

    expect(meta).toEqual({
      async_session: {
        type: 'async_session',
        sessionId: classDeckBuilderSessionId(classInstanceId),
        createdAt: '2026-07-15T12:00:00.000Z',
        hostUserId: 'host-user',
      },
    });
    expect(meta).not.toHaveProperty('live_session');

    const parsed = parseAsyncSessionFromInstanceMetadata(meta);
    expect(parsed?.sessionId).toBe(`bb-class-deck:${classInstanceId}`);
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
