import type {
  SessionPhase,
  SessionState,
  SessionStatus,
} from '@/features/live-video/state/sessionStateMachine';

export const SESSION_STATE_BROADCAST_EVENT = 'STATE_BROADCAST' as const;
export const SESSION_SYNC_REQUEST_EVENT = 'SYNC_REQUEST' as const;

const PHASES: SessionPhase[] = ['lobby', 'warmup', 'amrap', 'tabata'];
const STATUSES: SessionStatus[] = ['idle', 'running', 'paused'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNullableNumber(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
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
  return {
    phase: phase as SessionPhase,
    status: status as SessionStatus,
    globalStartedAt: raw.globalStartedAt,
    blockStartedAt: raw.blockStartedAt,
    blockPausedAt: raw.blockPausedAt,
  };
}

export type SessionStateBroadcastPayload = {
  state: SessionState;
  senderId: string;
};

export function parseSessionStateBroadcastPayload(
  raw: unknown,
): SessionStateBroadcastPayload | null {
  if (!isRecord(raw)) return null;
  const senderId = raw.senderId;
  if (typeof senderId !== 'string' || senderId.length === 0) return null;
  const state = parseSessionState(raw.state);
  if (!state) return null;
  return { state, senderId };
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
