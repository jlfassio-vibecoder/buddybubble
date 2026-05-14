import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';
import { TaskModalChatRailAdapter } from '@/components/modals/task-modal/TaskModalChatRailAdapter';
import type { TaskModalCommentsPanelHandle } from '@/components/modals/task-modal/TaskModalCommentsPanel';
import { useMessageThread } from '@/hooks/useMessageThread';
import { BUDDY_ONBOARDING_SYSTEM_EVENT } from '@/lib/agents/buddy-sentinel';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';

const lastRailProps = { current: null as Record<string, unknown> | null };

vi.mock('@/components/chat/StandardTaskChatRail', () => ({
  StandardTaskChatRail: (props: Record<string, unknown>) => {
    lastRailProps.current = props;
    return <div data-testid="standard-task-chat-rail-mock" />;
  },
}));

vi.mock('@/components/chat/MessageMediaModal', () => ({
  MessageMediaModal: () => <div data-testid="message-media-modal-mock" />,
}));

vi.mock('@/hooks/use-task-bubble-ups', () => ({
  useTaskBubbleUps: () => ({ bubbleUpPropsFor: vi.fn() }),
}));

vi.mock('@/store/userProfileStore', () => ({
  useUserProfileStore: (selector: (s: { profile: { id: string } | null }) => unknown) =>
    selector({ profile: { id: 'user-1' } }),
}));

const upsertMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('@utils/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'user_task_views') {
        return { upsert: upsertMock };
      }
      return { upsert: upsertMock };
    },
  }),
}));

vi.mock('@/hooks/useMessageThread', () => ({
  useMessageThread: vi.fn(),
}));

const buddyAgent: AgentDefinitionLite = {
  id: 'buddy-def',
  slug: 'buddy',
  mention_handle: '@buddy',
  display_name: 'Buddy',
  avatar_url: '',
  auth_user_id: 'auth-buddy',
  response_timeout_ms: 30_000,
};

