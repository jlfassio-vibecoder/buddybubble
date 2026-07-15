import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkoutBuilderShell } from '@/features/workout-builder/WorkoutBuilderShell';

const mocks = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockRouterBack: vi.fn(),
  mockSaveCoreFields: vi.fn().mockResolvedValue(true),
  coreDirty: true,
  mockOutlineEditor: {
    draftBlocks: [] as Record<string, unknown>[],
    outlineUiState: 'empty' as 'empty' | 'confirmed',
    validationDrops: [] as unknown[],
    isOutlineConfirmed: false,
    canRunIntake: false,
    expandedBlockIdx: null as number | null,
    setExpandedBlockIdx: vi.fn(),
    localError: null as string | null,
    isGenerating: false,
    addFromCatalog: vi.fn(),
    addInstructionBlock: vi.fn(),
    updateBlock: vi.fn(),
    removeBlock: vi.fn(),
    reorderBlocks: vi.fn(),
    saveDraft: vi.fn(),
    confirmStructure: vi.fn(),
    editStructure: vi.fn(),
    retryStructure: vi.fn(),
    applyCoachPatch: vi.fn(() => true),
    hasFactory: false,
    title: 'Leg day',
    description: '',
    setDraftBlocks: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.mockRouterPush, back: mocks.mockRouterBack, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/workout-builder/useWorkoutBuilderTaskHost', () => ({
  useWorkoutBuilderTaskHost: () => ({
    taskId: 'task-1',
    bubbleId: 'bubble-1',
    title: 'Leg day',
    description: '',
    loading: false,
    error: null,
    canWrite: true,
    canPostMessages: true,
    workoutHashExerciseNames: [],
    metadata: {},
    setMetadata: vi.fn(),
    workoutDurationMin: '',
    workoutExercises: [],
    setTitle: vi.fn(),
    setDescription: vi.fn(),
    setWorkoutType: vi.fn(),
    setWorkoutDurationMin: vi.fn(),
    setWorkoutExercises: vi.fn(),
    outlineEditor: mocks.mockOutlineEditor,
    loadTask: vi.fn(),
    saveCoreFields: mocks.mockSaveCoreFields,
    saving: false,
    metadataForSave: {},
    originalRef: { current: null },
    patchOriginalMetadataJson: vi.fn(),
    pendingWorkoutCuesByMessageRef: { current: new Map() },
    cueStaleRefetchScheduledRef: { current: false },
    itemType: 'workout' as const,
    status: 'todo',
    priority: 'medium' as const,
    scheduledOn: '',
    scheduledTime: '',
    visibility: 'private' as const,
    assignedTo: null,
    liveStreamEnabled: false,
  }),
}));

vi.mock('@/lib/feature-flags/standardTaskChatRail', () => ({
  isStandardTaskChatRailEnabled: () => true,
}));

vi.mock('@/components/fitness/WorkoutOutlinePanel', () => ({
  WorkoutOutlinePanel: () => <div data-testid="workout-outline-panel" />,
}));

vi.mock('@/components/chat/StandardTaskChatRail', () => ({
  StandardTaskChatRail: () => <div data-testid="standard-task-chat-rail" />,
}));

vi.mock('@/components/modals/task-modal/hooks/useWorkoutUnitSystem', () => ({
  useWorkoutUnitSystem: () => ({ workoutUnitSystem: 'metric', setWorkoutUnitSystem: vi.fn() }),
}));

vi.mock('@/components/modals/task-modal/hooks/useTaskDirtyState', () => ({
  useTaskDirtyState: () => ({ coreDirty: mocks.coreDirty }),
}));

vi.mock('@/components/modals/task-modal/hooks/useTaskWorkoutAi', () => ({
  useTaskWorkoutAi: () => ({
    aiWorkoutGenerating: false,
    handleAiGenerateWorkout: vi.fn(),
    handleWorkoutViewerApply: vi.fn(),
    handleWorkoutViewerCuePatches: vi.fn(),
  }),
}));

