/** Wall-clock ms when the sender committed this transition (client clock in v1). */
export type AuthoritativeTimestampMs = number;

export type SharedTimerAction = 'START' | 'PAUSE' | 'RESET' | 'SYNC_REQUEST' | 'SYNC_RESPONSE';

export type SharedTimerBroadcastPayload =
  | {
      action: 'START';
      authoritativeTimestamp: AuthoritativeTimestampMs;
      senderId: string;
      generation: number;
      segmentStartedAt: AuthoritativeTimestampMs;
      accumulatedMsBeforeSegment: number;
    }
  | {
      action: 'PAUSE';
      authoritativeTimestamp: AuthoritativeTimestampMs;
      senderId: string;
      generation: number;
      accumulatedMsAtPause: number;
    }
  | {
      action: 'RESET';
      authoritativeTimestamp: AuthoritativeTimestampMs;
      senderId: string;
      generation: number;
      nextGeneration: number;
    }
  | {
      action: 'SYNC_REQUEST';
      authoritativeTimestamp: AuthoritativeTimestampMs;
      senderId: string;
      requestId?: string;
    }
  | {
      action: 'SYNC_RESPONSE';
      authoritativeTimestamp: AuthoritativeTimestampMs;
      senderId: string;
      generation: number;
      isRunning: boolean;
      segmentStartedAt: AuthoritativeTimestampMs | null;
      accumulatedMsBeforeSegment: number;
      snapshotHostNow: AuthoritativeTimestampMs;
    };

/** Ref-backed model exposed to UI for rAF extrapolation (no per-ms React updates in the hook). */
export type SharedTimerSnapshot = {
  generation: number;
  isRunning: boolean;
  /** Elapsed ms accumulated before the current running segment (frozen while paused). */
  accumulatedMs: number;
  /** Host-aligned wall clock ms when the current segment started; null if paused. */
  segmentStartedAt: number | null;
  /** `hostNow - localNow` from the last `SYNC_RESPONSE`; host keeps 0. */
  epochOffsetMs: number;
};

export type SharedTimerConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Narrow an untyped Realtime broadcast payload to `SharedTimerBroadcastPayload`, or null if invalid.
 */
// Copilot suggestion ignored: dedicated parsing/math tests will be added in a follow-up PR (keeping this PR scoped).
export function parseSharedTimerBroadcastPayload(raw: unknown): SharedTimerBroadcastPayload | null {
  if (!isRecord(raw)) return null;
  const action = raw.action;
  if (
    action !== 'START' &&
    action !== 'PAUSE' &&
    action !== 'RESET' &&
    action !== 'SYNC_REQUEST' &&
    action !== 'SYNC_RESPONSE'
  ) {
    return null;
  }
  const authoritativeTimestamp = raw.authoritativeTimestamp;
  const senderId = raw.senderId;
  if (
    !isFiniteNumber(authoritativeTimestamp) ||
    typeof senderId !== 'string' ||
    senderId.length === 0
  ) {
    return null;
  }

  if (action === 'START') {
    const generation = raw.generation;
    const segmentStartedAt = raw.segmentStartedAt;
    const accumulatedMsBeforeSegment = raw.accumulatedMsBeforeSegment;
    if (
      !isFiniteNumber(generation) ||
      !isFiniteNumber(segmentStartedAt) ||
      !isFiniteNumber(accumulatedMsBeforeSegment)
    ) {
      return null;
    }
    return {
      action: 'START',
      authoritativeTimestamp,
      senderId,
      generation,
      segmentStartedAt,
      accumulatedMsBeforeSegment,
    };
  }

  if (action === 'PAUSE') {
    const generation = raw.generation;
    const accumulatedMsAtPause = raw.accumulatedMsAtPause;
    if (!isFiniteNumber(generation) || !isFiniteNumber(accumulatedMsAtPause)) return null;
    return {
      action: 'PAUSE',
      authoritativeTimestamp,
      senderId,
      generation,
      accumulatedMsAtPause,
    };
  }

  if (action === 'RESET') {
    const generation = raw.generation;
    const nextGeneration = raw.nextGeneration;
    if (!isFiniteNumber(generation) || !isFiniteNumber(nextGeneration)) return null;
    return {
      action: 'RESET',
      authoritativeTimestamp,
      senderId,
      generation,
      nextGeneration,
    };
  }

  if (action === 'SYNC_REQUEST') {
    if (raw.requestId !== undefined && typeof raw.requestId !== 'string') return null;
    return {
      action: 'SYNC_REQUEST',
      authoritativeTimestamp,
      senderId,
      ...(typeof raw.requestId === 'string' ? { requestId: raw.requestId } : {}),
    };
  }

  if (action === 'SYNC_RESPONSE') {
    const generation = raw.generation;
    const isRunning = raw.isRunning;
    const segmentStartedAt = raw.segmentStartedAt;
    const accumulatedMsBeforeSegment = raw.accumulatedMsBeforeSegment;
    const snapshotHostNow = raw.snapshotHostNow;
    if (
      !isFiniteNumber(generation) ||
      typeof isRunning !== 'boolean' ||
      !(segmentStartedAt === null || isFiniteNumber(segmentStartedAt)) ||
      !isFiniteNumber(accumulatedMsBeforeSegment) ||
      !isFiniteNumber(snapshotHostNow)
    ) {
      return null;
    }
    return {
      action: 'SYNC_RESPONSE',
      authoritativeTimestamp,
      senderId,
      generation,
      isRunning,
      segmentStartedAt,
      accumulatedMsBeforeSegment,
      snapshotHostNow,
    };
  }

  return null;
}

/**
 * Elapsed ms at local wall time `localNowMs`, using a snapshot from {@link useSharedTimerSync.getSnapshot}.
 * v1 clock sync: offset comes from `SYNC_RESPONSE.snapshotHostNow`; not NTP-grade.
 */
export function computeElapsedMs(localNowMs: number, s: SharedTimerSnapshot): number {
  const effectiveNow = localNowMs + s.epochOffsetMs;
  const segment =
    s.isRunning && s.segmentStartedAt != null ? Math.max(0, effectiveNow - s.segmentStartedAt) : 0;
  return s.accumulatedMs + segment;
}
