import { describe, expect, it } from 'vitest';
import {
  buildPendingFromIntent,
  buildPendingFromSend,
  shouldClearPendingFromMessages,
  type AgentWaitMessageSlice,
  type PendingAgentResponse,
} from '@/hooks/useAgentResponseWait';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';

function makeAgent(overrides: Partial<AgentDefinitionLite>): AgentDefinitionLite {
  return {
    id: 'agent-id',
    slug: 'coach',
    mention_handle: 'Coach',
    display_name: 'Coach',
    avatar_url: null,
    auth_user_id: 'auth-user-id',
    response_timeout_ms: 30_000,
    ...overrides,
  };
}

const coach = makeAgent({
  id: 'coach-id',
  slug: 'coach',
  display_name: 'Coach',
  auth_user_id: 'coach-auth',
  avatar_url: 'https://cdn.example/coach.png',
  response_timeout_ms: 15_000,
});
const buddy = makeAgent({
  id: 'buddy-id',
  slug: 'buddy',
  display_name: 'Buddy',
  auth_user_id: 'buddy-auth',
  response_timeout_ms: 30_000,
});

function msg(id: string, user_id: string, createdAtIso: string): AgentWaitMessageSlice {
  return { id, user_id, created_at: createdAtIso };
}

describe('buildPendingFromIntent', () => {
  it('populates every field from the agent and the provided clock', () => {
    const now = Date.UTC(2026, 5, 1, 12, 0, 0);
    const pending = buildPendingFromIntent(coach, now);
    expect(pending).toEqual<PendingAgentResponse>({
      agentId: 'coach-id',
      agentSlug: 'coach',
      agentAuthUserId: 'coach-auth',
      displayName: 'Coach',
      avatarUrl: 'https://cdn.example/coach.png',
      startedAt: now,
      failsafeMs: 15_000,
    });
  });

  it('uses the branded Buddy fallback when avatar_url is null', () => {
    const pending = buildPendingFromIntent(buddy, 1_000);
    expect(pending.avatarUrl).toBe('/brand/BuddyBubble-mark.svg');
    expect(pending.failsafeMs).toBe(30_000);
  });
});

describe('buildPendingFromSend', () => {
  it('uses the server-provided createdAt as startedAt', () => {
    const createdAtIso = '2026-06-01T12:00:00Z';
    const pending = buildPendingFromSend({ messageId: 'msg-1', createdAt: createdAtIso }, coach);
    expect(pending.startedAt).toBe(new Date(createdAtIso).getTime());
    expect(pending.agentAuthUserId).toBe('coach-auth');
  });
});

describe('shouldClearPendingFromMessages', () => {
  const intentAt = Date.UTC(2026, 5, 1, 12, 0, 0);
  const pending: PendingAgentResponse = buildPendingFromIntent(coach, intentAt);

  it('clears when a message from the target agent arrives at/after intent', () => {
    const messages: AgentWaitMessageSlice[] = [
      msg('m1', 'coach-auth', new Date(intentAt + 500).toISOString()),
    ];
    expect(shouldClearPendingFromMessages(pending, messages)).toBe(true);
  });

  it('does NOT clear when a different agent replies (the identity-bleed fix)', () => {
    // Scenario that used to trigger the bug: intent on Buddy, but Coach posts before Buddy
    // responds. Pending must remain because the pending agent (Coach here) hasn't replied.
    const buddyPending = buildPendingFromIntent(buddy, intentAt);
    const messages: AgentWaitMessageSlice[] = [
      msg('m1', 'coach-auth', new Date(intentAt + 500).toISOString()),
    ];
    expect(shouldClearPendingFromMessages(buddyPending, messages)).toBe(false);
  });

  it('ignores messages from the target agent that pre-date intent', () => {
    const messages: AgentWaitMessageSlice[] = [
      msg('m1', 'coach-auth', new Date(intentAt - 1_000).toISOString()),
    ];
    expect(shouldClearPendingFromMessages(pending, messages)).toBe(false);
  });

  it('ignores messages from other users entirely', () => {
    const messages: AgentWaitMessageSlice[] = [
      msg('m1', 'user-1', new Date(intentAt + 2_000).toISOString()),
      msg('m2', 'user-2', new Date(intentAt + 3_000).toISOString()),
    ];
    expect(shouldClearPendingFromMessages(pending, messages)).toBe(false);
  });

  it('is tolerant of invalid ISO timestamps', () => {
    const messages: AgentWaitMessageSlice[] = [
      { id: 'm1', user_id: 'coach-auth', created_at: 'not-a-date' },
      msg('m2', 'coach-auth', new Date(intentAt + 1_000).toISOString()),
    ];
    expect(shouldClearPendingFromMessages(pending, messages)).toBe(true);
  });

  it('returns false when target agent message is earlier than intent and later one is peer', () => {
    // Ordering edge case: agent's old message + peer's new message → still should NOT clear.
    const messages: AgentWaitMessageSlice[] = [
      msg('m1', 'coach-auth', new Date(intentAt - 5_000).toISOString()),
      msg('m2', 'user-1', new Date(intentAt + 5_000).toISOString()),
    ];
    expect(shouldClearPendingFromMessages(pending, messages)).toBe(false);
  });

  it('handles registerSuccessfulSend ordering — sent message itself never clears pending', () => {
    // After `registerSuccessfulSend`, `startedAt` equals the sent message's timestamp. A new
    // message from the pending agent that happens to share that exact timestamp would clear;
    // a message from the SENDING user at the same timestamp should not (different user_id).
    const sentAt = '2026-06-01T12:00:00Z';
    const sendPending = buildPendingFromSend({ messageId: 'outbound', createdAt: sentAt }, coach);
    const ownMessages: AgentWaitMessageSlice[] = [msg('outbound', 'current-user', sentAt)];
    expect(shouldClearPendingFromMessages(sendPending, ownMessages)).toBe(false);

    const agentMessages: AgentWaitMessageSlice[] = [
      msg('outbound', 'current-user', sentAt),
      msg('reply', 'coach-auth', '2026-06-01T12:00:02Z'),
    ];
    expect(shouldClearPendingFromMessages(sendPending, agentMessages)).toBe(true);
  });
});

describe('last-write-wins semantics (hook-level contract, exercised via helpers)', () => {
  it('re-intent for a different agent swaps pending identity', () => {
    // A new intent for a different agent produces a completely independent pending object.
    const coachPending = buildPendingFromIntent(coach, 1_000);
    const buddyPending = buildPendingFromIntent(buddy, 2_000);
    expect(coachPending.agentAuthUserId).not.toBe(buddyPending.agentAuthUserId);
    expect(buddyPending.startedAt).toBeGreaterThan(coachPending.startedAt);
  });
});
