import { describe, expect, it } from 'vitest';
import { resolveTargetAgent, type AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';

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
  mention_handle: 'Coach',
  display_name: 'Coach',
  auth_user_id: 'coach-auth',
});
const buddy = makeAgent({
  id: 'buddy-id',
  slug: 'buddy',
  mention_handle: 'Buddy',
  display_name: 'Buddy',
  auth_user_id: 'buddy-auth',
});
const organizer = makeAgent({
  id: 'organizer-id',
  slug: 'organizer',
  mention_handle: 'Organizer',
  display_name: 'Organizer',
  auth_user_id: 'organizer-auth',
});

const allAgents = [coach, buddy, organizer];

describe('resolveTargetAgent', () => {
  it('resolves @Buddy to the Buddy agent via mention', () => {
    const result = resolveTargetAgent({
      messageDraft: '@Buddy hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'coach',
    });
    expect(result).toEqual({ agent: buddy, via: 'mention' });
  });

  it('is case-insensitive for lowercase mention', () => {
    const result = resolveTargetAgent({
      messageDraft: '@coach hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(result).toEqual({ agent: coach, via: 'mention' });
  });

  it('is case-insensitive for mixed-case mention', () => {
    const result = resolveTargetAgent({
      messageDraft: '@CoAcH hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(result).toEqual({ agent: coach, via: 'mention' });
  });

  it('resolves @Organizer as a first-class agent (not Coach-specific)', () => {
    const result = resolveTargetAgent({
      messageDraft: '@Organizer please schedule something',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'coach',
    });
    expect(result).toEqual({ agent: organizer, via: 'mention' });
  });

  it('falls back to contextDefaultAgentSlug when no mention present (coach)', () => {
    const result = resolveTargetAgent({
      messageDraft: 'hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'coach',
    });
    expect(result).toEqual({ agent: coach, via: 'default' });
  });

  it('falls back to contextDefaultAgentSlug when no mention present (buddy)', () => {
    const result = resolveTargetAgent({
      messageDraft: 'hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'buddy',
    });
    expect(result).toEqual({ agent: buddy, via: 'default' });
  });

  it('returns null when no mention and default is null', () => {
    const result = resolveTargetAgent({
      messageDraft: 'hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(result).toBeNull();
  });

  it('unknown mention falls through to default slug', () => {
    const result = resolveTargetAgent({
      messageDraft: '@unknown hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'coach',
    });
    expect(result).toEqual({ agent: coach, via: 'default' });
  });

  it('unknown mention with null default returns null', () => {
    const result = resolveTargetAgent({
      messageDraft: '@unknown hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(result).toBeNull();
  });

  it('first valid mention wins when multiple agents are mentioned', () => {
    // Documented behavior: `@Buddy @Coach hi` → Buddy (first valid mention).
    const result = resolveTargetAgent({
      messageDraft: '@Buddy @Coach hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'coach',
    });
    expect(result).toEqual({ agent: buddy, via: 'mention' });
  });

  it('skips unknown mentions and takes the next valid one', () => {
    const result = resolveTargetAgent({
      messageDraft: '@unknown @Coach hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(result).toEqual({ agent: coach, via: 'mention' });
  });

  it('does not match email-like substrings (word-boundary before @)', () => {
    const result = resolveTargetAgent({
      messageDraft: 'email me at foo@coach.com',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(result).toBeNull();
  });

  it('scopes @Coach to whichever coach row is in availableAgents (per-bubble / Recipes vs Fitness)', () => {
    const recipesCoach = makeAgent({
      id: 'recipes-coach-id',
      slug: 'coach',
      mention_handle: 'Coach',
      display_name: 'Recipes Coach',
      auth_user_id: 'recipes-coach-auth',
    });
    const result = resolveTargetAgent({
      messageDraft: '@Coach hi',
      availableAgents: [recipesCoach],
      contextDefaultAgentSlug: 'coach',
    });
    expect(result).toEqual({ agent: recipesCoach, via: 'mention' });
  });

  it('returns null when default slug is not in availableAgents', () => {
    const result = resolveTargetAgent({
      messageDraft: 'hi',
      availableAgents: [buddy],
      contextDefaultAgentSlug: 'coach',
    });
    expect(result).toBeNull();
  });

  it('ignores empty drafts and uses default', () => {
    const result = resolveTargetAgent({
      messageDraft: '',
      availableAgents: allAgents,
      contextDefaultAgentSlug: 'buddy',
    });
    expect(result).toEqual({ agent: buddy, via: 'default' });
  });

  it('is safe to call repeatedly without regex state bleed', () => {
    // Guards against the classic `/g` lastIndex bug when a module-level regex is reused.
    const first = resolveTargetAgent({
      messageDraft: '@Buddy hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    const second = resolveTargetAgent({
      messageDraft: '@Buddy hi',
      availableAgents: allAgents,
      contextDefaultAgentSlug: null,
    });
    expect(first).toEqual(second);
    expect(first).toEqual({ agent: buddy, via: 'mention' });
  });
});
