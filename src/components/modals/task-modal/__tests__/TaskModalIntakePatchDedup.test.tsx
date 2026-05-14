import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { useCallback, useRef } from 'react';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import { useMessageThread } from '@/hooks/useMessageThread';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';

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

vi.mock('@utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

vi.mock('@/hooks/useMessageThread', () => ({
  useMessageThread: vi.fn(),
}));

vi.mock('@/hooks/useAgentResponseWait', () => ({
  useAgentResponseWait: () => ({
    pending: null,
    registerIntent: vi.fn(),
    registerSuccessfulSend: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('@/context/WorkspaceSessionContext', () => ({
  useWorkspaceSessionSubject: () => ({ subjectUserId: 'user-1' }),
}));

vi.mock('@/components/chat/ChatMessageRow', () => ({
  ChatMessageRow: () => <div data-testid="chat-message-row-mock" />,
}));

vi.mock('@/components/chat/RichMessageComposer', () => ({
  RichMessageComposer: () => <div data-testid="rich-composer-mock" />,
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

const coachMessage = {
  id: 'coach-intake-1',
  user_id: 'auth-coach',
  created_at: '2026-01-15T12:00:00.000Z',
  metadata: {
    task_modal_intake_patch: { readiness: 9, sleep_quality: 8 },
  },
} as const;

const messages = [coachMessage] as unknown as never[];

function baseThreadReturn(overrides: Partial<ReturnType<typeof useMessageThread>> = {}) {
  return {
    messages,
    userById: {},
    teamMembers: [],
    agentsByAuthUserId: new Map<string, AgentDefinitionLite>([
      ['auth-buddy', buddyAgent],
      ['auth-coach', coachAgent],
    ]),
    agentAuthUserIds: ['auth-buddy', 'auth-coach'],
    replyCounts: new Map(),
    isLoading: false,
    error: null,
    sending: false,
    sendMessage: vi
      .fn()
      .mockResolvedValue({ messageId: 'm1', createdAt: new Date().toISOString() }),
    clearError: vi.fn(),
    setError: vi.fn(),
    silentRefreshMessages: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useMessageThread>;
}

describe('TaskModal intake patch de-dup (C3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMessageThread).mockImplementation(() => baseThreadReturn());
  });

  afterEach(() => {
    cleanup();
  });

  it('deduping parent applies coach intake patch only once when rail remounts with same task id', async () => {
    const applyFromMessage = vi.fn();

    function Parent({ mountKey }: { mountKey: string }) {
      const handledIntakePatchMessageIdsByTaskRef = useRef<Map<string, Set<string>>>(new Map());

      const handleTaskModalIntakePatch = useCallback(
        (args: {
          taskId: string;
          messageId: string;
          messageCreatedAtMs: number;
          patch: { readiness?: number; sleep_quality?: number };
        }) => {
          const dedupeKey = `existing:${args.taskId}`;
          let set = handledIntakePatchMessageIdsByTaskRef.current.get(dedupeKey);
          if (!set) {
            set = new Set();
            handledIntakePatchMessageIdsByTaskRef.current.set(dedupeKey, set);
          }
          if (set.has(args.messageId)) return;
          set.add(args.messageId);
          applyFromMessage(args);
        },
        [],
      );

      return (
        <StandardTaskChatRail
          key={mountKey}
          workspaceId="ws-1"
          taskId="task-1"
          canPostMessages
          defaultAgentSlug="coach"
          onTaskModalIntakePatch={handleTaskModalIntakePatch}
        />
      );
    }

    const { rerender, unmount } = render(<Parent mountKey="a" />);

    await waitFor(() => {
      expect(applyFromMessage).toHaveBeenCalledTimes(1);
    });

    rerender(<Parent mountKey="b" />);

    await waitFor(() => {
      expect(applyFromMessage).toHaveBeenCalledTimes(1);
    });

    expect(applyFromMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        messageId: 'coach-intake-1',
        messageCreatedAtMs: new Date('2026-01-15T12:00:00.000Z').getTime(),
        patch: { readiness: 9, sleep_quality: 8 },
      }),
    );

    unmount();
  });
});
