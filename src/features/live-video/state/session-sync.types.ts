import type {
  SessionPhase,
  SessionAspectRatioId,
  SessionState,
  SessionStatus,
} from '@/features/live-video/state/sessionStateMachine';

export const SESSION_STATE_BROADCAST_EVENT = 'STATE_BROADCAST' as const;
export const SESSION_SYNC_REQUEST_EVENT = 'SYNC_REQUEST' as const;

const PHASES: SessionPhase[] = ['lobby', 'warmup', 'amrap', 'tabata'];
const STATUSES: SessionStatus[] = ['idle', 'running', 'paused'];
const ASPECT_RATIOS: SessionAspectRatioId[] = ['16:9', '9:16', '1:1'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNullableNumber(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Non-empty string UUID / id from broadcast; null when absent or cleared. */
function parseActiveDeckItemId(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function parseAspectRatio(raw: unknown): SessionAspectRatioId {
  return typeof raw === 'string' && ASPECT_RATIOS.includes(raw as SessionAspectRatioId)
    ? (raw as SessionAspectRatioId)
    : '16:9';
}

export function parseSessionState(raw: unknown): SessionState | null {
  if (!isRecord(raw)) return null;
  const phase = raw.phase;
  const status = raw.status;
  if (typeof phase !== 'string' || !PHASES.includes(phase as SessionPhase)) return null;
  if (typeof status !== 'string' || !STATUSES.includes(status as SessionStatus)) return null;
  if (!isNullableNumber(raw.globalStartedAt)) return null;
  if (!isNullableNumber(raw.blockStartedAt)) return null;
  if (!isNullableNumber(raw.blockPausedAt)) return null;
  const generation = raw.generation;
  if (generation !== undefined && !isFiniteNumber(generation)) return null;
  return {
    phase: phase as SessionPhase,
    status: status as SessionStatus,
    globalStartedAt: raw.globalStartedAt,
    blockStartedAt: raw.blockStartedAt,
    blockPausedAt: raw.blockPausedAt,
    aspectRatio: parseAspectRatio(raw.aspectRatio),
    activeDeckItemId: parseActiveDeckItemId(raw.activeDeckItemId),
    generation: typeof generation === 'number' ? generation : 0,
  };
}

export type SessionStateBroadcastPayload = {
  state: SessionState;
  senderId: string;
  /** Host wall clock time when the sender committed this broadcast (ms). */
  hostNow?: number;
};

export function parseSessionStateBroadcastPayload(
  raw: unknown,
): SessionStateBroadcastPayload | null {
  if (!isRecord(raw)) return null;
  const senderId = raw.senderId;
  if (typeof senderId !== 'string' || senderId.length === 0) return null;
  const state = parseSessionState(raw.state);
  if (!state) return null;
  const hostNow = raw.hostNow;
  if (hostNow !== undefined && !isFiniteNumber(hostNow)) return null;
  return { state, senderId, ...(typeof hostNow === 'number' ? { hostNow } : {}) };
}

export type SessionSyncRequestPayload = {
  senderId: string;
  requestId: string;
};

export function parseSessionSyncRequestPayload(raw: unknown): SessionSyncRequestPayload | null {
  if (!isRecord(raw)) return null;
  const senderId = raw.senderId;
  const requestId = raw.requestId;
  if (typeof senderId !== 'string' || senderId.length === 0) return null;
  if (typeof requestId !== 'string' || requestId.length === 0) return null;
  return { senderId, requestId };
}
