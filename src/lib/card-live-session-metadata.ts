import type { Json } from '@/types/database';
import {
  CLASS_DECK_BUILDER_SESSION_PREFIX,
  classDeckBuilderSessionId,
} from '@/lib/fitness/class-deck-builder-session-id';
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
 * Class delivery: **live video** (`metadata.live_session`) and **async / recorded deck**
 * (`metadata.async_session`) are **independent** toggles; both may be enabled at once.
 *
 * - Live uses its own invite `sessionId` + `channelId` for WebRTC.
 * - When async is enabled and `classInstanceId` is known, `async_session.sessionId` is pinned to
 *   `bb-class-deck:<classInstanceId>` (stable namespace for `live_session_deck_items`).
 * - Omit `classInstanceId` on the first create pass before an instance row exists; async metadata
 *   is applied on a follow-up save once the id is known.
 */
export function mergeClassInstanceDeckSessionMetadata(
  metadata: unknown,
  opts: {
    liveEnabled: boolean;
    asyncEnabled: boolean;
    workspaceId: string;
    hostUserId: string | null;
    /** Required to persist `async_session` when async is enabled (after `class_instances` exists). */
    classInstanceId?: string | null;
  },
): Json {
  const liveParsed = parseLiveSessionInviteFromMessageMetadata(metadata);
  const asyncParsed = parseAsyncSessionFromInstanceMetadata(metadata);

  /** Never reuse a class-draft deck id (`bb-class-deck:…`) as the live WebRTC session id. */
  const trimmedLiveSid = liveParsed?.sessionId?.trim() ?? '';
  const liveReuseOnlyInvite =
    trimmedLiveSid.length > 0 && !trimmedLiveSid.startsWith(CLASS_DECK_BUILDER_SESSION_PREFIX)
      ? trimmedLiveSid
      : null;

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

  let next: Record<string, unknown> = { ...base };

  if (opts.liveEnabled && opts.hostUserId) {
    next = mergeJsonWithLiveSessionToggle(next, {
      enabled: true,
      workspaceId: opts.workspaceId,
      hostUserId: opts.hostUserId,
      reuseSessionId: liveReuseOnlyInvite,
    }) as Record<string, unknown>;
  } else {
    next = mergeJsonWithLiveSessionToggle(next, {
      enabled: false,
      workspaceId: opts.workspaceId,
      hostUserId: opts.hostUserId,
    }) as Record<string, unknown>;
  }

  if (opts.asyncEnabled && opts.hostUserId) {
    const cid = opts.classInstanceId?.trim() ?? '';
    if (cid.length > 0) {
      const createdAt =
        typeof asyncParsed?.createdAt === 'string' && asyncParsed.createdAt.length > 0
          ? asyncParsed.createdAt
          : new Date().toISOString();
      next.async_session = {
        type: 'async_session',
        sessionId: classDeckBuilderSessionId(cid),
        createdAt,
        hostUserId: opts.hostUserId,
      };
    } else {
      delete next.async_session;
    }
  } else {
    delete next.async_session;
  }

  return next as Json;
}
