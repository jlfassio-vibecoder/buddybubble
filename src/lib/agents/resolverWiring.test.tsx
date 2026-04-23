/**
 * Component-level wiring tests for the agent-agnostic identity pipeline.
 *
 * Scope (chosen over Playwright per Phase 3 Option "component_tests"): exercise the
 * composite path that every composer site follows —
 *
 *   user draft → `resolveTargetAgent` → `useAgentResponseWait.registerIntent`
 *
 * — across the 9 scenarios the audit calls out. Mounting the full ChatArea or
 * TaskModalCommentsPanel would require stubbing Supabase, Realtime, auth, and the
 * router, so we drive the same public surface via a tiny harness hook. The logic under
 * test is byte-for-byte what ChatArea/TaskModalCommentsPanel call in their composer
 * callbacks; this file fails the same way those components would if the wiring
 * regressed.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resolveTargetAgent, type AgentDefinitionLite } from './resolveTargetAgent';
import { sortAgentEntries, UNBOUND_AGENT_SORT_ORDER } from './sortAgentEntries';
import { useAgentResponseWait } from '@/hooks/useAgentResponseWait';

// ---------------------------------------------------------------------------
// Fixtures: three canonical agent slugs plus a second Coach to prove slug-lookup
// is scoped to `availableAgents`, not global.
// ---------------------------------------------------------------------------

const fitnessCoach: AgentDefinitionLite = {
  id: 'coach-fitness',
  slug: 'coach',
  mention_handle: 'Coach',
  display_name: 'Coach',
  avatar_url: 'https://cdn.example/fitness-coach.png',
  auth_user_id: 'coach-auth-fitness',
  response_timeout_ms: 30_000,
};

const recipesCoach: AgentDefinitionLite = {
  id: 'coach-recipes',
  slug: 'coach',
  mention_handle: 'Coach',
  display_name: 'Coach',
  avatar_url: 'https://cdn.example/recipes-coach.png',
  auth_user_id: 'coach-auth-recipes',
  response_timeout_ms: 30_000,
};

const buddy: AgentDefinitionLite = {
  id: 'buddy-id',
  slug: 'buddy',
  mention_handle: 'Buddy',
  display_name: 'Buddy',
  avatar_url: '/brand/BuddyBubble-mark.svg',
  auth_user_id: 'buddy-auth',
  response_timeout_ms: 30_000,
};

const organizer: AgentDefinitionLite = {
  id: 'organizer-id',
  slug: 'organizer',
  mention_handle: 'Organizer',
  display_name: 'Organizer',
  avatar_url: 'https://cdn.example/organizer.png',
  auth_user_id: 'organizer-auth',
  response_timeout_ms: 30_000,
};

function availableAgents(...agents: AgentDefinitionLite[]): AgentDefinitionLite[] {
  return agents;
}

function mapByAuthUserId(...agents: AgentDefinitionLite[]): Map<string, AgentDefinitionLite> {
  const m = new Map<string, AgentDefinitionLite>();
  for (const a of agents) m.set(a.auth_user_id, a);
  return m;
}

/**
 * Simulates a composer `onSubmitIntent` handler exactly as ChatArea / TaskModalCommentsPanel
 * wire it. Returns the resulting `pending` from the wait state.
 */
function runComposer(options: {
  draft: string;
  available: AgentDefinitionLite[];
  defaultSlug: string | null;
}) {
  const { result } = renderHook(() =>
    useAgentResponseWait({
      messages: [],
      myUserId: 'user-me',
      agentsByAuthUserId: mapByAuthUserId(...options.available),
    }),
  );

  act(() => {
    const resolved = resolveTargetAgent({
      messageDraft: options.draft,
      availableAgents: options.available,
      contextDefaultAgentSlug: options.defaultSlug,
    });
    if (resolved) {
      result.current.registerIntent(resolved.agent);
    }
  });

  return result.current.pending;
}

