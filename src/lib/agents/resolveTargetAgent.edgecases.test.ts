import { describe, expect, it } from 'vitest';
import { resolveTargetAgent, type AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';

/**
 * Phase 4 edge-case coverage for `resolveTargetAgent`. Pairs with `resolveTargetAgent.test.ts`
 * (Phase 2/3) and asserts behavior documented in `docs/refactor/agent-routing-audit.md`.
 *
 * The "first match wins" ordering is documented directly on the resolver JSDoc —
 * `@Buddy @Coach hi` → Buddy. Server-side dispatch stays consistent with this rule.
 */

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

const coach = makeAgent({ id: 'coach-id', slug: 'coach', mention_handle: 'Coach' });
const buddy = makeAgent({ id: 'buddy-id', slug: 'buddy', mention_handle: 'Buddy' });
const organizer = makeAgent({
  id: 'organizer-id',
  slug: 'organizer',
  mention_handle: 'Organizer',
});
const allAgents = [coach, buddy, organizer];

describe('resolveTargetAgent edge cases (Phase 4)', () => {
  it('user deletes @Buddy mid-compose: resolver falls back to default Coach (no Buddy intent)', () => {
    // Simulates: type "@Buddy hi" → delete "@Buddy " → send "hi".
    const result = resolveTargetAgent({
      messageDraft: 'hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'coach',
    });
    expect(result?.agent).toEqual(coach);
    expect(result?.via).toBe('default');
  });

  it('@Buddy @Coach hi → Buddy (first match wins; documented on resolver JSDoc)', () => {
    const result = resolveTargetAgent({
      messageDraft: '@Buddy @Coach hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'coach',
    });
    expect(result).toEqual({ agent: buddy, via: 'mention' });
  });

  it('@Coach @Buddy hi → Coach (first match wins even when default is Coach)', () => {
    const result = resolveTargetAgent({
      messageDraft: '@Coach @Buddy hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'coach',
    });
    expect(result).toEqual({ agent: coach, via: 'mention' });
  });

  it('@Buddy. trailing period matches (word boundary on handle end)', () => {
    const result = resolveTargetAgent({
      messageDraft: 'hi @Buddy.',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(result).toEqual({ agent: buddy, via: 'mention' });
  });

  it('email me at foo@coach.com → no match (Phase 3 regression guard)', () => {
    const result = resolveTargetAgent({
      messageDraft: 'email me at foo@coach.com',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(result).toBeNull();
  });

  it('@BuddyBubble → no match (longer handle is not a word-boundary hit for @Buddy)', () => {
    const result = resolveTargetAgent({
      messageDraft: '@BuddyBubble hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(result).toBeNull();
  });

  it('two mentions in a thread reply: first match wins (thread parity with root)', () => {
    // Thread gating is identical to root — this is the contract that lets the server-side
    // dispatcher stay consistent with the client-side typing indicator.
    const result = resolveTargetAgent({
      messageDraft: '@Organizer @Coach can you weigh in?',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'coach',
    });
    expect(result).toEqual({ agent: organizer, via: 'mention' });
  });

  it('unknown mention + default is unavailable → null', () => {
    const result = resolveTargetAgent({
      messageDraft: '@Ghost hi',
      availableAgents: [buddy],
      contextDefaultAgentSlug: 'coach', // coach not in availableAgents
    });
    expect(result).toBeNull();
  });

  it('whitespace-only draft with no default → null', () => {
    const result = resolveTargetAgent({
      messageDraft: '   ',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(result).toBeNull();
  });
});
