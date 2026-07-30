import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import {
  TaskModalDetailsBody,
  type TaskModalDetailsBodyProps,
} from '@/components/modals/task-modal/TaskModalDetailsBody';
import type { WorkoutIntakePanelWizardProps } from '@/components/fitness/workout-intake/WorkoutGenerationIntakePanel';
import {
  WORKOUT_INTAKE_DURATION_CHOICES,
  WORKOUT_INTAKE_SORENESS_OPTIONS,
} from '@/lib/agents/coach/task-modal-intake-patch';
import {
  WORKOUT_GENERATION_PHASE_INTENT_OPTIONS,
  WORKOUT_GENERATION_PROGRESSION_TREND_OPTIONS,
} from '@/lib/workout-factory/generation-intake-context';

vi.mock('@/components/fitness/workout-intake/WorkoutGenerationIntakePanel', () => ({
  WorkoutGenerationIntakePanel: () => <div data-testid="mock-workout-generation-intake-panel" />,
}));
vi.mock('@/components/fitness/workout-intake/WorkoutPreflightReadinessPanel', () => ({
  WorkoutPreflightReadinessPanel: () => (
    <div data-testid="mock-workout-preflight-readiness-panel" />
  ),
}));
vi.mock('@/components/fitness/WorkoutOutlinePanel', () => ({
  WorkoutOutlinePanel: () => <div data-testid="mock-workout-outline-panel" />,
}));
vi.mock('@/components/modals/task-modal/TaskModalCardCoverSection', () => ({
  TaskModalCardCoverSection: () => <div data-testid="mock-card-cover" />,
}));
vi.mock('@/components/modals/task-modal/TaskModalItemMetadataSections', () => ({
  TaskModalItemMetadataSections: () => <div data-testid="mock-metadata-sections" />,
}));
vi.mock('@/components/modals/task-modal/TaskModalWorkoutFields', () => ({
  TaskModalWorkoutFields: () => <div data-testid="mock-workout-fields" />,
}));
vi.mock('@/components/modals/task-modal/TaskModalProgramFields', () => ({
  TaskModalProgramFields: () => <div data-testid="mock-program-fields" />,
}));
vi.mock('@/components/modals/task-modal/TaskModalPropertiesSection', () => ({
  TaskModalPropertiesSection: () => <div data-testid="mock-properties" />,
}));
vi.mock('@/components/modals/task-modal/TaskModalSchedulingSection', () => ({
  TaskModalSchedulingSection: () => <div data-testid="mock-scheduling" />,
}));
vi.mock('@/components/modals/task-modal/TaskModalAttachmentsSection', () => ({
  TaskModalAttachmentsSection: () => <div data-testid="mock-attachments" />,
}));
vi.mock('@/components/modals/task-modal/TaskModalDetailsFooterActions', () => ({
  TaskModalDetailsFooterActions: () => <div data-testid="mock-footer-actions" />,
}));

const noop = () => {};

const mockWorkoutIntakePanelProps = {
  step: 1 as const,
  setStep: noop,
  readiness: 5,
  setReadiness: noop,
  sleepQuality: 7,
  setSleepQuality: noop,
  durationMinutes: 'Optimized for Goals' as const,
  setDurationMinutes: noop,
  phaseIntent: 'standard_progression' as const,
  setPhaseIntent: noop,
  soreness: new Set(['None']),
  toggleSoreness: noop,
  sorenessArray: ['None'],
  progressionTrend: 'Appropriately Challenging' as const,
  setProgressionTrend: noop,
  anchorLiftName: '',
  setAnchorLiftName: noop,
  anchorLiftWeight: null,
  setAnchorLiftWeight: noop,
  anchorLiftReps: null,
  setAnchorLiftReps: noop,
  temporaryLimitations: '',
  setTemporaryLimitations: noop,
  durationOptions: WORKOUT_INTAKE_DURATION_CHOICES,
  phaseIntentOptions: WORKOUT_GENERATION_PHASE_INTENT_OPTIONS,
  sorenessOptions: WORKOUT_INTAKE_SORENESS_OPTIONS,
  progressionTrendOptions: WORKOUT_GENERATION_PROGRESSION_TREND_OPTIONS,
} satisfies WorkoutIntakePanelWizardProps;