vi.mock('@/hooks/useExerciseCueResolution', () => ({
  useExerciseCueResolution: () => ({
    cuesByKey: {},
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/components/modals/task-modal/hooks/useFitnessProfileInjuries', () => ({
  useFitnessProfileInjuries: () => false,
}));

vi.mock('@/store/userProfileStore', () => ({
  useUserProfileStore: (selector: (s: { profile: { id: string } | null }) => unknown) =>
    selector({ profile: { id: 'user-1' } }),
}));

describe('WorkoutBuilderShell', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses clipped flex columns for independent structure/chat scrolling', () => {
    mocks.coreDirty = true;
    mocks.mockOutlineEditor.isOutlineConfirmed = false;
    mocks.mockOutlineEditor.canRunIntake = false;
    mocks.mockOutlineEditor.outlineUiState = 'empty';

    const { container } = render(
      <WorkoutBuilderShell
        workspaceId="ws-1"
        task={{
          id: 'task-1',
          title: 'Leg day',
          description: '',
          bubble_id: 'bubble-1',
          metadata: {},
          item_type: 'workout',
          memberRole: 'member',
        }}
      />,
    );

    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root!.className).toMatch(/\boverflow-hidden\b/);
    expect(root!.className).toMatch(/\bflex-1\b/);
    expect(root!.className).toMatch(/\bmin-h-0\b/);

    const grid = root!.querySelector('.grid');
    expect(grid).not.toBeNull();
    expect(grid!.className).toMatch(/\boverflow-hidden\b/);
    expect(grid!.className).toMatch(/\bmin-h-0\b/);

    const structureOuter = grid!.children[0] as HTMLElement;
    expect(structureOuter.className).toMatch(/\boverflow-hidden\b/);
    expect(structureOuter.className).not.toMatch(/\boverflow-y-auto\b/);
    const structureScroll = structureOuter.querySelector('.overflow-y-auto');
    expect(structureScroll).not.toBeNull();
    expect(structureScroll!.className).toMatch(/\bmin-h-0\b/);
    expect(structureScroll!.className).toMatch(/\bflex-1\b/);

    const chatOuter = grid!.children[1] as HTMLElement;
    expect(chatOuter.className).toMatch(/\boverflow-hidden\b/);
    expect(chatOuter.className).toMatch(/\bmin-h-0\b/);
  });

  it('renders outline panel and chat rail', () => {
    mocks.coreDirty = true;
    mocks.mockOutlineEditor.isOutlineConfirmed = false;
    mocks.mockOutlineEditor.canRunIntake = false;
    mocks.mockOutlineEditor.outlineUiState = 'empty';

    render(
      <WorkoutBuilderShell
        workspaceId="ws-1"
        task={{
          id: 'task-1',
          title: 'Leg day',
          description: '',
          bubble_id: 'bubble-1',
          metadata: {},
          item_type: 'workout',
          memberRole: 'member',
        }}
      />,
    );
    expect(screen.getAllByRole('heading', { name: 'Leg day' }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('workout-outline-panel')).toBeTruthy();
    expect(screen.getByTestId('standard-task-chat-rail')).toBeTruthy();
    expect(screen.queryByText('Workout intake')).toBeNull();
  });

  it('does not navigate away when structure is already confirmed', () => {
    mocks.coreDirty = true;
    mocks.mockRouterPush.mockClear();
    mocks.mockRouterBack.mockClear();
    mocks.mockOutlineEditor.isOutlineConfirmed = true;
    mocks.mockOutlineEditor.canRunIntake = true;
    mocks.mockOutlineEditor.outlineUiState = 'confirmed';

    render(
      <WorkoutBuilderShell
        workspaceId="ws-1"
        task={{
          id: 'task-1',
          title: 'Leg day',
          description: '',
          bubble_id: 'bubble-1',
          metadata: {},
          item_type: 'workout',
          memberRole: 'member',
        }}
      />,
    );

    expect(mocks.mockRouterPush).not.toHaveBeenCalled();
    expect(mocks.mockRouterBack).not.toHaveBeenCalled();
    expect(screen.getByText('Workout intake')).toBeTruthy();
  });

  it('saves and navigates with handoff when dirty', async () => {
    mocks.coreDirty = true;
    mocks.mockRouterPush.mockClear();
    mocks.mockSaveCoreFields.mockClear();
    mocks.mockOutlineEditor.isOutlineConfirmed = true;
    mocks.mockOutlineEditor.canRunIntake = true;
    mocks.mockOutlineEditor.outlineUiState = 'confirmed';
    mocks.mockOutlineEditor.hasFactory = true;

    render(
      <WorkoutBuilderShell
        workspaceId="ws-1"
        task={{
          id: 'task-1',
          title: 'Leg day',
          description: '',
          bubble_id: 'bubble-1',
          metadata: {},
          item_type: 'workout',
          memberRole: 'member',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save & Return to Board' }));

    await waitFor(() => {
      expect(mocks.mockSaveCoreFields).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mocks.mockRouterPush).toHaveBeenCalledTimes(1);
    });
    expect(String(mocks.mockRouterPush.mock.calls[0][0])).toContain('open_task=task-1');
    expect(String(mocks.mockRouterPush.mock.calls[0][0])).toContain('open_workout_viewer=1');
  });

  it('navigates with handoff without save when clean', async () => {
    mocks.coreDirty = false;
    mocks.mockRouterPush.mockClear();
    mocks.mockSaveCoreFields.mockClear();
    mocks.mockOutlineEditor.isOutlineConfirmed = true;
    mocks.mockOutlineEditor.canRunIntake = true;
    mocks.mockOutlineEditor.outlineUiState = 'confirmed';
    mocks.mockOutlineEditor.hasFactory = true;

    render(
      <WorkoutBuilderShell
        workspaceId="ws-1"
        task={{
          id: 'task-1',
          title: 'Leg day',
          description: '',
          bubble_id: 'bubble-1',
          metadata: {},
          item_type: 'workout',
          memberRole: 'member',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Return to Board' }));

    await waitFor(() => {
      expect(mocks.mockRouterPush).toHaveBeenCalledTimes(1);
    });
    expect(mocks.mockSaveCoreFields).not.toHaveBeenCalled();
    expect(String(mocks.mockRouterPush.mock.calls[0][0])).toContain('open_task=task-1');
  });
});
