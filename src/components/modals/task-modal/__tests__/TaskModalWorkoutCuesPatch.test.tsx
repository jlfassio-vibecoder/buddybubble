import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import { useCallback, useRef } from 'react';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import { useMessageThread } from '@/hooks/useMessageThread';
import type { WorkoutCuesPatchEffectPayload } from '@/components/chat/agent-effects/types';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import { stripWorkoutCuesPatchToCuePatch } from '@/components/chat/agent-effects/parse-workout-cues-patch-fields';

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
      { id: 'dict-1', name: 'Goblet Squat', slug: 'goblet-squat', status: 'published' as const },
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

const workoutCuesMessage = {
  id: 'coach-cues-msg-1',
  user_id: 'auth-coach',
  created_at: '2026-06-28T12:00:00.000Z',
  content: 'Saved cues for Goblet Squat.',
  metadata: {
    workout_cues_patch: {
      v: 1,
      resolution_key: 'flat:goblet-squat',
      instructions: 'Feet shoulder-width, kettlebell close.',
      form_cues: 'Sit hips back, keep chest tall.',
    },
  },
} as const;

function mockThread() {
  vi.mocked(useMessageThread).mockReturnValue({
    messages: [workoutCuesMessage] as never,
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

describe('TaskModal workout_cues_patch hand-off', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThread();
  });

  afterEach(() => {
    cleanup();
  });

  it('maps workout_cues_patch to cue patch keys for viewer apply', async () => {
    const onApplyCuePatches = vi.fn();

    function Host() {
      const handledRef = useRef(new Set<string>());
      const handleWorkoutCuesPatch = useCallback((args: WorkoutCuesPatchEffectPayload) => {
        if (handledRef.current.has(args.messageId)) return;
        handledRef.current.add(args.messageId);
        onApplyCuePatches({
          [args.patch.resolution_key]: stripWorkoutCuesPatchToCuePatch(args.patch),
        });
      }, []);

      return (
        <StandardTaskChatRail
          workspaceId="ws-1"
          taskId="task-1"
          canPostMessages
          defaultAgentSlug="coach"
          onWorkoutCuesPatch={handleWorkoutCuesPatch}
        />
      );
    }

    render(<Host />);

    await waitFor(() => {
      expect(onApplyCuePatches).toHaveBeenCalledTimes(1);
    });
    expect(onApplyCuePatches).toHaveBeenCalledWith({
      'flat:goblet-squat': {
        instructions: 'Feet shoulder-width, kettlebell close.',
        form_cues: 'Sit hips back, keep chest tall.',
      },
    });
  });

  it('dedupes workout_cues_patch by message id across rail remounts (TaskModal-style)', async () => {
    const handledByTask = new Map<string, Set<string>>();
    const onApplyCuePatches = vi.fn();

    function Host() {
      const handleWorkoutCuesPatch = useCallback((args: WorkoutCuesPatchEffectPayload) => {
        let handled = handledByTask.get(args.taskId);
        if (!handled) {
          handled = new Set();
          handledByTask.set(args.taskId, handled);
        }
        if (handled.has(args.messageId)) return;
        handled.add(args.messageId);
        onApplyCuePatches(args);
      }, []);

      return (
        <StandardTaskChatRail
          workspaceId="ws-1"
          taskId="task-1"
          canPostMessages
          defaultAgentSlug="coach"
          onWorkoutCuesPatch={handleWorkoutCuesPatch}
        />
      );
    }

    const { unmount } = render(<Host />);
    await waitFor(() => expect(onApplyCuePatches).toHaveBeenCalledTimes(1));

    unmount();
    render(<Host />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onApplyCuePatches).toHaveBeenCalledTimes(1);
  });
});

describe('TaskModal Ask Coach wiring (source)', () => {
  it('TaskModal.tsx opens comments tab before sendCoachMessage and gates chatRailRef by active mount', () => {
    const taskModalPath = join(process.cwd(), 'src/components/modals/TaskModal.tsx');
    const src = readFileSync(taskModalPath, 'utf8');

    expect(src.includes("await selectTab('comments')")).toBe(true);
    expect(src.includes("setMobileUnifiedPane('card')")).toBe(true);
    expect(src.includes('activeChatRailMount ===')).toBe(true);
    expect((src.match(/onWorkoutCuesPatch=\{handleWorkoutCuesPatch\}/g) || []).length).toBe(3);
    expect(src.includes('handleAskCoachForCues')).toBe(true);
    expect(src.includes('onAskCoachForCues={handleAskCoachForCues}')).toBe(true);
  });
});
