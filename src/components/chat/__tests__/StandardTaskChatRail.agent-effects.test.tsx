import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import { useMessageThread } from '@/hooks/useMessageThread';
import {
  useAgentResponseWait,
  type UseAgentResponseWaitResult,
} from '@/hooks/useAgentResponseWait';
import type { MessageRowWithEmbeddedTask } from '@/types/database';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';

vi.mock('@/hooks/useMessageThread', () => ({
  useMessageThread: vi.fn(),
}));

vi.mock('@/hooks/useAgentResponseWait', () => ({
  useAgentResponseWait: vi.fn(),
}));

vi.mock('@/hooks/useExerciseDictionaryAutocomplete', () => ({
  useExerciseDictionaryAutocomplete: vi.fn(() => ({
    rows: [
      { id: 'dict-1', name: 'Bench Press', slug: 'bench-press', status: 'published' as const },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
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

vi.mock('@/components/chat/ChatMessageRow', () => ({
  ChatMessageRow: () => <div data-testid="chat-message-row-mock" />,
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

const buddyAgent: AgentDefinitionLite = {
  id: 'buddy-def',
  slug: 'buddy',
  mention_handle: '@buddy',
  display_name: 'Buddy',
  avatar_url: '',
  auth_user_id: 'auth-buddy',
  response_timeout_ms: 30_000,
};

const coachAgent: AgentDefinitionLite = {
  ...buddyAgent,
  id: 'coach-def',
  slug: 'coach',
  auth_user_id: 'auth-coach',
  mention_handle: '@coach',
  display_name: 'Coach',
};

function mockThread(overrides: Partial<ReturnType<typeof useMessageThread>> = {}) {
  const sendMessage = vi
    .fn()
    .mockResolvedValue({ messageId: 'msg-1', createdAt: new Date().toISOString() });
  vi.mocked(useMessageThread).mockReturnValue({
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

describe('StandardTaskChatRail agent effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastRichComposerProps.current = null;
    resetAgentWaitMock();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('invokes onCardAction once per message id when messages reference is stable on rerender', async () => {
    const onCardAction = vi.fn();
    const coachMsg = {
      id: 'coach-card-action-1',
      user_id: 'auth-coach',
      created_at: '2026-01-15T12:00:00.000Z',
      metadata: {
        card_action: { v: 1, kind: 'trigger_generation' },
      },
    } as never;
    const messages = [coachMsg];
    mockThread({
      isLoading: false,
      messages,
      agentsByAuthUserId: new Map<string, AgentDefinitionLite>([
        ['auth-buddy', buddyAgent],
        ['auth-coach', coachAgent],
      ]),
    });

    const { rerender } = render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onCardAction={onCardAction}
      />,
    );

    await waitFor(() => {
      expect(onCardAction).toHaveBeenCalledTimes(1);
    });
    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        messageId: 'coach-card-action-1',
        action: { v: 1, kind: 'trigger_generation' },
      }),
    );

    rerender(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onCardAction={onCardAction}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(onCardAction).toHaveBeenCalledTimes(1);
  });

  it('invokes onExecutionPatch once per message id when messages reference is stable on rerender', async () => {
    const onExecutionPatch = vi.fn();
    const coachMsg = {
      id: 'coach-msg-1',
      user_id: 'auth-coach',
      created_at: '2026-01-15T12:00:00.000Z',
      metadata: {
        execution_patch: [{ exerciseIndex: 0, setIndex: 1, reps: '10', done: true }],
      },
    } as never;
    const messages = [coachMsg];
    mockThread({
      isLoading: false,
      messages,
      agentsByAuthUserId: new Map<string, AgentDefinitionLite>([
        ['auth-buddy', buddyAgent],
        ['auth-coach', coachAgent],
      ]),
    });

    const { rerender } = render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onExecutionPatch={onExecutionPatch}
      />,
    );

    await waitFor(() => {
      expect(onExecutionPatch).toHaveBeenCalledTimes(1);
    });
    expect(onExecutionPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        messageId: 'coach-msg-1',
        messageCreatedAtMs: new Date('2026-01-15T12:00:00.000Z').getTime(),
        patch: [{ exerciseIndex: 0, setIndex: 1, reps: '10', done: true }],
      }),
    );

    rerender(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onExecutionPatch={onExecutionPatch}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(onExecutionPatch).toHaveBeenCalledTimes(1);
  });

  it('invokes onTaskModalIntakePatch again after unmount/remount (host dedupes cross-mount)', async () => {
    const onTaskModalIntakePatch = vi.fn();
    const coachRows = [
      {
        id: 'coach-intake-1',
        user_id: 'auth-coach',
        created_at: '2026-01-15T12:00:00.000Z',
        metadata: {
          task_modal_intake_patch: { readiness: 9, sleep_quality: 8 },
        },
      } as never,
    ];
    mockThread({
      isLoading: false,
      messages: coachRows,
      agentsByAuthUserId: new Map<string, AgentDefinitionLite>([
        ['auth-buddy', buddyAgent],
        ['auth-coach', coachAgent],
      ]),
    });

    const { unmount } = render(
      <StandardTaskChatRail
        key="a"
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onTaskModalIntakePatch={onTaskModalIntakePatch}
      />,
    );

    await waitFor(() => {
      expect(onTaskModalIntakePatch).toHaveBeenCalledTimes(1);
    });

    unmount();

    render(
      <StandardTaskChatRail
        key="b"
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onTaskModalIntakePatch={onTaskModalIntakePatch}
      />,
    );

    await waitFor(() => {
      expect(onTaskModalIntakePatch).toHaveBeenCalledTimes(2);
    });
  });

  it('emits onEffectTelemetry for scanned and applied', async () => {
    const onEffectTelemetry = vi.fn();
    mockThread({
      isLoading: false,
      messages: [
        {
          id: 'm1',
          user_id: 'auth-coach',
          created_at: '2026-01-15T12:00:00.000Z',
          metadata: { task_modal_intake_patch: { readiness: 3 } },
        } as never,
      ],
      agentsByAuthUserId: new Map<string, AgentDefinitionLite>([
        ['auth-buddy', buddyAgent],
        ['auth-coach', coachAgent],
      ]),
    });

    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onTaskModalIntakePatch={vi.fn()}
        onEffectTelemetry={onEffectTelemetry}
      />,
    );

    await waitFor(() => {
      expect(onEffectTelemetry).toHaveBeenCalled();
    });
    expect(onEffectTelemetry.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'effect.scanned', effect: 'task_modal_intake_patch' }),
        expect.objectContaining({ kind: 'effect.applied', effect: 'task_modal_intake_patch' }),
      ]),
    );
  });

  it('does not invoke effect callbacks when neither patch handler is provided', async () => {
    const onEffectTelemetry = vi.fn();
    mockThread({
      isLoading: false,
      messages: [
        {
          id: 'm1',
          user_id: 'auth-coach',
          metadata: { task_modal_intake_patch: { readiness: 3 } },
        } as never,
      ],
      agentsByAuthUserId: new Map<string, AgentDefinitionLite>([
        ['auth-buddy', buddyAgent],
        ['auth-coach', coachAgent],
      ]),
    });

    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onEffectTelemetry={onEffectTelemetry}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(onEffectTelemetry).not.toHaveBeenCalled();
  });

  it('calls onEmbeddedTaskIdsChange with attached_task_id values from messages', async () => {
    const onEmbeddedTaskIdsChange = vi.fn();
    mockThread({
      isLoading: false,
      messages: [
        {
          id: 'm1',
          user_id: 'user-1',
          attached_task_id: 'embed-1',
          content: 'x',
          metadata: null,
        } as never,
      ],
    });

    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onEmbeddedTaskIdsChange={onEmbeddedTaskIdsChange}
      />,
    );

    await waitFor(() => {
      expect(onEmbeddedTaskIdsChange).toHaveBeenCalledWith(['embed-1']);
    });
  });

  it('calls onThreadViewChange(false) once on mount', () => {
    const onThreadViewChange = vi.fn();
    mockThread();
    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onThreadViewChange={onThreadViewChange}
      />,
    );
    expect(onThreadViewChange).toHaveBeenCalledTimes(1);
    expect(onThreadViewChange).toHaveBeenCalledWith(false);
  });

  it('task-modal shell wrapper can use flex-1 min-h-0 around the rail', () => {
    mockThread();
    const { container } = render(
      <div className="flex h-[600px] flex-col">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <StandardTaskChatRail
            workspaceId="ws-1"
            taskId="task-1"
            canPostMessages
            defaultAgentSlug="coach"
          />
        </div>
      </div>,
    );
    const shell = container.querySelector('.relative.flex.min-h-0');
    expect(shell?.className).toContain('flex-1');
    expect(shell?.className).toContain('min-h-0');
    const railRoot = shell?.firstElementChild;
    expect(railRoot?.className).toContain('min-h-0');
    expect(railRoot?.className).not.toContain('-mx-6');
  });
});
