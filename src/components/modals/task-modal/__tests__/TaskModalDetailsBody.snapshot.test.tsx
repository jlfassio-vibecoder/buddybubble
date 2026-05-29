import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RefObject } from 'react';
import { createRef } from 'react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import {
  TaskModalDetailsBody,
  type TaskModalDetailsBodyProps,
} from '@/components/modals/task-modal/TaskModalDetailsBody';

vi.mock('@/components/fitness/WorkoutIntakePanel', () => ({
  WorkoutIntakePanel: () => <div data-testid="mock-workout-intake-panel" />,
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
const cardCoverFileInputRef: RefObject<HTMLInputElement | null> = createRef();

const baseProps: TaskModalDetailsBodyProps = {
  title: 'Snapshot task',
  onTitleChange: noop,
  description: 'Desc',
  onDescriptionChange: noop,
  itemType: 'task',
  canWrite: true,
  onGenerateWorkoutFromIntake: noop,
  aiWorkoutGenerating: false,
  workoutIntakeState: null,
  workoutOutlineEditor: null,
  taskId: 'task-snap-1',
  cardCoverPath: '',
  cardCoverFileInputRef,
  onCardCoverFileChange: noop,
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
  it('matches snapshot (lifted details shell + mocked sub-panels)', () => {
    const { container } = render(<TaskModalDetailsBody {...baseProps} />);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="min-w-0 space-y-4"
        data-testid="task-modal-details-body"
      >
        <div
          class="space-y-2"
        >
          <label
            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
            data-slot="label"
            for="task-title"
          >
            Title
          </label>
          <input
            class="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-9"
            data-slot="input"
            id="task-title"
            value="Snapshot task"
          />
        </div>
        <div
          class="space-y-2"
        >
          <label
            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
            data-slot="label"
            for="task-desc"
          >
            Description
          </label>
          <textarea
            class="flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
            data-slot="textarea"
            id="task-desc"
            rows="5"
          >
            Desc
          </textarea>
        </div>
        <div
          data-testid="mock-card-cover"
        />
        <div
          data-testid="mock-metadata-sections"
        />
        <div
          data-testid="mock-scheduling"
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
    expect(screen.getByText(/Saved — open the workout viewer/)).toBeTruthy();
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
});
