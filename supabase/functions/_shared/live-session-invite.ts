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

/** Stored under `class_instances.metadata.async_session` — mirror of `src/types/live-session-invite.ts`. */
export type AsyncSessionPayload = {
  type: 'async_session';
  sessionId: string;
  createdAt: string;
  hostUserId: string;
  endedAt?: string | null;
};

export function parseAsyncSessionFromInstanceMetadata(
  metadata: unknown,
): AsyncSessionPayload | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const o = metadata as Record<string, unknown>;
  const raw = o.async_session;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  if (a.type !== 'async_session') return null;
  const sessionId = typeof a.sessionId === 'string' ? a.sessionId.trim() : '';
  const createdAt = typeof a.createdAt === 'string' ? a.createdAt : '';
  const hostUserId = typeof a.hostUserId === 'string' ? a.hostUserId.trim() : '';
  if (!sessionId || !createdAt || !hostUserId) return null;
  const endedAt =
    a.endedAt === null || a.endedAt === undefined
      ? undefined
      : typeof a.endedAt === 'string'
        ? a.endedAt
        : undefined;
  return {
    type: 'async_session',
    sessionId,
    createdAt,
    hostUserId,
    ...(endedAt !== undefined ? { endedAt } : {}),
  };
}
