import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import { useMessageThread } from '@/hooks/useMessageThread';
import {
  useAgentResponseWait,
  type UseAgentResponseWaitResult,
} from '@/hooks/useAgentResponseWait';
import type { MessageRowWithEmbeddedTask } from '@/types/database';

vi.mock('@/hooks/useMessageThread', () => ({
  useMessageThread: vi.fn(),
}));

vi.mock('@/hooks/useAgentResponseWait', () => ({
  useAgentResponseWait: vi.fn(),
}));

vi.mock('@utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/store/userProfileStore', () => ({
  useUserProfileStore: (selector: (s: { profile: { id: string } | null }) => unknown) =>
    selector({ profile: { id: 'user-1' } }),
}));

vi.mock('@/context/WorkspaceSessionContext', () => ({
  useWorkspaceSessionSubject: () => ({ subjectUserId: 'user-1' }),
}));

const chatMessageRowMockCalls: Record<string, unknown>[] = [];

vi.mock('@/components/chat/ChatMessageRow', () => ({
  ChatMessageRow: (props: Record<string, unknown>) => {
    chatMessageRowMockCalls.push(props);
    return <div data-testid="chat-message-row-mock" />;
  },
}));

const lastRichComposerProps = { current: null as Record<string, unknown> | null };

vi.mock('@/components/chat/RichMessageComposer', () => ({
  RichMessageComposer: (props: Record<string, unknown>) => {
    lastRichComposerProps.current = props;
    return (
      <form
        data-testid="rich-composer-mock"
        onSubmit={(e) => {
          e.preventDefault();
          const onSubmit = props.onSubmit as
            | ((p: { text: string; files: File[] }) => void | Promise<void>)
            | undefined;
          void onSubmit?.({ text: 'hello', files: [] });
        }}
      >
        <button type="submit">Send</button>
      </form>
    );
  },
}));

