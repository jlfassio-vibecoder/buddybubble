import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import { useMessageThread } from '@/hooks/useMessageThread';
import {
  useAgentResponseWait,
  type UseAgentResponseWaitResult,
} from '@/hooks/useAgentResponseWait';
import type { MessageRowWithEmbeddedTask } from '@/types/database';
import type { BlockPickerPreset } from '@/lib/agents/coach/block-blueprint-mentions-client';

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

vi.mock('@utils/supabase/client', async () => {
  const { createSupabaseClientMock } = await import('@/test-utils/create-supabase-client-mock');
  return { createClient: () => createSupabaseClientMock() };
});

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

  it('with defaultAgentSlug undefined: no useAgentResponseWait, no typing indicator, send includes surface only', async () => {
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
    expect(sendMessage.mock.calls[0][3]).toEqual({
      metadata: { surface: 'standard_task_chat_rail' },
    });
  });

  it('buildOutgoingMessageMetadata merges into sendMessage metadata; default_agent_slug wins on collision', async () => {
    vi.mocked(useAgentResponseWait).mockReturnValue({
      pending: null,
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
        buildOutgoingMessageMetadata={() => ({
          default_agent_slug: 'buddy',
          task_modal_live_state: { v: 1, item_type: 'workout' },
        })}
      />,
    );
    fireEvent.submit(screen.getAllByTestId('rich-composer-mock')[0]!);
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage.mock.calls[0][3]).toEqual({
      metadata: {
        task_modal_live_state: { v: 1, item_type: 'workout' },
        surface: 'standard_task_chat_rail',
        default_agent_slug: 'coach',
      },
    });
  });

  it('buildOutgoingMessageMetadata returning null leaves only default_agent_slug when slug set', async () => {
    vi.mocked(useAgentResponseWait).mockReturnValue({
      pending: null,
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
        buildOutgoingMessageMetadata={() => null}
      />,
    );
    fireEvent.submit(screen.getAllByTestId('rich-composer-mock')[0]!);
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage.mock.calls[0][3]).toEqual({
      metadata: { surface: 'standard_task_chat_rail', default_agent_slug: 'coach' },
    });
  });

  it('buildOutgoingMessageMetadata uses latest wizard values on each send', async () => {
    vi.mocked(useAgentResponseWait).mockReturnValue({
      pending: null,
      registerIntent: vi.fn(),
      registerSuccessfulSend: vi.fn(),
      clear: vi.fn(),
    } as UseAgentResponseWaitResult);
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
    } as unknown as ReturnType<typeof useMessageThread>);

    function FreshnessParent() {
      const [readiness, setReadiness] = useState(4);
      return (
        <>
          <button type="button" data-testid="bump-readiness" onClick={() => setReadiness(7)}>
            bump
          </button>
          <StandardTaskChatRail
            workspaceId="ws-1"
            taskId="task-1"
            canPostMessages
            defaultAgentSlug="coach"
            buildOutgoingMessageMetadata={() => ({
              task_modal_live_state: { v: 1, item_type: 'workout', readiness },
            })}
          />
        </>
      );
    }

    render(<FreshnessParent />);
    fireEvent.submit(screen.getAllByTestId('rich-composer-mock')[0]!);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(
      (
        sendMessage.mock.calls[0][3] as {
          metadata: { task_modal_live_state: { readiness: number } };
        }
      ).metadata.task_modal_live_state.readiness,
    ).toBe(4);
    fireEvent.click(screen.getByTestId('bump-readiness'));
    fireEvent.submit(screen.getAllByTestId('rich-composer-mock')[0]!);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(
      (
        sendMessage.mock.calls[1][3] as {
          metadata: { task_modal_live_state: { readiness: number } };
        }
      ).metadata.task_modal_live_state.readiness,
    ).toBe(7);
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
      metadata: { surface: 'standard_task_chat_rail', default_agent_slug: 'coach' },
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

  it('enableExerciseHashMentions with coach default passes hashConfig and footer hint', () => {
    mockThread();
    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        enableExerciseHashMentions
        workoutExerciseNames={['Goblet Squat']}
      />,
    );
    expect(lastRichComposerProps.current?.features).toMatchObject({
      enableExerciseHashMentions: true,
    });
    const hashConfig = lastRichComposerProps.current?.hashConfig as {
      exercises: Array<{ name: string }>;
    };
    expect(hashConfig.exercises.some((e) => e.name === 'Goblet Squat')).toBe(true);
    expect(lastRichComposerProps.current?.onExerciseHashInserted).toBeTypeOf('function');
  });

  it('send attaches exercise_mentions when coach hash pick is pending in message', async () => {
    const sendMessage = mockThread();
    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        enableExerciseHashMentions
        workoutExerciseNames={['Goblet Squat']}
      />,
    );
    const onHash = lastRichComposerProps.current?.onExerciseHashInserted as
      | ((ex: { id: string; name: string }) => void)
      | undefined;
    onHash?.({ id: 'workout:goblet squat', name: 'Goblet Squat' });
    const onSubmit = lastRichComposerProps.current?.onSubmit as
      | ((p: { text: string; files: File[] }) => void | Promise<void>)
      | undefined;
    await onSubmit?.({ text: 'load #Goblet Squat ', files: [] });
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const meta = sendMessage.mock.calls[0][3] as {
      metadata: {
        surface: string;
        default_agent_slug: string;
        exercise_mentions: Array<{ name: string; token: string }>;
      };
    };
    expect(meta.metadata.surface).toBe('standard_task_chat_rail');
    expect(meta.metadata.exercise_mentions).toHaveLength(1);
    expect(meta.metadata.exercise_mentions[0].name).toBe('Goblet Squat');
    expect(meta.metadata.exercise_mentions[0].token).toBe('#Goblet Squat ');
  });

  it('enableBlockBlueprintMentions with coach passes blockConfig and footer hint', () => {
    mockThread();
    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        enableBlockBlueprintMentions
      />,
    );
    expect(lastRichComposerProps.current?.features).toMatchObject({
      enableBlockBlueprintMentions: true,
    });
    const blockConfig = lastRichComposerProps.current?.blockConfig as {
      presets: Array<{ label: string }>;
    };
    expect(blockConfig.presets.some((p) => p.label.includes('AMRAP'))).toBe(true);
    expect(lastRichComposerProps.current?.onBlockBlueprintInserted).toBeTypeOf('function');
  });

  it('send attaches block_blueprint_mentions when coach block pick is pending in message', async () => {
    const sendMessage = mockThread();
    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        enableBlockBlueprintMentions
      />,
    );
    const onBlock = lastRichComposerProps.current?.onBlockBlueprintInserted as
      | ((preset: BlockPickerPreset) => void)
      | undefined;
    onBlock?.({
      id: 'finisher-amrap-metcon',
      token: ':finisher/amrap/metcon ',
      label: 'Finisher · AMRAP · Metcon',
      group: 'CONDITIONING_AND_FINISHERS',
      searchAliases: ['burnout', 'glycolytic'],
      section_name: 'Finisher',
      block_format: 'amrap',
      format_params: { time_cap_minutes: 5 },
    });
    const onSubmit = lastRichComposerProps.current?.onSubmit as
      | ((p: { text: string; files: File[] }) => void | Promise<void>)
      | undefined;
    await onSubmit?.({ text: 'add :finisher/amrap/metcon ', files: [] });
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const meta = sendMessage.mock.calls[0][3] as {
      metadata: {
        block_blueprint_mentions: Array<{ block_format: string; token: string }>;
      };
    };
    expect(meta.metadata.block_blueprint_mentions).toHaveLength(1);
    expect(meta.metadata.block_blueprint_mentions[0].block_format).toBe('amrap');
    expect(meta.metadata.block_blueprint_mentions[0].token).toBe(':finisher/amrap/metcon ');
  });

  it('root element has expected flex layout classes', () => {
    mockThread();
    const { container } = render(
      <StandardTaskChatRail workspaceId="ws-1" taskId="task-1" canPostMessages />,
    );
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    const cls = root!.className;
    expect(cls).toMatch(/\bflex\b/);
    expect(cls).toMatch(/\bh-full\b/);
    expect(cls).toMatch(/\bflex-1\b/);
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

  it('wraps each transcript row in data-message-id and forwards chatRowExtras except rail-suppressed workout actions', () => {
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
    expect(chatMessageRowMockCalls[0]?.chatCardWorkoutActions).toBeUndefined();
    expect(chatMessageRowMockCalls[0]?.bubbleUpPropsFor).toBe(bubbleUpPropsFor);
    expect(chatMessageRowMockCalls[0]?.onOpenAttachment).toBe(onOpenAttachment);
  });

  it('strips coachDraft from mapped messages so ChatMessageRow does not receive draft UI props', () => {
    const draftMeta = {
      coach_draft: {
        status: 'pending' as const,
        proposed_title: 'T',
        proposed_description: 'D',
        proposed_metadata: {},
        target_task_id: 'task-1',
      },
    };
    const row = {
      id: 'draft-msg',
      user_id: 'user-1',
      content: 'Here is a proposal',
      created_at: new Date().toISOString(),
      parent_id: null,
      bubble_id: 'b1',
      attached_task_id: 'task-1',
      attachments: null,
      metadata: draftMeta,
      tasks: null,
    } as unknown as MessageRowWithEmbeddedTask;
    mockThread({ messages: [row] });
    render(
      <StandardTaskChatRail workspaceId="ws-1" taskId="task-1" canPostMessages bubbleId="b1" />,
    );
    expect(chatMessageRowMockCalls[0]?.message).toMatchObject({
      id: 'draft-msg',
      content: 'Here is a proposal',
      coachDraft: null,
    });
  });

  it('strips same-task embedded task from agent rows so ChatFeedTaskCard HITL chrome is not shown', () => {
    const coachAuthId = '00000000-0000-4000-8000-000000000099';
    const agentsByAuthUserId = new Map([
      [
        coachAuthId,
        {
          id: 'coach-def',
          slug: 'coach',
          display_name: 'Coach',
          mention_handle: 'coach',
          auth_user_id: coachAuthId,
          avatar_url: '',
          response_timeout_ms: 30_000,
        },
      ],
    ]);
    const row = {
      id: 'coach-msg',
      user_id: coachAuthId,
      content: 'I outlined the workout on your card.',
      created_at: new Date().toISOString(),
      parent_id: null,
      bubble_id: 'b1',
      attached_task_id: 'task-1',
      attachments: null,
      metadata: null,
      tasks: {
        id: 'task-1',
        title: 'Kettlebell Leg Workout',
        item_type: 'workout',
      },
    } as unknown as MessageRowWithEmbeddedTask;
    mockThread({ messages: [row], agentsByAuthUserId });
    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        bubbleId="b1"
        chatRowExtras={{
          chatCardWorkoutActions: {
            modalTaskId: 'task-1',
          } as never,
        }}
      />,
    );
    expect(chatMessageRowMockCalls[0]?.message).toMatchObject({
      id: 'coach-msg',
      attached_task_id: null,
      attachedTask: null,
    });
    expect(chatMessageRowMockCalls[0]?.chatCardWorkoutActions).toBeUndefined();
  });

  it('sendCoachMessage via ref registers agent wait intent and successful send', async () => {
    const registerIntent = vi.fn();
    const registerSuccessfulSend = vi.fn();
    vi.mocked(useAgentResponseWait).mockReturnValue({
      pending: null,
      registerIntent,
      registerSuccessfulSend,
      clear: vi.fn(),
    } as UseAgentResponseWaitResult);

    const coachAgent = {
      id: 'coach-def',
      slug: 'coach',
      mention_handle: '@coach',
      display_name: 'Coach',
      avatar_url: '',
      auth_user_id: 'auth-coach',
      response_timeout_ms: 30_000,
    };
    const sendMessage = vi
      .fn()
      .mockResolvedValue({ messageId: 'msg-send-1', createdAt: new Date().toISOString() });
    vi.mocked(useMessageThread).mockReturnValue({
      messages: [],
      userById: {},
      teamMembers: [],
      agentsByAuthUserId: new Map([['auth-coach', coachAgent]]),
      agentAuthUserIds: ['auth-coach'],
      replyCounts: new Map(),
      isLoading: false,
      error: null,
      sending: false,
      sendMessage,
      clearError: vi.fn(),
      setError: vi.fn(),
      silentRefreshMessages: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useMessageThread>);

    const ref = {
      current: null as
        | import('@/components/chat/StandardTaskChatRail').StandardTaskChatRailHandle
        | null,
    };
    render(
      <StandardTaskChatRail
        ref={(h) => {
          ref.current = h;
        }}
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
      />,
    );

    await waitFor(() => expect(ref.current).not.toBeNull());
    const ok = await ref.current!.sendCoachMessage('@coach fill cues for #Goblet Squat', {
      exercise_cue_request: {
        v: 1,
        exercise_name: 'Goblet Squat',
        empty_fields: ['setup'],
      },
    });
    expect(ok).toBe(true);
    expect(registerIntent).toHaveBeenCalledTimes(1);
    expect(registerSuccessfulSend).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalled();
  });

  it('invokes onWorkoutCuesPatch when coach reply carries workout_cues_patch metadata', async () => {
    const onWorkoutCuesPatch = vi.fn();
    const coachAgent = {
      id: 'coach-def',
      slug: 'coach',
      mention_handle: '@coach',
      display_name: 'Coach',
      avatar_url: '',
      auth_user_id: 'auth-coach',
      response_timeout_ms: 30_000,
    };
    mockThread({
      messages: [
        {
          id: 'coach-cues-1',
          user_id: 'auth-coach',
          content: 'Saved cues for Goblet Squat.',
          created_at: new Date().toISOString(),
          parent_id: null,
          bubble_id: 'b1',
          attached_task_id: null,
          attachments: null,
          metadata: {
            workout_cues_patch: {
              v: 1,
              resolution_key: 'flat:goblet-squat',
              form_cues: 'Feet shoulder-width.',
            },
          },
          tasks: null,
        } as unknown as MessageRowWithEmbeddedTask,
      ],
      agentsByAuthUserId: new Map([['auth-coach', coachAgent]]),
    });

    render(
      <StandardTaskChatRail
        workspaceId="ws-1"
        taskId="task-1"
        canPostMessages
        defaultAgentSlug="coach"
        onWorkoutCuesPatch={onWorkoutCuesPatch}
      />,
    );

    await waitFor(() => expect(onWorkoutCuesPatch).toHaveBeenCalledTimes(1));
    expect(onWorkoutCuesPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        messageId: 'coach-cues-1',
        patch: expect.objectContaining({
          resolution_key: 'flat:goblet-squat',
          form_cues: 'Feet shoulder-width.',
        }),
      }),
    );
  });
});
