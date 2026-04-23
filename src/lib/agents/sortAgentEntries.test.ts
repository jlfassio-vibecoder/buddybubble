import { describe, expect, it } from 'vitest';
import { sortAgentEntries, UNBOUND_AGENT_SORT_ORDER } from './sortAgentEntries';

describe('sortAgentEntries', () => {
  it('orders by sort_order ascending', () => {
    const input = [
      { sortOrder: 20, def: { slug: 'coach', auth_user_id: 'u-coach' } },
      { sortOrder: 10, def: { slug: 'organizer', auth_user_id: 'u-organizer' } },
      { sortOrder: 30, def: { slug: 'buddy', auth_user_id: 'u-buddy' } },
    ];
    const out = sortAgentEntries(input);
    expect(out.map((e) => e.def.slug)).toEqual(['organizer', 'coach', 'buddy']);
  });

  it('breaks ties by slug alphabetical ascending', () => {
    const input = [
      { sortOrder: 0, def: { slug: 'organizer', auth_user_id: 'u-organizer' } },
      { sortOrder: 0, def: { slug: 'buddy', auth_user_id: 'u-buddy' } },
      { sortOrder: 0, def: { slug: 'coach', auth_user_id: 'u-coach' } },
    ];
    const out = sortAgentEntries(input);
    expect(out.map((e) => e.def.slug)).toEqual(['buddy', 'coach', 'organizer']);
  });

  it('mixes primary and tiebreaker correctly', () => {
    const input = [
      { sortOrder: 10, def: { slug: 'organizer', auth_user_id: 'u-organizer' } },
      { sortOrder: 10, def: { slug: 'coach', auth_user_id: 'u-coach' } },
      { sortOrder: 5, def: { slug: 'zoom', auth_user_id: 'u-zoom' } },
    ];
    const out = sortAgentEntries(input);
    expect(out.map((e) => e.def.slug)).toEqual(['zoom', 'coach', 'organizer']);
  });

  it('sorts workspace-global sentinel last', () => {
    const input = [
      { sortOrder: UNBOUND_AGENT_SORT_ORDER, def: { slug: 'buddy', auth_user_id: 'u-buddy' } },
      { sortOrder: 100, def: { slug: 'coach', auth_user_id: 'u-coach' } },
      { sortOrder: 200, def: { slug: 'organizer', auth_user_id: 'u-organizer' } },
    ];
    const out = sortAgentEntries(input);
    expect(out.map((e) => e.def.slug)).toEqual(['coach', 'organizer', 'buddy']);
  });

  it('does not mutate input', () => {
    const input = [
      { sortOrder: 10, def: { slug: 'b', auth_user_id: 'b' } },
      { sortOrder: 10, def: { slug: 'a', auth_user_id: 'a' } },
    ];
    const snapshot = input.map((e) => e.def.slug);
    sortAgentEntries(input);
    expect(input.map((e) => e.def.slug)).toEqual(snapshot);
  });
});