function baseThreadReturn(overrides: Partial<ReturnType<typeof useMessageThread>> = {}) {
  const sendMessage = vi
    .fn()
    .mockResolvedValue({ messageId: 'm1', createdAt: new Date().toISOString() });
  return {
    messages: [],
    userById: {},
    teamMembers: [],
    agentsByAuthUserId: new Map<string, AgentDefinitionLite>([['auth-buddy', buddyAgent]]),
    agentAuthUserIds: ['auth-buddy'],
    replyCounts: new Map(),
    isLoading: false,
    error: null,
    sending: false,
    sendMessage,
    clearError: vi.fn(),
    setError: vi.fn(),
    silentRefreshMessages: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useMessageThread>;
}

describe('TaskModalChatRailAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastRailProps.current = null;
    vi.mocked(useMessageThread).mockImplementation(() => baseThreadReturn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('exitThread on ref is a no-op', () => {
    const ref = createRef<TaskModalCommentsPanelHandle>();
    render(
      <TaskModalChatRailAdapter
        ref={ref}
        taskId="task-1"
        workspaceId="ws-1"
        bubbles={[]}
        canWrite
      />,
    );
    expect(() => ref.current?.exitThread()).not.toThrow();
  });

  it('calls onThreadViewChange(false) once on mount', () => {
    const onThreadViewChange = vi.fn();
    render(
      <TaskModalChatRailAdapter
        taskId="task-1"
        workspaceId="ws-1"
        bubbles={[]}
        canWrite
        onThreadViewChange={onThreadViewChange}
      />,
    );
    expect(onThreadViewChange).toHaveBeenCalledTimes(1);
    expect(onThreadViewChange).toHaveBeenCalledWith(false);
  });

  it('passes defaultAgentSlug=null, transcriptFilter, and chatRowExtras to StandardTaskChatRail', () => {
    const onCoach = vi.fn();
    const chatCard = { modalTaskId: 't1', onReviewDetails: vi.fn(), generateBusy: false };
    render(
      <TaskModalChatRailAdapter
        taskId="task-1"
        workspaceId="ws-1"
        bubbles={[]}
        canWrite
        taskBubbleIdHint="bubble-hint"
        onCoachDraftFinalizeSuccess={onCoach}
        chatCardWorkoutActions={chatCard}
      />,
    );
    expect(lastRailProps.current?.defaultAgentSlug).toBeNull();
    expect(typeof lastRailProps.current?.transcriptFilter).toBe('function');
    const filter = lastRailProps.current?.transcriptFilter as (row: { content: string }) => boolean;
    expect(filter({ content: BUDDY_ONBOARDING_SYSTEM_EVENT })).toBe(false);
    expect(filter({ content: 'hi' })).toBe(true);
    const extras = lastRailProps.current?.chatRowExtras as Record<string, unknown>;
    expect(extras?.onCoachDraftFinalizeSuccess).toBe(onCoach);
    expect(extras?.chatCardWorkoutActions).toBe(chatCard);
    expect(typeof extras?.bubbleUpPropsFor).toBe('function');
    expect(typeof extras?.onOpenAttachment).toBe('function');
  });

  it('inserts Buddy sentinel when thread empty, canWrite, and buddy agent exists', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValue({ messageId: 'm1', createdAt: new Date().toISOString() });
    vi.mocked(useMessageThread).mockImplementation(() =>
      baseThreadReturn({
        messages: [],
        isLoading: false,
        sendMessage,
        agentsByAuthUserId: new Map([['auth-buddy', buddyAgent]]),
      }),
    );
    render(<TaskModalChatRailAdapter taskId="task-1" workspaceId="ws-1" bubbles={[]} canWrite />);
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(BUDDY_ONBOARDING_SYSTEM_EVENT);
    });
  });

  it('does not insert sentinel when messages already exist', async () => {
    const sendMessage = vi.fn().mockResolvedValue(null);
    vi.mocked(useMessageThread).mockImplementation(() =>
      baseThreadReturn({
        messages: [{ id: 'x' } as never],
        sendMessage,
      }),
    );
    render(<TaskModalChatRailAdapter taskId="task-1" workspaceId="ws-1" bubbles={[]} canWrite />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not insert sentinel when buddy agent is missing', async () => {
    const sendMessage = vi.fn();
    vi.mocked(useMessageThread).mockImplementation(() =>
      baseThreadReturn({
        messages: [],
        agentsByAuthUserId: new Map(),
        sendMessage,
      }),
    );
    render(<TaskModalChatRailAdapter taskId="task-1" workspaceId="ws-1" bubbles={[]} canWrite />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('debounced user_task_views upsert then onMarkedRead', async () => {
    vi.useFakeTimers();
    const onMarkedRead = vi.fn();
    render(
      <TaskModalChatRailAdapter
        taskId="task-1"
        workspaceId="ws-1"
        bubbles={[]}
        canWrite
        onMarkedRead={onMarkedRead}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(upsertMock).toHaveBeenCalled();
    expect(onMarkedRead).toHaveBeenCalled();
  });

  it('passes defaultAgentSlug coach when itemType is task', () => {
    render(
      <TaskModalChatRailAdapter
        taskId="task-1"
        workspaceId="ws-1"
        bubbles={[]}
        canWrite
        itemType="task"
      />,
    );
    expect(lastRailProps.current?.defaultAgentSlug).toBe('coach');
  });

  it('passes defaultAgentSlug null when itemType is class', () => {
    render(
      <TaskModalChatRailAdapter
        taskId="task-1"
        workspaceId="ws-1"
        bubbles={[]}
        canWrite
        itemType="class"
      />,
    );
    expect(lastRailProps.current?.defaultAgentSlug).toBeNull();
  });

  it('updates defaultAgentSlug when itemType changes after mount', () => {
    const { rerender } = render(
      <TaskModalChatRailAdapter
        taskId="task-1"
        workspaceId="ws-1"
        bubbles={[]}
        canWrite
        itemType="task"
      />,
    );
    expect(lastRailProps.current?.defaultAgentSlug).toBe('coach');
    rerender(
      <TaskModalChatRailAdapter
        taskId="task-1"
        workspaceId="ws-1"
        bubbles={[]}
        canWrite
        itemType="class"
      />,
    );
    expect(lastRailProps.current?.defaultAgentSlug).toBeNull();
  });

  it('outer wrapper has flex-1 and min-h-0 and does not use -mx-6', () => {
    const { container } = render(
      <div className="flex h-[600px] flex-col">
        <TaskModalChatRailAdapter taskId="task-1" workspaceId="ws-1" bubbles={[]} canWrite />
      </div>,
    );
    const rail = container.querySelector('[data-testid="standard-task-chat-rail-mock"]');
    expect(rail).toBeTruthy();
    const outer = rail?.parentElement;
    expect(outer?.className).toContain('flex-1');
    expect(outer?.className).toContain('min-h-0');
    expect(outer?.className).not.toContain('-mx-6');
  });
});
