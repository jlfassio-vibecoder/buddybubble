import type { AgentEffectTelemetryEvent } from '@/components/chat/agent-effects/types';
import type { AgentRoutingEvent } from '@/lib/agents/agentRoutingLogger';

const SURFACE = 'task-modal-rail' as const;

/** Maps rail-local agent-effect telemetry to `logAgentRoutingEvent` payloads. */
export function mapAgentEffectTelemetryToRouting(e: AgentEffectTelemetryEvent): AgentRoutingEvent {
  switch (e.kind) {
    case 'effect.scanned':
      return {
        event: 'agent.effect.scanned',
        surface: SURFACE,
        effect: e.effect,
        messageId: e.messageId,
      };
    case 'effect.parse_dropped':
      return {
        event: 'agent.effect.parse_dropped',
        surface: SURFACE,
        effect: e.effect,
        messageId: e.messageId,
        reason: e.reason,
      };
    case 'effect.applied':
      return {
        event: 'agent.effect.applied',
        surface: SURFACE,
        effect: e.effect,
        messageId: e.messageId,
      };
  }
}
