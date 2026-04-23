import { describe, expect, it } from 'vitest';
import { resolveAgentAvatar } from '@/lib/agents/resolveAgentAvatar';
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

describe('resolveAgentAvatar', () => {
  it('prefers agent.avatar_url when set', () => {
    const agent = makeAgent({ avatar_url: 'https://cdn.example/coach.png', slug: 'coach' });
    expect(resolveAgentAvatar(agent)).toBe('https://cdn.example/coach.png');
  });

  it('ignores empty / whitespace avatar_url and falls through to branded fallback', () => {
    const agent = makeAgent({ avatar_url: '   ', slug: 'buddy' });
    expect(resolveAgentAvatar(agent)).toBe('/brand/BuddyBubble-mark.svg');
  });

  it('returns the branded Buddy mark when no avatar_url is set', () => {
    const agent = makeAgent({ avatar_url: null, slug: 'buddy' });
    expect(resolveAgentAvatar(agent)).toBe('/brand/BuddyBubble-mark.svg');
  });

  it('returns the branded Coach mark when no avatar_url is set', () => {
    const agent = makeAgent({ avatar_url: null, slug: 'coach' });
    expect(resolveAgentAvatar(agent)).toBe('/brand/BuddyBubble-Coach-mark.svg');
  });

  it('returns the branded Organizer mark when no avatar_url is set', () => {
    const agent = makeAgent({ avatar_url: null, slug: 'organizer' });
    expect(resolveAgentAvatar(agent)).toBe('/brand/BuddyBubble-Organizer-mark.svg');
  });

  it('returns empty string for an unknown slug without avatar_url', () => {
    const agent = makeAgent({ avatar_url: null, slug: 'future-unknown-agent' });
    expect(resolveAgentAvatar(agent)).toBe('');
  });

  it('prefers avatar_url over the branded fallback when both would apply', () => {
    const agent = makeAgent({ avatar_url: 'https://cdn.example/buddy.png', slug: 'buddy' });
    expect(resolveAgentAvatar(agent)).toBe('https://cdn.example/buddy.png');
  });
});