const mockBuildWizardPayload = () => ({
  durationMinutes: 'Optimized for Goals' as const,
  phaseIntent: 'standard_progression' as const,
  progressionTrend: 'Appropriately Challenging' as const,
  anchorLift: null,
  temporaryLimitations: null,
});

const baseProps: TaskModalDetailsBodyProps = {
  title: 'Snapshot task',
  onTitleChange: noop,
  description: 'Desc',
  onDescriptionChange: noop,
  itemType: 'task',
  canWrite: true,
  onGenerateWorkoutFromIntake: noop,
  onSubmitPreflightAndLaunch: noop,
  aiWorkoutGenerating: false,
  workoutIntakePanelProps: null,
  buildWizardPayload: mockBuildWizardPayload,
  workoutOutlineEditor: null,
  taskId: 'task-snap-1',
  cardCoverPath: '',
  onPickCardCover: noop,
  onRemoveCardCover: () => void Promise.resolve(),
  cardCoverPresetId: '',
  onCardCoverPresetIdChange: noop,
  cardCoverAiHint: '',
  onCardCoverAiHintChange: noop,
  saving: false,
  aiCardCoverGenerating: false,
  onGenerateCardCoverWithAi: noop,
  eventLocation: '',
  onEventLocationChange: noop,
  eventUrl: '',
  onEventUrlChange: noop,
  experienceSeason: '',
  onExperienceSeasonChange: noop,
  scheduledOn: '',
  onExperienceStartDateChange: noop,
  experienceEndDate: '',
  onExperienceEndDateChange: noop,
  memoryCaption: '',
  onMemoryCaptionChange: noop,
  aiWorkoutProgressIdx: null,
  onAiGenerateWorkout: noop,
  workoutTemplates: [],
  templatePickerOpen: false,
  onTemplatePickerOpenChange: noop,
  onApplyWorkoutTemplate: noop,
  workoutType: '',
  onWorkoutTypeChange: noop,
  workoutDurationMin: '',
  onWorkoutDurationMinChange: noop,
  workoutExercises: [],
  onWorkoutExercisesChange: noop,
  workoutUnitSystem: 'metric',
  initialAutoEdit: false,
  isWorkoutItemType: false,
  workspaceId: 'ws-1',
  aiProgramPersonalizing: false,
  onPersonalizeProgram: noop,
  programGoal: '',
  onProgramGoalChange: noop,
  programDurationWeeks: '',
  onProgramDurationWeeksChange: noop,
  programCurrentWeek: 1,
  programSchedule: [],
  dateLabels: { primary: 'Due by', short: 'Due', helper: 'h' },
  status: 'todo',
  onStatusChange: noop,
  statusSelectOptions: [{ value: 'todo', label: 'Todo' }],
  priority: 'medium',
  onPriorityChange: noop,
  assignedTo: null,
  onAssignedToChange: noop,
  workspaceMembersForAssign: [],
  scheduledTime: '',
  onScheduledTimeChange: noop,
  onScheduledOnChange: noop,
  attachments: [],
  isCreateMode: false,
  typeNoun: 'task',
  onPickAttachmentFile: noop,
  onDownloadAttachment: () => void Promise.resolve(),
  onRemoveAttachment: noop,
  coreDirty: false,
  onCreateTask: noop,
  onSaveCoreFields: noop,
  archiving: false,
  loading: false,
  onArchiveTask: noop,
};

