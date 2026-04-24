import type { Json } from '@/types/database';
import {
  parseAsyncSessionFromInstanceMetadata,
  parseLiveSessionInviteFromMessageMetadata,
} from '@/types/live-session-invite';

/**
 * Merges `metadata.live_session` for card-based live video (tasks / class_instances).
 * When `enabled` is false, removes `live_session`. When true, preserves an active
 * (non-ended) invite or mints a new Agora channel id.
 */
export function mergeJsonWithLiveSessionToggle(
  metadata: unknown,
  opts: {
    enabled: boolean;
    workspaceId: string;
    hostUserId: string | null;
    /** When minting a new live invite, reuse this session id (e.g. switching from async deck). */
    reuseSessionId?: string | null;
  },
): Json {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (!opts.enabled) {
    delete base.live_session;
    return base as Json;
  }
  if (!opts.hostUserId) return base as Json;

  const parsed = parseLiveSessionInviteFromMessageMetadata(base);
  const keepExisting =
    parsed &&
    !parsed.endedAt &&
    parsed.sessionId &&
    parsed.channelId &&
    parsed.workspaceId === opts.workspaceId;
  if (keepExisting) {
    base.live_session = parsed;
    return base as Json;
  }

  const trimmedReuse = opts.reuseSessionId?.trim() ?? '';
  const sessionId = trimmedReuse.length > 0 ? trimmedReuse : crypto.randomUUID();
  const shortId = sessionId.replace(/-/g, '').slice(0, 8);
  const channelId = `bb-live-${opts.workspaceId}-${shortId}`;
  base.live_session = {
    type: 'live_session',
    workspaceId: opts.workspaceId,
    sessionId,
    channelId,
    hostUserId: opts.hostUserId,
    mode: 'workout',
    createdAt: new Date().toISOString(),
  };
  return base as Json;
}

/**
 * Mutually exclusive live vs async class deck sessions on `class_instances.metadata`.
 * Preserves a single `sessionId` when toggling between `live_session` and `async_session`
 * so `live_session_deck_items` rows stay attached.
 */
export function mergeClassInstanceDeckSessionMetadata(
  metadata: unknown,
  opts: {
    liveEnabled: boolean;
    asyncEnabled: boolean;
    workspaceId: string;
    hostUserId: string | null;
  },
): Json {
  const liveParsed = parseLiveSessionInviteFromMessageMetadata(metadata);
  const asyncParsed = parseAsyncSessionFromInstanceMetadata(metadata);
  const existingDeckSessionId =
    (liveParsed?.sessionId?.trim() ? liveParsed.sessionId.trim() : '') ||
    (asyncParsed?.sessionId?.trim() ? asyncParsed.sessionId.trim() : '') ||
    '';

  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};

  if (!opts.liveEnabled && !opts.asyncEnabled) {
    delete base.async_session;
    return mergeJsonWithLiveSessionToggle(base, {
      enabled: false,
      workspaceId: opts.workspaceId,
      hostUserId: opts.hostUserId,
    });
  }

  if (opts.liveEnabled && opts.hostUserId) {
    delete base.async_session;
    return mergeJsonWithLiveSessionToggle(base, {
      enabled: true,
      workspaceId: opts.workspaceId,
      hostUserId: opts.hostUserId,
      reuseSessionId: existingDeckSessionId || null,
    });
  }

  /** Async-only path (live off). */
  let next = mergeJsonWithLiveSessionToggle(base, {
    enabled: false,
    workspaceId: opts.workspaceId,
    hostUserId: opts.hostUserId,
  }) as Record<string, unknown>;

  if (opts.asyncEnabled && opts.hostUserId) {
    const sessionId = existingDeckSessionId || crypto.randomUUID();
    next.async_session = {
      type: 'async_session',
      sessionId,
      createdAt: new Date().toISOString(),
      hostUserId: opts.hostUserId,
    };
    return next as Json;
  }

  delete next.async_session;
  return next as Json;
}
