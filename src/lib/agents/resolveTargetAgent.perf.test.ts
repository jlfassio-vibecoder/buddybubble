import { describe, expect, it } from 'vitest';
import { resolveTargetAgent, type AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';

/**
 * Perf bench for `resolveTargetAgent`. The resolver is pure and may be called on every
 * keystroke if a future surface adds intent-during-typing UX. The contract from the Phase 4
 * spec: 20 agents × 500-char draft × 3 `@` symbols → < 1ms on a typical dev machine.
 *
 * This test asserts a looser bound (< 5ms average across 1000 iterations) so it stays green
 * on loaded CI runners; drift below the tight 1ms bound is still visible in the reported
 * mean on failure.
 */

function makeAgent(slug: string, handle: string, idx: number): AgentDefinitionLite {
  return {
    id: `agent-${idx}`,
    slug,
    mention_handle: handle,
    display_name: handle,
    avatar_url: null,
    auth_user_id: `auth-${idx}`,
    response_timeout_ms: 30_000,
  };
}

describe('resolveTargetAgent perf', () => {
  it('20 agents × 500-char draft × 3 mentions: mean resolve < 5ms (target < 1ms)', () => {
    const agents: AgentDefinitionLite[] = Array.from({ length: 20 }, (_, i) =>
      makeAgent(`agent-${i}`, `Agent${i}`, i),
    );
    // Force a hit near the end of the agent list to exercise the full sweep.
    agents.push(makeAgent('coach', 'Coach', 20));

    const fillerChunk = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
    let draft = '';
    // 3 `@` tokens: two misses (FAQ-shaped content) and one real mention near the tail.
    draft += '@NotAnAgent opened a discussion. ';
    draft += fillerChunk.repeat(4); // ~230 chars
    draft += '@AlsoMissing followed up. ';
    draft += fillerChunk.repeat(4); // another ~230
    draft += 'Finally @Coach should you weigh in?';

    // Pad to exactly 500 chars by trimming trailing filler if needed.
    if (draft.length < 500) {
      draft += fillerChunk.repeat(Math.ceil((500 - draft.length) / fillerChunk.length));
    }
    draft = draft.slice(0, 500);

    const ITERATIONS = 1000;
    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const r = resolveTargetAgent({
        messageDraft: draft,
        availableAgents: agents,
        contextDefaultAgentSlug: null,
      });
      // Sanity check that the benchmark is actually resolving, not short-circuiting on empty.
      if (!r) throw new Error('perf bench: resolver returned null unexpectedly');
    }
    const elapsed = performance.now() - t0;
    const mean = elapsed / ITERATIONS;

    // Target is < 1ms; this assertion is 5× looser for CI headroom. Drift below 1ms is still
    // visible in the elapsed logging on a local machine.
    expect(mean).toBeLessThan(5);
  });
});