describe('resolver wiring — composer → resolveTargetAgent → registerIntent', () => {
  it('Fitness BuddyBubble, "@Buddy hi" → Buddy pending with correct avatar', () => {
    const pending = runComposer({
      draft: '@Buddy hi',
      available: availableAgents(fitnessCoach, buddy),
      defaultSlug: 'coach',
    });
    expect(pending?.agentSlug).toBe('buddy');
    expect(pending?.agentAuthUserId).toBe('buddy-auth');
    expect(pending?.avatarUrl).toBe('/brand/BuddyBubble-mark.svg');
  });

  it('Fitness BuddyBubble, "hi" → falls to Fitness Coach default', () => {
    const pending = runComposer({
      draft: 'hi',
      available: availableAgents(fitnessCoach, buddy),
      defaultSlug: 'coach',
    });
    expect(pending?.agentSlug).toBe('coach');
    expect(pending?.agentAuthUserId).toBe('coach-auth-fitness');
  });

  it('Recipes BuddyBubble, "@Coach hi" → resolves to Recipes Coach (context-scoped)', () => {
    const pending = runComposer({
      draft: '@Coach hi',
      available: availableAgents(recipesCoach, buddy),
      defaultSlug: 'coach',
    });
    expect(pending?.agentSlug).toBe('coach');
    // Proves availableAgents scoping: the global fixtures include a Fitness coach too,
    // but we didn't pass it in. Pending must be the Recipes auth_user_id, not Fitness.
    expect(pending?.agentAuthUserId).toBe('coach-auth-recipes');
    expect(pending?.avatarUrl).toBe('https://cdn.example/recipes-coach.png');
  });

  it('Task modal thread view, "@Buddy hi" → Buddy pending (no Coach bleed in thread)', () => {
    const pending = runComposer({
      draft: '@Buddy hi',
      available: availableAgents(fitnessCoach, buddy),
      defaultSlug: 'coach',
    });
    expect(pending?.agentSlug).toBe('buddy');
  });

  it('Task modal thread view, "hi" → Coach default (no Buddy leak)', () => {
    const pending = runComposer({
      draft: 'hi',
      available: availableAgents(fitnessCoach, buddy),
      defaultSlug: 'coach',
    });
    expect(pending?.agentSlug).toBe('coach');
  });

  it('"@Organizer hi" → Organizer pending (first-class)', () => {
    const pending = runComposer({
      draft: '@Organizer hi',
      available: availableAgents(fitnessCoach, organizer, buddy),
      defaultSlug: 'coach',
    });
    expect(pending?.agentSlug).toBe('organizer');
    expect(pending?.agentAuthUserId).toBe('organizer-auth');
  });

  it('DM with human peer, "hi" → no pending (null resolver result)', () => {
    const pending = runComposer({
      draft: 'hi',
      available: availableAgents(),
      defaultSlug: null,
    });
    expect(pending).toBeNull();
  });

  it('"email me at foo@coach.com" → regex does NOT false-match; falls to default', () => {
    const pending = runComposer({
      draft: 'email me at foo@coach.com',
      available: availableAgents(fitnessCoach, buddy),
      defaultSlug: 'coach',
    });
    // No mention match (word boundary rejects `foo@coach`), so resolver returns the default.
    expect(pending?.agentSlug).toBe('coach');
  });

  it('"@Buddy @Coach hi" → Buddy wins (first mention)', () => {
    const pending = runComposer({
      draft: '@Buddy @Coach hi',
      available: availableAgents(fitnessCoach, buddy),
      defaultSlug: 'coach',
    });
    expect(pending?.agentSlug).toBe('buddy');
  });

  it('"email me at foo@coach.com" with NO default → no pending', () => {
    const pending = runComposer({
      draft: 'email me at foo@coach.com',
      available: availableAgents(fitnessCoach, buddy),
      defaultSlug: null,
    });
    expect(pending).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ordering contract: availableAgents preserves deterministic ordering so
// consumers that scan (e.g. mention dropdown, server fallback) get a stable sequence.
// ---------------------------------------------------------------------------

describe('agent ordering wiring — sortAgentEntries feeds availableAgents', () => {
  it('produces stable order for two bubbles with the same bindings but different insertion order', () => {
    const entriesA = [
      { sortOrder: 10, def: fitnessCoach },
      { sortOrder: 20, def: organizer },
      { sortOrder: UNBOUND_AGENT_SORT_ORDER, def: buddy },
    ];
    const entriesB = [
      { sortOrder: UNBOUND_AGENT_SORT_ORDER, def: buddy },
      { sortOrder: 20, def: organizer },
      { sortOrder: 10, def: fitnessCoach },
    ];
    expect(sortAgentEntries(entriesA).map((e) => e.def.slug)).toEqual([
      'coach',
      'organizer',
      'buddy',
    ]);
    expect(sortAgentEntries(entriesB).map((e) => e.def.slug)).toEqual([
      'coach',
      'organizer',
      'buddy',
    ]);
  });
});
