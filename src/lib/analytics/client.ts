'use client';

/**
 * Growth Engine — browser-side event tracking client.
 *
 * Usage:
 *   import { track } from '@/lib/analytics/client';
 *   track('feature_gate_hit', { workspace_id, metadata: { feature_name: 'ai', user_status: 'trialing' } });
 *
 * Features:
 * - Session ID: UUID in sessionStorage, rotates on 30 min inactivity
 * - Batches events for 2 s then flushes
 * - Flushes on visibilitychange → 'hidden' using sendBeacon when possible (tab close)
 * - Fire-and-forget: errors are swallowed; analytics must never affect the user
 */

import type { AnalyticsEventPayload, EventType } from './types';

// ── Session management ────────────────────────────────────────────────────────

const SESSION_KEY = 'bb_analytics_session_id';
const SESSION_TS_KEY = 'bb_analytics_session_ts';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getSessionId(): string {
  if (typeof sessionStorage === 'undefined') return generateId();

  const existing = sessionStorage.getItem(SESSION_KEY);
  const lastTs = parseInt(sessionStorage.getItem(SESSION_TS_KEY) ?? '0', 10);
  const now = Date.now();

  // Rotate if session expired (30 min inactivity)
  if (!existing || now - lastTs > SESSION_TIMEOUT_MS) {
    const newId = generateId();
    sessionStorage.setItem(SESSION_KEY, newId);
    sessionStorage.setItem(SESSION_TS_KEY, String(now));
    return newId;
  }

  // Refresh activity timestamp
  sessionStorage.setItem(SESSION_TS_KEY, String(now));
  return existing;
}

// ── Batch queue ───────────────────────────────────────────────────────────────

type QueuedEvent = AnalyticsEventPayload & {
  _ts: number; // client-side timestamp for ordering
};

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityListenerAttached = false;

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 2000);
}

function cancelFlush() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function batchJson(batch: QueuedEvent[]): string {
  return JSON.stringify({
    events: batch.map((ev) => {
      const { _ts, ...rest } = ev;
      return rest;
    }),
  });
}

/** Chromium caps keepalive request bodies (~64KiB); WebKit often throws TypeError "network error" on keepalive. */
const KEEPALIVE_MAX_BYTES = 60_000;

async function flush(options?: { unload?: boolean }) {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  const body = batchJson(batch);

  try {
    if (options?.unload && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/analytics/event', blob)) {
        return;
      }
    }

    const useKeepalive =
      Boolean(options?.unload) && body.length > 0 && body.length < KEEPALIVE_MAX_BYTES;

    await fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(useKeepalive ? { keepalive: true } : {}),
      body,
    });
  } catch {
    // Silently swallow — analytics must never break the app
  }
}

function attachVisibilityListener() {
  if (visibilityListenerAttached || typeof document === 'undefined') return;
  visibilityListenerAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cancelFlush();
      void flush({ unload: true });
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TrackFields {
  workspace_id?: string | null;
  user_id?: string | null;
  lead_id?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Queue a client-side analytics event.
 * Call from React components and hooks — safe to call during render via useEffect.
 */
export function track(eventType: EventType, fields: TrackFields = {}): void {
  if (typeof window === 'undefined') return; // server-side: no-op

  attachVisibilityListener();

  const sessionId = getSessionId();
  const path = fields.path ?? (typeof window !== 'undefined' ? window.location.pathname : null);

  queue.push({
    event_type: eventType,
    workspace_id: fields.workspace_id ?? null,
    user_id: fields.user_id ?? null,
    lead_id: fields.lead_id ?? null,
    session_id: sessionId,
    path,
    metadata: fields.metadata ?? {},
    _ts: Date.now(),
  });

  scheduleFlush();
}

/** Immediately flush any queued events. */
export function flushAnalytics(): Promise<void> {
  cancelFlush();
  return flush();
}
