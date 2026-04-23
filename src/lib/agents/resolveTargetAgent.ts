/**
 * Pure, agent-agnostic resolver that turns a composer draft + surface context into a target
 * agent (if any). Owned by the refactor described in `docs/refactor/agent-routing-audit.md`.
 *
 * Rules (see `docs/refactor/agent-routing-audit.md` → "Target architecture → Pure resolver"):
 *   1. Parse `@<handle>` mentions case-insensitively from `messageDraft` (word-boundary before
 *      the `@`, word-boundary after the handle). First mention that matches a known agent wins.
 *   2. If no mention matches, fall back to `contextDefaultAgentSlug` — but only if that slug is
 *      actually present in `availableAgents`.
 *   3. Otherwise, return null.
 *
 * Important: `@Buddy @Coach hi` → Buddy (first mention wins). This is documented explicitly so
 * the server-side dispatch stays consistent with the client-side UI affordance.
 */

export type AgentDefinitionLite = {
  id: string;
  slug: string;
  mention_handle: string;
  display_name: string;
  avatar_url: string | null;
  auth_user_id: string;
  response_timeout_ms: number;
};

export type ResolveTargetAgentInput = {
  messageDraft: string;
  availableAgents: AgentDefinitionLite[];
  contextDefaultAgentSlug: string | null;
};

export type ResolveResult = { agent: AgentDefinitionLite; via: 'mention' | 'default' } | null;

/**
 * Matches `@handle` where `@` is preceded by start-of-string or a non-word character
 * (so `foo@coach.com` does NOT match) and the handle is followed by a non-word boundary.
 */
const MENTION_REGEX = /(^|[^\w])@(\w+)(?!\w)/g;

export function resolveTargetAgent(input: ResolveTargetAgentInput): ResolveResult {
  const { messageDraft, availableAgents, contextDefaultAgentSlug } = input;

  if (typeof messageDraft === 'string' && messageDraft.length > 0) {
    // `RegExp` is stateful across `exec` calls; build a fresh one per call to stay re-entrant.
    const re = new RegExp(MENTION_REGEX.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(messageDraft)) !== null) {
      const handle = match[2];
      if (!handle) continue;
      const handleLower = handle.toLowerCase();
      const hit = availableAgents.find((a) => a.mention_handle.toLowerCase() === handleLower);
      if (hit) return { agent: hit, via: 'mention' };
    }
  }

  if (contextDefaultAgentSlug) {
    const def = availableAgents.find((a) => a.slug === contextDefaultAgentSlug);
    if (def) return { agent: def, via: 'default' };
  }

  return null;
}
