/**
 * Integration-ish tests for `useAgentResponseWait` that exercise the React layer.
 *
 * These close the Phase 2 deviation (failsafe-timer expiry was only tested at the pure
 * helper layer because `@testing-library/react` was not yet a repo dependency). Option B
 * from the Phase 3 task spec: `renderHook` + `vi.useFakeTimers()`, no Playwright.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentResponseWait, type AgentWaitMessageSlice } from '@/hooks/useAgentResponseWait';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import type { SendMessageSuccess } from '@/hooks/useMessageThread';

function makeAgent(overrides: Partial<AgentDefinitionLite> = {}): AgentDefinitionLite {
  return {
    id: 'coach-id',
    slug: 'coach',
    mention_handle: 'Coach',
    display_name: 'Coach',
    avatar_url: 'https://cdn.example/coach.png',
    auth_user_id: 'coach-auth',
    response_timeout_ms: 15_000,
    ...overrides,
  };
}

const MY_USER_ID = 'user-me';
const EMPTY_AGENTS_MAP = new Map<string, AgentDefinitionLite>();

describe('useAgentResponseWait — React integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears `pending` automatically when the agent-specific failsafe expires', () => {
    const agent = makeAgent({ response_timeout_ms: 15_000 });
    const { result } = renderHook(() =>
      useAgentResponseWait({
        messages: [],
        myUserId: MY_USER_ID,
        agentsByAuthUserId: EMPTY_AGENTS_MAP,
      }),
    );

    act(() => {
      result.current.registerIntent(agent);
    });
    expect(result.current.pending?.agentSlug).toBe('coach');
    expect(result.current.pending?.failsafeMs).toBe(15_000);

    // Just under the failsafe: still pending.
    act(() => {
      vi.advanceTimersByTime(14_999);
    });
    expect(result.current.pending).not.toBeNull();

    // Cross the boundary: failsafe fires, pending clears.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.pending).toBeNull();
  });

  it('uses per-agent `response_timeout_ms` — slower agent stays pending longer', () => {
    const slowAgent = makeAgent({ response_timeout_ms: 60_000, slug: 'organizer' });
    const { result } = renderHook(() =>
      useAgentResponseWait({
        messages: [],
        myUserId: MY_USER_ID,
        agentsByAuthUserId: EMPTY_AGENTS_MAP,
      }),
    );

    act(() => {
      result.current.registerIntent(slowAgent);
    });
    expect(result.current.pending?.failsafeMs).toBe(60_000);

    // 30s elapsed — a 15s failsafe would have fired but this one shouldn't.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.pending).not.toBeNull();

    // Full 60s.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.pending).toBeNull();
  });

  it('re-arms the timer when a new intent lands (last-write-wins)', () => {
    const first = makeAgent({ response_timeout_ms: 10_000, slug: 'coach' });
    const second = makeAgent({
      id: 'buddy-id',
      slug: 'buddy',
      mention_handle: 'Buddy',
      display_name: 'Buddy',
      auth_user_id: 'buddy-auth',
      response_timeout_ms: 20_000,
    });

    const { result } = renderHook(() =>
      useAgentResponseWait({
        messages: [],
        myUserId: MY_USER_ID,
        agentsByAuthUserId: EMPTY_AGENTS_MAP,
      }),
    );

    act(() => {
      result.current.registerIntent(first);
    });

    // 8s into first's 10s timer — re-register for second.
    act(() => {
      vi.advanceTimersByTime(8_000);
      result.current.registerIntent(second);
    });
    expect(result.current.pending?.agentSlug).toBe('buddy');

    // Another 10s — the ORIGINAL 10s timer would have fired 8s ago, but second's 20s is
    // still running. Pending must persist.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.pending?.agentSlug).toBe('buddy');

    // 10s more (20s total since the second intent) — second's failsafe fires.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.pending).toBeNull();
  });

  it('`clear()` cancels the pending timer', () => {
    const agent = makeAgent({ response_timeout_ms: 15_000 });
    const { result } = renderHook(() =>
      useAgentResponseWait({
        messages: [],
        myUserId: MY_USER_ID,
        agentsByAuthUserId: EMPTY_AGENTS_MAP,
      }),
    );

    act(() => {
      result.current.registerIntent(agent);
      result.current.clear();
    });
    expect(result.current.pending).toBeNull();

    // Make sure no stray timer resurrects pending.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.pending).toBeNull();
  });

  it('clears pending when a message from the target agent arrives (identity-bleed fix)', () => {
    const agent = makeAgent({ response_timeout_ms: 30_000, auth_user_id: 'coach-auth' });

    let messages: AgentWaitMessageSlice[] = [];
    const { result, rerender } = renderHook(
      (current: AgentWaitMessageSlice[]) =>
        useAgentResponseWait({
          messages: current,
          myUserId: MY_USER_ID,
          agentsByAuthUserId: EMPTY_AGENTS_MAP,
        }),
      { initialProps: messages },
    );

    const sent: SendMessageSuccess = {
      messageId: 'sent-1',
      createdAt: new Date('2026-04-22T10:00:00Z').toISOString(),
    };

    act(() => {
      result.current.registerSuccessfulSend(sent, agent);
    });
    expect(result.current.pending).not.toBeNull();

    // A reply from ANOTHER user must NOT clear pending.
    messages = [{ id: 'm1', user_id: 'other-user', created_at: '2026-04-22T10:00:05Z' }];
    rerender(messages);
    expect(result.current.pending).not.toBeNull();

    // A reply from the TARGET agent, after startedAt, clears pending.
    messages = [
      ...messages,
      { id: 'm2', user_id: 'coach-auth', created_at: '2026-04-22T10:00:10Z' },
    ];
    rerender(messages);
    expect(result.current.pending).toBeNull();
  });

  it('send-fail: registerIntent fires, registerSuccessfulSend never does → pending clears at response_timeout_ms (not earlier)', () => {
    // Simulates the send mutation rejecting after intent. Callers that forget to call
    // `registerIntent` would see `pending === null` immediately; callers that only call
    // `registerIntent` (send later fails) see pending live until the failsafe.
    const agent = makeAgent({ response_timeout_ms: 15_000 });
    const { result } = renderHook(() =>
      useAgentResponseWait({
        messages: [],
        myUserId: MY_USER_ID,
        agentsByAuthUserId: EMPTY_AGENTS_MAP,
      }),
    );

    act(() => {
      result.current.registerIntent(agent);
    });
    expect(result.current.pending?.agentSlug).toBe('coach');

    // No registerSuccessfulSend call (simulates send promise rejecting).
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.pending).not.toBeNull();

    // Full failsafe window elapses — pending clears.
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.pending).toBeNull();
  });

  it('onExpire callback fires with elapsed + configured failsafe when the timer fires', () => {
    const agent = makeAgent({ response_timeout_ms: 15_000 });
    const onExpire = vi.fn();

    const { result } = renderHook(() =>
      useAgentResponseWait({
        messages: [],
        myUserId: MY_USER_ID,
        agentsByAuthUserId: EMPTY_AGENTS_MAP,
        callbacks: { onExpire },
      }),
    );

    act(() => {
      result.current.registerIntent(agent);
    });
    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith(
      expect.objectContaining({
        agentSlug: 'coach',
        configuredFailsafeMs: 15_000,
      }),
    );
    const elapsed = (onExpire.mock.calls[0][0] as { elapsedMs: number }).elapsedMs;
    expect(elapsed).toBeGreaterThanOrEqual(15_000);
  });

  it('onReceived callback fires when the target agent replies', () => {
    const agent = makeAgent({ response_timeout_ms: 30_000, auth_user_id: 'coach-auth' });
    const onReceived = vi.fn();

    let messages: AgentWaitMessageSlice[] = [];
    const { result, rerender } = renderHook(
      (current: AgentWaitMessageSlice[]) =>
        useAgentResponseWait({
          messages: current,
          myUserId: MY_USER_ID,
          agentsByAuthUserId: EMPTY_AGENTS_MAP,
          callbacks: { onReceived },
        }),
      { initialProps: messages },
    );

    act(() => {
      result.current.registerIntent(agent);
    });

    messages = [{ id: 'm-coach', user_id: 'coach-auth', created_at: new Date().toISOString() }];
    rerender(messages);

    expect(onReceived).toHaveBeenCalledTimes(1);
    expect(onReceived).toHaveBeenCalledWith(expect.objectContaining({ agentSlug: 'coach' }));
  });
});
