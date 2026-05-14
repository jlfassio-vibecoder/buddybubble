import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, within } from '@testing-library/react';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import type { TaskRow } from '@/types/database';
import { useMessageThread } from '@/hooks/useMessageThread';

const stubs = vi.hoisted(() => {
  const WORKOUT_TASK = {
    id: 'task-layout-1',
    title: 'Bench',
    description: '',
    item_type: 'workout',
    status: 'todo',
    priority: 'medium',
    metadata: {},
    visibility: 'private',
    scheduled_on: null,
    scheduled_time: null,
    workspace_id: 'ws-1',
    bubble_id: 'bubble-1',
    task_subtasks: [],
    task_activity_log: [],
    task_assignees: [],
  } as unknown as TaskRow;

  const maybeSingleTasks = vi.fn().mockResolvedValue({ data: WORKOUT_TASK, error: null });
  const tasksSelectChain = {
    eq: () => ({ maybeSingle: maybeSingleTasks }),
  };
  const tasksFrom = {
    select: () => tasksSelectChain,
    update: () => ({
      eq: () => ({ error: null }),
    }),
  };
  const boardColumnsFrom = {
    select: () => ({
      eq: () => ({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  };
  const workspaceMembersFrom = {
    select: () => ({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };
  const genericFrom = {
    select: () => ({
      eq: () => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };

  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({}),
  };

  const supabaseClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    from: vi.fn((table: string) => {
      if (table === 'tasks') return tasksFrom;
      if (table === 'board_columns') return boardColumnsFrom;
      if (table === 'workspace_members') return workspaceMembersFrom;
      return genericFrom;
    }),
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
        createSignedUrl: vi
          .fn()
          .mockResolvedValue({ data: { signedUrl: 'https://x' }, error: null }),
      }),
    },
  };

  return {
    useIsNarrowBelowMdMock: vi.fn(() => false),
    workoutAiState: {
      aiWorkoutGenerating: false,
      hasWorkoutViewerContent: false,
      workoutViewerOpen: false,
    },
    embedded: {
      setActivityLog: vi.fn(),
      setNewSubtaskTitle: vi.fn(),
      addSubtask: vi.fn(),
      toggleSubtask: vi.fn(),
      uploadAttachment: vi.fn(),
      removeAttachment: vi.fn(),
      hydrateFromTaskRow: vi.fn(),
      resetForCreate: vi.fn(),
    },
    program: { handlePersonalizeProgram: vi.fn() },
    cardCover: { generateCardCoverWithAi: vi.fn(), resetCardCoverAi: vi.fn() },
    workoutAi: {
      setTemplatePickerOpen: vi.fn(),
      setWorkoutViewerOpen: vi.fn(),
      applyWorkoutTemplate: vi.fn(),
      handleAiGenerateWorkout: vi.fn(),
      handleWorkoutViewerApply: vi.fn(),
      resetWorkoutAiUi: vi.fn(),
    },
    supabaseClient,
    WORKOUT_TASK,
  };
});

vi.mock('@utils/supabase/client', () => ({
  createClient: () => stubs.supabaseClient,
}));

vi.mock('@/hooks/use-is-narrow-below-md', () => ({
  useIsNarrowBelowMd: () => stubs.useIsNarrowBelowMdMock(),
}));

vi.mock('@/components/modals/task-modal/TaskModalDetailsBody', () => ({
  TaskModalDetailsBody: () => <div data-testid="task-modal-details-body" />,
}));

vi.mock('@/components/modals/task-modal/hooks/useTaskEmbeddedCollections', () => ({
  useTaskEmbeddedCollections: () => ({
    subtasks: [],
    activityLog: [],
    setActivityLog: stubs.embedded.setActivityLog,
    attachments: [],
    newSubtaskTitle: '',
    setNewSubtaskTitle: stubs.embedded.setNewSubtaskTitle,
    addSubtask: stubs.embedded.addSubtask,
    toggleSubtask: stubs.embedded.toggleSubtask,
    uploadAttachment: stubs.embedded.uploadAttachment,
    removeAttachment: stubs.embedded.removeAttachment,
    hydrateFromTaskRow: stubs.embedded.hydrateFromTaskRow,
    resetForCreate: stubs.embedded.resetForCreate,
  }),
}));

vi.mock('@/components/modals/task-modal/hooks/useWorkspaceAssignees', () => ({
  useWorkspaceAssignees: () => [],
}));

vi.mock('@/components/modals/task-modal/hooks/useTaskProgramPersonalization', () => ({
  useTaskProgramPersonalization: () => ({
    aiProgramPersonalizing: false,
    handlePersonalizeProgram: stubs.program.handlePersonalizeProgram,
  }),
}));

vi.mock('@/components/modals/task-modal/hooks/useTaskCardCoverAi', () => ({
  useTaskCardCoverAi: () => ({
    aiCardCoverGenerating: false,
    generateCardCoverWithAi: stubs.cardCover.generateCardCoverWithAi,
    resetCardCoverAi: stubs.cardCover.resetCardCoverAi,
  }),
}));

vi.mock('@/components/modals/task-modal/hooks/useTaskWorkoutAi', () => ({
  useTaskWorkoutAi: () => ({
    templatePickerOpen: false,
    setTemplatePickerOpen: stubs.workoutAi.setTemplatePickerOpen,
    aiWorkoutGenerating: stubs.workoutAiState.aiWorkoutGenerating,
    aiWorkoutProgressIdx: null,
    workoutViewerOpen: stubs.workoutAiState.workoutViewerOpen,
    setWorkoutViewerOpen: stubs.workoutAi.setWorkoutViewerOpen,
    applyWorkoutTemplate: stubs.workoutAi.applyWorkoutTemplate,
    handleAiGenerateWorkout: stubs.workoutAi.handleAiGenerateWorkout,
    viewerWorkoutSet: null,
    hasWorkoutViewerContent: stubs.workoutAiState.hasWorkoutViewerContent,
    handleWorkoutViewerApply: stubs.workoutAi.handleWorkoutViewerApply,
    resetWorkoutAiUi: stubs.workoutAi.resetWorkoutAiUi,
  }),
}));

vi.mock('@/hooks/useMessageThread', () => ({
  useMessageThread: vi.fn(),
}));

vi.mock('@/hooks/use-task-bubble-ups', () => ({
  useTaskBubbleUps: () => ({ bubbleUpPropsFor: vi.fn() }),
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

describe('TaskModal layout (standard rail)', () => {
  let origGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL', '1');
    vi.clearAllMocks();
    stubs.useIsNarrowBelowMdMock.mockReturnValue(false);
    stubs.workoutAiState.aiWorkoutGenerating = false;
    stubs.workoutAiState.hasWorkoutViewerContent = false;
    stubs.workoutAiState.workoutViewerOpen = false;
    vi.mocked(useMessageThread).mockImplementation(() => baseThreadReturn());
    origGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function mockGbcr(this: HTMLElement) {
      if (this.getAttribute('data-testid') === 'standard-task-chat-rail-composer') {
        return {
          ...origGetBoundingClientRect.call(this),
          height: 120,
          width: 400,
          top: 0,
          left: 0,
          bottom: 120,
          right: 400,
          x: 0,
          y: 0,
          toJSON: () => {},
        } as DOMRect;
      }
      return origGetBoundingClientRect.call(this);
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = origGetBoundingClientRect;
    cleanup();
    vi.unstubAllEnvs();
  });

  it('keeps composer visible above tab bar when AI workout row toggles (unified stacked, max-md)', async () => {
    stubs.useIsNarrowBelowMdMock.mockReturnValue(true);
    stubs.workoutAiState.aiWorkoutGenerating = true;
    const { TaskModal } = await import('@/components/modals/TaskModal');
    const { container } = render(
      <div className="flex h-[600px] flex-col">
        <TaskModal
          open
          onOpenChange={vi.fn()}
          taskId="task-layout-1"
          bubbleId="bubble-1"
          workspaceId="ws-1"
          canWrite
          bubbles={[]}
          initialTab="comments"
          initialViewMode="comments-only"
        />
      </div>,
    );
    const view = within(container);
    const composer = await view.findByTestId(
      'standard-task-chat-rail-composer',
      {},
      { timeout: 10_000 },
    );
    expect(composer.getBoundingClientRect().height).toBeGreaterThan(0);
    const tabBar = view.getByRole('tablist', { name: /card sections/i });
    expect(
      composer.compareDocumentPosition(tabBar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector('[data-testid="task-modal-details-body"]')).toBeNull();
  }, 20_000);

  it('renders split pane on md+ (rail + details) and stacked details on narrow', async () => {
    stubs.useIsNarrowBelowMdMock.mockReturnValue(false);
    const { TaskModal } = await import('@/components/modals/TaskModal');
    const { container, rerender } = render(
      <TaskModal
        open
        onOpenChange={vi.fn()}
        taskId="task-layout-1"
        bubbleId="bubble-1"
        workspaceId="ws-1"
        canWrite
        bubbles={[]}
        initialTab="comments"
        initialViewMode="comments-only"
      />,
    );
    const view = within(container);
    await waitFor(() => {
      expect(view.getByTestId('standard-task-chat-rail-composer')).toBeTruthy();
    });
    const splitPane = view.getByTestId('task-modal-comments-split-details-pane');
    expect(within(splitPane).getByTestId('task-modal-details-body')).toBeTruthy();

    stubs.useIsNarrowBelowMdMock.mockReturnValue(true);
    rerender(
      <TaskModal
        open
        onOpenChange={vi.fn()}
        taskId="task-layout-1"
        bubbleId="bubble-1"
        workspaceId="ws-1"
        canWrite
        bubbles={[]}
        initialTab="comments"
        initialViewMode="comments-only"
      />,
    );
    expect(view.queryByTestId('task-modal-details-body')).toBeNull();
    expect(view.getByTestId('standard-task-chat-rail-composer')).toBeTruthy();
  });

  it('workout split takes precedence over comments split (no details body mock)', async () => {
    stubs.useIsNarrowBelowMdMock.mockReturnValue(false);
    stubs.workoutAiState.workoutViewerOpen = true;
    stubs.workoutAiState.hasWorkoutViewerContent = true;
    const { TaskModal } = await import('@/components/modals/TaskModal');
    const { container } = render(
      <TaskModal
        open
        onOpenChange={vi.fn()}
        taskId="task-layout-1"
        bubbleId="bubble-1"
        workspaceId="ws-1"
        canWrite
        bubbles={[]}
        initialTab="comments"
        initialViewMode="comments-only"
      />,
    );
    const view = within(container);
    await waitFor(() => {
      expect(view.getByTestId('standard-task-chat-rail-composer')).toBeTruthy();
    });
    expect(view.queryByTestId('task-modal-details-body')).toBeNull();
  });
});