function mockThread(overrides: Partial<ReturnType<typeof useMessageThread>> = {}) {
  const sendMessage = vi
    .fn()
    .mockResolvedValue({ messageId: 'msg-1', createdAt: new Date().toISOString() });
  vi.mocked(useMessageThread).mockReturnValue({
    messages: [],
    userById: {},
    teamMembers: [],
    agentsByAuthUserId: new Map(),
    agentAuthUserIds: [],
    replyCounts: new Map(),
    isLoading: false,
    error: null,
    sending: false,
    sendMessage,
    clearError: vi.fn(),
    setError: vi.fn(),
    silentRefreshMessages: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useMessageThread>);
  return sendMessage;
}

function resetAgentWaitMock() {
  vi.mocked(useAgentResponseWait).mockReset();
  vi.mocked(useAgentResponseWait).mockReturnValue({
    pending: null,
    registerIntent: vi.fn(),
    registerSuccessfulSend: vi.fn(),
    clear: vi.fn(),
  } as UseAgentResponseWaitResult);
}

describe('StandardTaskChatRail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatMessageRowMockCalls.length = 0;
    lastRichComposerProps.current = null;
    resetAgentWaitMock();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders empty transcript without crashing', () => {
    mockThread();
    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug={undefined}
      />,
    );
    expect(screen.getAllByTestId('rich-composer-mock').length).toBeGreaterThan(0);
    expect(useMessageThread).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { scope: 'task', taskId: 'task-1' },
      }),
    );
  });

  it('with defaultAgentSlug undefined: no useAgentResponseWait, no typing indicator, send omits default_agent_slug', async () => {
    const sendMessage = mockThread();
    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug={undefined}
      />,
    );
    expect(vi.mocked(useAgentResponseWait)).not.toHaveBeenCalled();
    expect(screen.queryByTestId('agent-typing-indicator')).toBeNull();
    fireEvent.submit(screen.getAllByTestId('rich-composer-mock')[0]!);
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage.mock.calls[0][3]).toBeUndefined();
  });

  it('with defaultAgentSlug coach: metadata includes default_agent_slug; typing indicator when pending', async () => {
    vi.mocked(useAgentResponseWait).mockReturnValue({
      pending: {
        agentId: 'a1',
        agentSlug: 'coach',
        agentAuthUserId: 'auth-coach',
        displayName: 'Coach',
        avatarUrl: '',
        startedAt: Date.now(),
        failsafeMs: 30000,
      },
      registerIntent: vi.fn(),
      registerSuccessfulSend: vi.fn(),
      clear: vi.fn(),
    } as UseAgentResponseWaitResult);
    const sendMessage = mockThread();
    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
      />,
    );
    expect(vi.mocked(useAgentResponseWait)).toHaveBeenCalled();
    expect(screen.getAllByTestId('agent-typing-indicator').length).toBeGreaterThan(0);
    fireEvent.submit(screen.getAllByTestId('rich-composer-mock')[0]!);
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage.mock.calls[0][3]).toEqual({
      metadata: { default_agent_slug: 'coach' },
    });
  });

  it('composerOverrides.features merges into RichMessageComposer features', () => {
    mockThread();
    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        composerOverrides={{
          features: { enableExerciseHashMentions: true },
        }}
      />,
    );
    expect(lastRichComposerProps.current?.features).toMatchObject({
      enableAtMentions: true,
      enableSlashTaskLinks: false,
      enableExerciseHashMentions: true,
      enableCreateAndAttachCard: false,
      enableStartLiveWorkout: false,
    });
  });

  it('root element has exact layout classes', () => {
    mockThread();
    const { container } = render(
      <StandardTaskChatRail workspaceId="ws-1" taskId="task-1" canPostMessages />,
    );
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    const cls = root!.className;
    expect(cls).toMatch(/\bflex\b/);
    expect(cls).toMatch(/\bh-full\b/);
    expect(cls).toMatch(/\bmin-h-0\b/);
    expect(cls).toMatch(/\bmin-w-0\b/);
    expect(cls).toMatch(/\bflex-col\b/);
    expect(cls).toMatch(/\bbg-background\b/);
  });

  it('transcriptFilter excludes rows before mapping (sentinel not in DOM)', () => {
    const sentinel = '[SYSTEM_EVENT: ONBOARDING_STARTED]';
    const rowSentinel = {
      id: 'sentinel-1',
      user_id: 'user-1',
      content: sentinel,
      created_at: new Date().toISOString(),
      parent_id: null,
      bubble_id: 'b1',
      attached_task_id: null,
      attachments: null,
      metadata: null,
      tasks: null,
    } as unknown as MessageRowWithEmbeddedTask;
    const rowVisible = {
      id: 'msg-visible',
      user_id: 'user-1',
      content: 'hello',
      created_at: new Date().toISOString(),
      parent_id: null,
      bubble_id: 'b1',
      attached_task_id: null,
      attachments: null,
      metadata: null,
      tasks: null,
    } as unknown as MessageRowWithEmbeddedTask;
    mockThread({
      messages: [rowSentinel, rowVisible],
    });
    const { container } = render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        bubbleId="b1"
        transcriptFilter={(row) => row.content !== sentinel}
      />,
    );
    expect(container.querySelector('[data-message-id="sentinel-1"]')).toBeNull();
    expect(container.querySelector('[data-message-id="msg-visible"]')).not.toBeNull();
  });

  it('wraps each transcript row in data-message-id and forwards chatRowExtras to ChatMessageRow', () => {
    const row = {
      id: 'row-1',
      user_id: 'user-1',
      content: 'hi',
      created_at: new Date().toISOString(),
      parent_id: null,
      bubble_id: 'b1',
      attached_task_id: null,
      attachments: null,
      metadata: null,
      tasks: null,
    } as unknown as MessageRowWithEmbeddedTask;
    mockThread({
      messages: [row],
    });
    const onCoachDraftFinalizeSuccess = vi.fn();
    const chatCardWorkoutActions = {
      modalTaskId: 't1',
      onReviewDetails: vi.fn(),
      generateBusy: false,
    };
    const bubbleUpPropsFor = vi.fn();
    const onOpenAttachment = vi.fn();
    const { container } = render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        bubbleId="b1"
        chatRowExtras={{
          onCoachDraftFinalizeSuccess,
          chatCardWorkoutActions,
          bubbleUpPropsFor,
          onOpenAttachment,
        }}
      />,
    );
    const wrap = container.querySelector('[data-message-id="row-1"]');
    expect(wrap).not.toBeNull();
    expect(wrap?.querySelector('[data-testid="chat-message-row-mock"]')).not.toBeNull();
    expect(chatMessageRowMockCalls[0]?.onCoachDraftFinalizeSuccess).toBe(
      onCoachDraftFinalizeSuccess,
    );
    expect(chatMessageRowMockCalls[0]?.chatCardWorkoutActions).toBe(chatCardWorkoutActions);
    expect(chatMessageRowMockCalls[0]?.bubbleUpPropsFor).toBe(bubbleUpPropsFor);
    expect(chatMessageRowMockCalls[0]?.onOpenAttachment).toBe(onOpenAttachment);
  });
});
