import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import { useCallback } from 'react';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import { useMessageThread } from '@/hooks/useMessageThread';
import type { CardActionEffectPayload } from '@/components/chat/agent-effects/types';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';

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

vi.mock('@/store/userProfileStore', () => ({
  useUserProfileStore: (selector: (s: { profile: { id: string } | null }) => unknown) =>
    selector({ profile: { id: 'user-1' } }),
}));

vi.mock('@/context/WorkspaceSessionContext', () => ({
  useWorkspaceSessionSubject: () => ({ subjectUserId: 'user-1' }),
}));

vi.mock('@utils/supabase/client', async () => {
  const { createSupabaseClientMock } = await import('@/test-utils/create-supabase-client-mock');
  return { createClient: () => createSupabaseClientMock() };
});

vi.mock('@/components/chat/ChatMessageRow', () => ({
  ChatMessageRow: () => <div data-testid="chat-message-row-mock" />,
}));

vi.mock('@/components/chat/RichMessageComposer', () => ({
  RichMessageComposer: () => <div data-testid="rich-composer-mock" />,
}));

const coachAgent: AgentDefinitionLite = {
  id: 'coach-def',
  slug: 'coach',
  mention_handle: '@coach',
  display_name: 'Coach',
  avatar_url: '',
  auth_user_id: 'auth-coach',
  response_timeout_ms: 30_000,
};

const cardActionMessage = {
  id: 'coach-card-gen-1',
  user_id: 'auth-coach',
  created_at: '2026-01-15T12:00:00.000Z',
  metadata: {
    card_action: { v: 1, kind: 'trigger_generation' },
  },
} as const;

function mockThread() {
  vi.mocked(useMessageThread).mockReturnValue({
    messages: [cardActionMessage] as never,
    userById: {},
    teamMembers: [],
    agentsByAuthUserId: new Map([['auth-coach', coachAgent]]),
    agentAuthUserIds: ['auth-coach'],
    replyCounts: new Map(),
    isLoading: false,
    error: null,
    sending: false,
    sendMessage: vi.fn(),
    clearError: vi.fn(),
    setError: vi.fn(),
    silentRefreshMessages: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useMessageThread>);
}

describe('TaskModal card_action generation hand-off', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThread();
  });

  afterEach(() => {
    cleanup();
  });

  it('invokes generate once when card_action arrives on a flat card', async () => {
    const handleAiGenerateWorkout = vi.fn();
    const buildWizardPayload = vi.fn(() => ({
      durationMinutes: 45 as const,
      phaseIntent: 'standard_progression' as const,
      progressionTrend: 'Appropriately Challenging' as const,
      anchorLift: null,
      temporaryLimitations: null,
    }));

    function Host() {
      const handleCardAction = useCallback((args: CardActionEffectPayload) => {
        if (args.action.kind !== 'trigger_generation') return;
        void handleAiGenerateWorkout(buildWizardPayload());
      }, []);

      return (
        <StandardTaskChatRail
          workspaceId="ws-1"
          taskId="task-1"
          canPostMessages
          defaultAgentSlug="coach"
          onCardAction={handleCardAction}
        />
      );
    }

    render(<Host />);

    await waitFor(() => {
      expect(handleAiGenerateWorkout).toHaveBeenCalledTimes(1);
    });
    expect(buildWizardPayload).toHaveBeenCalledTimes(1);
  });

  it('does not invoke generate when viewerWorkoutSet is already populated', async () => {
    const handleAiGenerateWorkout = vi.fn();

    function Host({ hasWorkoutSet }: { hasWorkoutSet: boolean }) {
      const handleCardAction = useCallback(
        (args: CardActionEffectPayload) => {
          if (args.action.kind !== 'trigger_generation') return;
          if (hasWorkoutSet) return;
          void handleAiGenerateWorkout();
        },
        [hasWorkoutSet],
      );

      return (
        <StandardTaskChatRail
          workspaceId="ws-1"
          taskId="task-1"
          canPostMessages
          defaultAgentSlug="coach"
          onCardAction={handleCardAction}
        />
      );
    }

    const { rerender } = render(<Host hasWorkoutSet={false} />);

    await waitFor(() => {
      expect(handleAiGenerateWorkout).toHaveBeenCalledTimes(1);
    });

    rerender(<Host hasWorkoutSet={true} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(handleAiGenerateWorkout).toHaveBeenCalledTimes(1);
  });
});
