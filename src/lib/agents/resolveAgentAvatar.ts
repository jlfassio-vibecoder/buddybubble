import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';

/**
 * The ONLY place in the codebase allowed to know about branded agent assets.
 *
 * Rules (per `docs/refactor/agent-routing-audit.md` → "Unified avatar resolver"):
 *   1. If `agent.avatar_url` is set in `agent_definitions`, prefer that.
 *   2. Otherwise, look up a branded fallback by `agent.slug`.
 *   3. If neither is available, return `''` so the consumer can render a text letter fallback.
 *
 * Both `AgentTypingIndicator` and the chat feed row (`chat-message-mapper`) consume this. No
 * other file should import from `/brand/**` for agents.
 */
/**
 * Per-slug branded fallbacks. These should match the canonical paths seeded into
 * `agent_definitions.avatar_url` by Phase 4's swap migration
 * (`supabase/migrations/20260723120000_swap_coach_organizer_avatars.sql`) so the fallback
 * branch renders the same mark a new row would render today. `avatar_url` is NOT NULL in the
 * DB (see `20260722140000_agent_definitions_avatar_url_not_null.sql`), so this map is only
 * exercised for bespoke callers that build an `AgentDefinitionLite` with `avatar_url = null`
 * (e.g. synthetic fixtures) — but we keep it in sync so there is one less surprise when that
 * branch fires.
 */
const AGENT_SLUG_FALLBACK_ASSETS: Readonly<Record<string, string>> = {
  buddy: '/brand/BuddyBubble-mark.svg',
  coach: '/brand/BuddyBubble-Coach-mark.svg',
  organizer: '/brand/BuddyBubble-Organizer-mark.svg',
};

export function resolveAgentAvatar(agent: AgentDefinitionLite): string {
  const direct = agent.avatar_url?.trim();
  if (direct) return direct;

  const branded = AGENT_SLUG_FALLBACK_ASSETS[agent.slug];
  if (branded) return branded;

  return '';
}
