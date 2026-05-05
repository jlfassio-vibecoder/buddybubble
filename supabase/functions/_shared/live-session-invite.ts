/** Subset of `LiveSessionInvitePayload` for Edge Function host checks. */
export type LiveSessionInvitePayload = {
  type: 'live_session';
  workspaceId: string;
  sessionId: string;
  channelId: string;
  hostUserId: string;
  mode: 'workout';
  createdAt: string;
  endedAt?: string | null;
};

export function parseLiveSessionInviteFromInstanceMetadata(
  metadata: unknown,
): LiveSessionInvitePayload | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const o = metadata as Record<string, unknown>;
  const raw = o.live_session;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ls = raw as Record<string, unknown>;
  if (ls.type !== 'live_session') return null;
  const workspaceId = typeof ls.workspaceId === 'string' ? ls.workspaceId.trim() : '';
  const sessionId = typeof ls.sessionId === 'string' ? ls.sessionId.trim() : '';
  const channelId = typeof ls.channelId === 'string' ? ls.channelId.trim() : '';
  const hostUserId = typeof ls.hostUserId === 'string' ? ls.hostUserId.trim() : '';
  const mode = ls.mode;
  const createdAt = typeof ls.createdAt === 'string' ? ls.createdAt : '';
  if (!workspaceId || !sessionId || !channelId || !hostUserId || !createdAt) return null;
  if (mode !== 'workout') return null;
  const endedAt =
    ls.endedAt === null || ls.endedAt === undefined
      ? undefined
      : typeof ls.endedAt === 'string'
        ? ls.endedAt
        : undefined;
  return {
    type: 'live_session',
    workspaceId,
    sessionId,
    channelId,
    hostUserId,
    mode: 'workout',
    createdAt,
    ...(endedAt !== undefined ? { endedAt } : {}),
  };
}
