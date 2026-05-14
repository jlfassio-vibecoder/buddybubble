import { afterEach, describe, expect, it, vi } from 'vitest';
import { logAgentRoutingEvent } from '@/lib/agents/agentRoutingLogger';

describe('logAgentRoutingEvent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs agent.routing.resolved to console.info with full payload', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logAgentRoutingEvent({
      event: 'agent.routing.resolved',
      agentSlug: 'coach',
      via: 'mention',
      bubbleId: 'b1',
      surface: 'workout-coach-rail',
    });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toBe('[agent-routing]');
    expect(spy.mock.calls[0][1]).toBe('agent.routing.resolved');
    expect(spy.mock.calls[0][2]).toMatchObject({ agentSlug: 'coach', via: 'mention' });
  });

  it('logs agent.routing.unresolved', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logAgentRoutingEvent({
      event: 'agent.routing.unresolved',
      surface: 'chat',
      bubbleId: null,
      hadMention: true,
    });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][1]).toBe('agent.routing.unresolved');
  });

  it('logs agent.response.timeout', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logAgentRoutingEvent({
      event: 'agent.response.timeout',
      agentSlug: 'coach',
      elapsedMs: 12_000,
      configuredFailsafeMs: 30_000,
      bubbleId: 'b2',
      surface: 'workout-coach-rail',
    });
    expect(spy.mock.calls[0][1]).toBe('agent.response.timeout');
  });

  it('logs agent.response.received', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logAgentRoutingEvent({
      event: 'agent.response.received',
      agentSlug: 'coach',
      elapsedMs: 500,
      bubbleId: 'b2',
      surface: 'workout-coach-rail',
    });
    expect(spy.mock.calls[0][1]).toBe('agent.response.received');
  });

  it('logs agent.effect.scanned', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logAgentRoutingEvent({
      event: 'agent.effect.scanned',
      surface: 'task-modal-rail',
      effect: 'task_modal_intake_patch',
      messageId: 'mid-1',
    });
    expect(spy.mock.calls[0][1]).toBe('agent.effect.scanned');
  });
});