describe('TaskModalDetailsBody', () => {
  afterEach(() => {
    cleanup();
  });

  it('matches snapshot (lifted details shell + mocked sub-panels)', () => {
    const { container } = render(<TaskModalDetailsBody {...baseProps} />);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="min-w-0 space-y-4"
        data-testid="task-modal-details-body"
      >
        <div>
          <label
            class="sr-only"
            for="task-title"
          >
            Title
          </label>
          <input
            class="-mx-1.5 w-[calc(100%+0.75rem)] rounded-lg border-none bg-transparent px-1.5 py-0.5 text-2xl font-bold leading-tight tracking-tight text-foreground outline-none transition-colors hover:bg-foreground/[0.04] focus:bg-foreground/[0.06] focus:ring-1 focus:ring-inset focus:ring-ring disabled:opacity-60"
            id="task-title"
            placeholder="Untitled"
            value="Snapshot task"
          />
          <textarea
            aria-label="Description"
            class="-mx-1.5 mt-1.5 w-[calc(100%+0.75rem)] resize-none rounded-lg border-none bg-transparent px-1.5 py-1 text-[14.5px] leading-relaxed text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.04] focus:bg-foreground/[0.06] focus:text-foreground focus:ring-1 focus:ring-inset focus:ring-ring disabled:opacity-60"
            id="task-desc"
            placeholder="Add a description…"
            rows="2"
          >
            Desc
          </textarea>
        </div>
        <div
          data-testid="mock-properties"
        />
        <div
          data-testid="mock-metadata-sections"
        />
        <div
          data-testid="mock-scheduling"
        />
        <div
          data-testid="mock-card-cover"
        />
        <div
          aria-orientation="horizontal"
          class="shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch my-2"
          data-orientation="horizontal"
          data-slot="separator"
          role="separator"
        />
        <div
          data-testid="mock-attachments"
        />
        <div
          data-testid="mock-footer-actions"
        />
      </div>
    `);
  });

  it('shows saved factory summary from taskMetadata when outline editor is null', () => {
    const onOpenWorkoutViewer = vi.fn();
    const taskMetadata = richMetadataWithBlockFormat('emom') as Json;

    render(
      <TaskModalDetailsBody
        {...baseProps}
        itemType="workout"
        isWorkoutItemType
        workoutOutlineEditor={null}
        taskMetadata={taskMetadata}
        onOpenWorkoutViewer={onOpenWorkoutViewer}
        coreDirty={false}
      />,
    );

    expect(screen.getByTestId('task-modal-generated-workout')).toBeTruthy();
    expect(screen.getByText('Generated workout')).toBeTruthy();
    expect(screen.getByText(/Saved — complete the pre-session check-in above/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open workout viewer' }));
    expect(onOpenWorkoutViewer).toHaveBeenCalledTimes(1);
  });

  it('shows unsaved warning when factory metadata is dirty', () => {
    const taskMetadata = richMetadataWithBlockFormat('emom') as Json;

    render(
      <TaskModalDetailsBody
        {...baseProps}
        itemType="workout"
        isWorkoutItemType
        workoutOutlineEditor={null}
        taskMetadata={taskMetadata}
        coreDirty
      />,
    );

    expect(screen.getByText(/Unsaved changes — open the workout viewer/)).toBeTruthy();
  });

  it('renders generation intake when factory is absent', () => {
    render(
      <TaskModalDetailsBody
        {...baseProps}
        itemType="workout"
        isWorkoutItemType
        workoutIntakePanelProps={mockWorkoutIntakePanelProps}
        buildWizardPayload={mockBuildWizardPayload}
      />,
    );

    expect(screen.getByTestId('mock-workout-generation-intake-panel')).toBeTruthy();
    expect(screen.queryByTestId('mock-workout-preflight-readiness-panel')).toBeNull();
  });

  it('renders preflight panel when factory exists', () => {
    const taskMetadata = richMetadataWithBlockFormat('emom') as Json;

    render(
      <TaskModalDetailsBody
        {...baseProps}
        itemType="workout"
        isWorkoutItemType
        taskMetadata={taskMetadata}
        workoutIntakePanelProps={mockWorkoutIntakePanelProps}
        buildWizardPayload={mockBuildWizardPayload}
      />,
    );

    expect(screen.getByTestId('mock-workout-preflight-readiness-panel')).toBeTruthy();
    expect(screen.queryByTestId('mock-workout-generation-intake-panel')).toBeNull();
  });
});
