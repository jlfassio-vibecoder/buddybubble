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
const AGENT_SLUG_FALLBACK_ASSETS: Readonly<Record<string, string>> = {
  buddy: '/brand/BuddyBubble-mark.svg',
};

export function resolveAgentAvatar(agent: AgentDefinitionLite): string {
  const direct = agent.avatar_url?.trim();
  if (direct) return direct;

  const branded = AGENT_SLUG_FALLBACK_ASSETS[agent.slug];
  if (branded) return branded;

  return '';
}
