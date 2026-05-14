import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useBuddyOnboardingSentinel } from '@/components/modals/task-modal/hooks/useBuddyOnboardingSentinel';
import { BUDDY_ONBOARDING_SYSTEM_EVENT } from '@/lib/agents/buddy-sentinel';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';

function Harness(props: Parameters<typeof useBuddyOnboardingSentinel>[0]) {
  useBuddyOnboardingSentinel(props);
  return null;
}

const buddyAgent: AgentDefinitionLite = {
  id: 'b1',
  slug: 'buddy',
  mention_handle: '@buddy',
  display_name: 'Buddy',
  avatar_url: '',
  auth_user_id: 'auth-buddy',
  response_timeout_ms: 30_000,
};

describe('useBuddyOnboardingSentinel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends sentinel once when thread empty, writable, buddy present', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    render(
      <Harness
        taskId="t1"
        canWrite
        isLoading={false}
        messagesLength={0}
        buddyAgent={buddyAgent}
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(sendMessage).toHaveBeenCalledWith(BUDDY_ONBOARDING_SYSTEM_EVENT);
  });

  it('does not send when messages exist', async () => {
    const sendMessage = vi.fn();
    render(
      <Harness
        taskId="t1"
        canWrite
        isLoading={false}
        messagesLength={1}
        buddyAgent={buddyAgent}
        sendMessage={sendMessage}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
