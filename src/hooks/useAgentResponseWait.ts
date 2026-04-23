'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveAgentAvatar } from '@/lib/agents/resolveAgentAvatar';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import type { SendMessageSuccess } from '@/hooks/useMessageThread';

/**
 * Message shape needed by this hook. Matches the subset of `MessageRow` that matters for
 * identity-checking the sender ("was this the agent we were waiting for?") — no content, no
 * metadata. Callers can hand us any superset.
 */
export type AgentWaitMessageSlice = {
  id: string;
  user_id: string;
  created_at: string;
  parent_id?: string | null;
};

export type PendingAgentResponse = {
  agentId: string;
  agentSlug: string;
  agentAuthUserId: string;
  displayName: string;
  /** Resolved via `resolveAgentAvatar` — may be the agent's `avatar_url`, a branded fallback, or `''`. */
  avatarUrl: string;
  /** Epoch ms used both for the failsafe timer and for "is this a post-intent message?" checks. */
  startedAt: number;
  /** Per-agent timeout in ms — sourced from `agent_definitions.response_timeout_ms`. */
  failsafeMs: number;
};

export type UseAgentResponseWaitInput = {
  messages: AgentWaitMessageSlice[];
  myUserId: string | null | undefined;
  agentsByAuthUserId: Map<string, AgentDefinitionLite>;
};

export type UseAgentResponseWaitResult = {
  pending: PendingAgentResponse | null;
  /** Optimistic "user intends to send" — immediately arms the failsafe timer. */
  registerIntent(agent: AgentDefinitionLite): void;
  /** After a successful server send — re-arms the failsafe with the server timestamp as start. */
  registerSuccessfulSend(sent: SendMessageSuccess, agent: AgentDefinitionLite): void;
  clear(): void;
};

// ---------------------------------------------------------------------------
// Pure helpers — exported so unit tests exercise them without a React renderer.
// The hook is a thin wrapper that composes these with `useState` / `useRef` /
// `useEffect`. If you change semantics, change the helpers; the hook follows.
// ---------------------------------------------------------------------------

export function buildPendingFromIntent(
  agent: AgentDefinitionLite,
  now: number,
): PendingAgentResponse {
  return {
    agentId: agent.id,
    agentSlug: agent.slug,
    agentAuthUserId: agent.auth_user_id,
    displayName: agent.display_name,
    avatarUrl: resolveAgentAvatar(agent),
    startedAt: now,
    failsafeMs: agent.response_timeout_ms,
  };
}

export function buildPendingFromSend(
  sent: SendMessageSuccess,
  agent: AgentDefinitionLite,
): PendingAgentResponse {
  return buildPendingFromIntent(agent, new Date(sent.createdAt).getTime());
}

/**
 * Returns true iff any message from the target agent's `auth_user_id` has arrived at or after
 * the pending indicator's `startedAt`. This is the identity-bleed fix: pending clears ONLY when
 * the specific agent replies — not when "anyone but me" replies.
 */
export function shouldClearPendingFromMessages(
  pending: PendingAgentResponse,
  messages: AgentWaitMessageSlice[],
): boolean {
  for (const m of messages) {
    if (m.user_id !== pending.agentAuthUserId) continue;
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= pending.startedAt) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Agent-agnostic pending-response tracker. Tracks at most one pending agent response at a
 * time in a given surface/scope (root feed, thread panel, task comments…).
 *
 * Semantics (see `docs/refactor/agent-routing-audit.md`):
 *   - `registerIntent` / `registerSuccessfulSend` set `pending` and arm a per-agent failsafe.
 *   - `pending` clears when a message from `pending.agentAuthUserId` arrives after `startedAt`.
 *   - `pending` clears on failsafe expiry, `clear()`, or a new intent for a different agent
 *     (last-write-wins).
 *   - `myUserId` and `agentsByAuthUserId` are retained in the input so downstream phases
 *     (realtime dedupe, unexpected-agent detection) can extend without breaking callers.
 */
export function useAgentResponseWait(input: UseAgentResponseWaitInput): UseAgentResponseWaitResult {
  const { messages } = input;
  // Currently unused; see JSDoc. Touched explicitly to make the intent clear and to avoid
  // accidental "unused import" churn if a reviewer removes them.
  void input.myUserId;
  void input.agentsByAuthUserId;

  const [pending, setPending] = useState<PendingAgentResponse | null>(null);
  const failsafeRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const clearFailsafe = useCallback(() => {
    if (failsafeRef.current != null) {
      globalThis.clearTimeout(failsafeRef.current);
      failsafeRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    clearFailsafe();
    setPending(null);
  }, [clearFailsafe]);

  const armFailsafe = useCallback(
    (failsafeMs: number) => {
      clearFailsafe();
      failsafeRef.current = globalThis.setTimeout(() => {
        failsafeRef.current = null;
        setPending(null);
      }, failsafeMs);
    },
    [clearFailsafe],
  );

  const registerIntent = useCallback(
    (agent: AgentDefinitionLite) => {
      const next = buildPendingFromIntent(agent, Date.now());
      setPending(next);
      armFailsafe(next.failsafeMs);
    },
    [armFailsafe],
  );

  const registerSuccessfulSend = useCallback(
    (sent: SendMessageSuccess, agent: AgentDefinitionLite) => {
      const next = buildPendingFromSend(sent, agent);
      setPending(next);
      armFailsafe(next.failsafeMs);
    },
    [armFailsafe],
  );

  useEffect(() => () => clearFailsafe(), [clearFailsafe]);

  useEffect(() => {
    if (!pending) return;
    if (shouldClearPendingFromMessages(pending, messages)) {
      clear();
    }
  }, [messages, pending, clear]);

  return { pending, registerIntent, registerSuccessfulSend, clear };
}
