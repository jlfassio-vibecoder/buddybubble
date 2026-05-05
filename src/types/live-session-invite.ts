import type { Json } from '@/types/database';

export type LiveSessionInviteMode = 'workout';

/** Stored under `messages.metadata.live_session` for chat-based live video invites. */
export type LiveSessionInvitePayload = {
  type: 'live_session';
  workspaceId: string;
  sessionId: string;
  channelId: string;
  hostUserId: string;
  mode: LiveSessionInviteMode;
  createdAt: string;
  /** When set, host ended the session; recipients disable Join. */
  endedAt?: string | null;
};

export function parseLiveSessionInviteFromMessageMetadata(
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

export function liveSessionInviteMetadataToJson(invite: LiveSessionInvitePayload): Json {
  return JSON.parse(JSON.stringify({ live_session: invite })) as Json;
}

/** Stored under `class_instances.metadata.async_session` for deck-only (no Agora) sessions. */
export type AsyncSessionPayload = {
  type: 'async_session';
  sessionId: string;
  createdAt: string;
  hostUserId: string;
  /** Reserved for parity with live_session; unset for active async decks. */
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

/** Stored under `class_instances.metadata.class_recording` (manual upload + future Agora auto-attach). */
export type ClassRecordingStatus = 'processing' | 'ready' | 'failed';

export type ClassRecordingPayload = {
  type: 'class_recording';
  status: ClassRecordingStatus;
  /** Track 1 (Agora) vs Track 2 (manual editor upload). */
  provider?: 'agora' | 'manual';
  /**
   * Object path inside the `class-recordings` storage bucket (`{workspace_id}/{instance_id}/...`).
   * Preferred for new uploads; playback uses a fresh signed URL at read time.
   */
  storagePath?: string;
  /**
   * Direct playback URL (legacy rows, public CDN, or Agora callback). Optional when `storagePath` is set.
   */
  playbackUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string;
};

export function parseClassRecordingFromInstanceMetadata(
  metadata: unknown,
): ClassRecordingPayload | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const o = metadata as Record<string, unknown>;
  const raw = o.class_recording;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'class_recording') return null;

  const playbackUrlRaw = typeof r.playbackUrl === 'string' ? r.playbackUrl.trim() : '';
  const storagePathRaw = typeof r.storagePath === 'string' ? r.storagePath.trim() : '';

  const statusRaw = r.status;
  let status: ClassRecordingStatus;
  if (statusRaw === 'processing') {
    status = 'processing';
  } else if (statusRaw === 'failed') {
    status = 'failed';
  } else if (statusRaw === 'ready') {
    status = 'ready';
  } else if (playbackUrlRaw) {
    /** Legacy: only `playbackUrl` — treat as ready. */
    status = 'ready';
  } else {
    return null;
  }

  if (status === 'ready' && !playbackUrlRaw && !storagePathRaw) {
    return null;
  }

  const createdAt =
    r.createdAt === null || r.createdAt === undefined
      ? undefined
      : typeof r.createdAt === 'string'
        ? r.createdAt
        : undefined;
  const updatedAt =
    r.updatedAt === null || r.updatedAt === undefined
      ? undefined
      : typeof r.updatedAt === 'string'
        ? r.updatedAt
        : undefined;
  const errorMessage =
    r.errorMessage === null || r.errorMessage === undefined
      ? undefined
      : typeof r.errorMessage === 'string'
        ? r.errorMessage
        : undefined;

  const providerRaw = r.provider;
  const provider = providerRaw === 'agora' || providerRaw === 'manual' ? providerRaw : undefined;

  return {
    type: 'class_recording',
    status,
    ...(provider ? { provider } : {}),
    ...(playbackUrlRaw ? { playbackUrl: playbackUrlRaw } : {}),
    ...(storagePathRaw ? { storagePath: storagePathRaw } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(errorMessage !== undefined ? { errorMessage } : {}),
  };
}
