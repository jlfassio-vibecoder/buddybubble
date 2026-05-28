/**
 * Type-import smoke test for the consolidated agent-dispatcher contract.
 *
 * The point of this test is the FILE-LEVEL imports + the trivial typed const below: if
 * any of the following break, `pnpm test` (and `pnpm lint` via `tsc --noEmit`) will fail
 * before the contract reaches Phase 2:
 *
 *   - the mirror at `src/lib/agents/_shared/dispatch/types.ts` is missing a symbol the
 *     phase doc requires,
 *   - the mirror's import path to `_shared/llm/types.ts` cannot be resolved by Vitest's
 *     bundler-mode resolver,
 *   - a future edit narrows a field in a way `CoachLikeStrategy` (defined inline below)
 *     no longer satisfies.
 *
 * This file intentionally has no behavioral assertions beyond `expect(true).toBe(true)`.
 */

import { describe, expect, it } from 'vitest';

import type {
  AgentStrategy,
  DispatchContext,
  HistoryRow,
  NormalizedMessage,
  PreflightAction,
  ResolvedAgent,
  RoutingDescriptor,
} from './types';

describe('AgentStrategy contract (mirror)', () => {
  it('compiles a minimal strategy that satisfies the interface', () => {
    type ParsedReply = { replyText: string };

    const routing: RoutingDescriptor = {
      acceptMention: true,
      acceptRootDefault: true,
      acceptThreadContinuation: true,
      requireBubbleBinding: false,
    };

    const minimal: AgentStrategy<ParsedReply> = {
      slug: 'smoke',
      model: 'gemini-2.5-flash',
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseSchema: {
        type: 'OBJECT',
        properties: {
          reply_content: { type: 'STRING' },
        },
        required: ['reply_content'],
      },
      buildSystemPrompt: async (_ctx: DispatchContext) => 'you are a smoke test',
      buildContents: async (_ctx: DispatchContext) => [{ role: 'user', parts: [{ text: 'hi' }] }],
      parse: (json: unknown): ParsedReply => {
        const obj = json as { reply_content?: string };
        return { replyText: typeof obj?.reply_content === 'string' ? obj.reply_content : '' };
      },
      persist: async (_parsed, _ctx) => ({ ok: true }),
      routing,
      safeReplyText: 'I had a hiccup; try again?',
    };

    const sampleMessage: NormalizedMessage = {
      id: '00000000-0000-0000-0000-000000000001',
      bubble_id: '00000000-0000-0000-0000-000000000002',
      user_id: '00000000-0000-0000-0000-000000000003',
      parent_id: null,
      target_task_id: null,
      attached_task_id: null,
      content: 'hi',
      created_at: new Date().toISOString(),
      metadata: null,
    };

    const sampleAgent: ResolvedAgent = {
      slug: 'smoke',
      auth_user_id: '00000000-0000-0000-0000-000000000004',
      mention_handle: 'smoke',
      display_name: 'Smoke',
    };

    const sampleHistory: HistoryRow[] = [];

    const samplePreflightAction: PreflightAction = {
      kind: 'skip',
      reason: 'no-op smoke',
    };

    // Exercise the Phase 2 optional `extras` field at type-check time. Strategies are
    // expected to namespace by their slug (e.g. `extras.coach = { ... }`).
    const sampleContext: DispatchContext = {
      // Structural SupabaseClient placeholder; tests never invoke its methods.
      supabase: {
        rpc: async () => ({ data: null, error: null }),
        from: () => ({}),
      },
      requestId: 'req-smoke',
      message: sampleMessage,
      agent: sampleAgent,
      threadId: sampleMessage.id,
      history: sampleHistory,
      signal: new AbortController().signal,
      workspaceId: null,
      extras: { smoke: { calls: 0 } },
    };

    expect(minimal.slug).toBe('smoke');
    expect(samplePreflightAction.kind).toBe('skip');
    expect(sampleMessage.id).toBeDefined();
    expect(sampleAgent.slug).toBe('smoke');
    expect(Array.isArray(sampleHistory)).toBe(true);
    expect(routing.acceptMention).toBe(true);
    expect(sampleContext.extras?.smoke).toBeDefined();
  });
});
