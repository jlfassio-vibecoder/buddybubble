/**
 * Shared structured logger for agent-routing events.
 *
 * Phase 4 deliberately uses `console.info` under a stable `[agent-routing]` prefix so the
 * events can be scraped from browser logs / Vercel output without a shared logger
 * dependency. When the app adopts a structured logger (Datadog, Logtail, etc.), this module
 * is the single swap point — call sites stay unchanged.
 *
 * Events (no message content — the payload is metadata only):
 *   - `agent.routing.resolved`   — resolver returned non-null. Fields: agentSlug, via, bubbleId, surface.
 *   - `agent.routing.unresolved` — resolver returned null; send proceeded anyway. Fields: surface, bubbleId, hadMention.
 *   - `agent.response.timeout`   — per-agent failsafe expired. Fields: agentSlug, elapsedMs, configuredFailsafeMs, bubbleId, surface.
 *   - `agent.response.received`  — target agent replied; pending cleared. Fields: agentSlug, elapsedMs, bubbleId, surface.
 */

export type AgentRoutingSurface =
  | 'chat'
  | 'task-modal-root'
  | 'task-modal-thread'
  | 'thread-panel'
  | 'onboarding-sentinel';

export type AgentRoutingResolvedEvent = {
  event: 'agent.routing.resolved';
  agentSlug: string;
  via: 'mention' | 'default';
  bubbleId: string | null;
  surface: AgentRoutingSurface;
};

export type AgentRoutingUnresolvedEvent = {
  event: 'agent.routing.unresolved';
  surface: AgentRoutingSurface;
  bubbleId: string | null;
  hadMention: boolean;
};

export type AgentResponseTimeoutEvent = {
  event: 'agent.response.timeout';
  agentSlug: string;
  elapsedMs: number;
  configuredFailsafeMs: number;
  bubbleId: string | null;
  surface: AgentRoutingSurface;
};

export type AgentResponseReceivedEvent = {
  event: 'agent.response.received';
  agentSlug: string;
  elapsedMs: number;
  bubbleId: string | null;
  surface: AgentRoutingSurface;
};

export type AgentRoutingEvent =
  | AgentRoutingResolvedEvent
  | AgentRoutingUnresolvedEvent
  | AgentResponseTimeoutEvent
  | AgentResponseReceivedEvent;

const PREFIX = '[agent-routing]';

/**
 * Emits an agent-routing telemetry event. Uses `console.info` so dev tools show it without
 * the "error" styling, and so production log shippers pick it up via stdout.
 */
export function logAgentRoutingEvent(event: AgentRoutingEvent): void {
  // One-call logger so consumers don't end up stringifying fields inconsistently.
  // eslint-disable-next-line no-console
  console.info(PREFIX, event.event, event);
}
