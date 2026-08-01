'use client';

import { memo } from 'react';
import type { Json, UnitSystem } from '@/types/database';
import type { TaskDateFieldLabels } from '@/lib/task-date-labels';
import type { ItemType } from '@/lib/item-types';
import type { TaskAttachment } from '@/types/task-modal';
import type { TaskPriority } from '@/lib/task-priority';
import type { ProgramWeek, WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutIntakeWizardData } from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';
import type { WorkoutIntakePanelWizardProps } from '@/components/fitness/workout-intake/WorkoutGenerationIntakePanel';
import type { WorkoutTemplate } from '@/hooks/use-workout-templates';
import { WorkoutGenerationIntakePanel } from '@/components/fitness/workout-intake/WorkoutGenerationIntakePanel';
import { WorkoutPreflightReadinessPanel } from '@/components/fitness/workout-intake/WorkoutPreflightReadinessPanel';
import { WorkoutOutlinePanel } from '@/components/fitness/WorkoutOutlinePanel';
import { readCoachOutlineMetadata } from '@/lib/agents/coach/coach-outline-metadata';
import type { WorkoutOutlineEditorState } from '@/components/modals/task-modal/hooks/useWorkoutOutlineEditor';
import { TaskModalPropertiesSection } from '@/components/modals/task-modal/TaskModalPropertiesSection';
import { TaskModalPersonaStrip } from '@/components/modals/task-modal/TaskModalPersonaStrip';
import { TaskModalWorkoutCanvas } from '@/components/modals/task-modal/TaskModalWorkoutCanvas';
import { TaskModalIdeaCanvas } from '@/components/modals/task-modal/TaskModalIdeaCanvas';
import type { PromoteTargetType } from '@/components/modals/task-modal/TaskModalIdeaCanvas';
import { TaskModalEventCanvas } from '@/components/modals/task-modal/TaskModalEventCanvas';
import { TaskModalMemoryCanvas } from '@/components/modals/task-modal/TaskModalMemoryCanvas';
import { TaskModalCardCoverSection } from '@/components/modals/task-modal/TaskModalCardCoverSection';
import { TaskModalItemMetadataSections } from '@/components/modals/task-modal/TaskModalItemMetadataSections';
import { TaskModalProgramFields } from '@/components/modals/task-modal/TaskModalProgramFields';
import { TaskModalWorkoutFields } from '@/components/modals/task-modal/TaskModalWorkoutFields';
import { TaskModalSchedulingSection } from '@/components/modals/task-modal/TaskModalSchedulingSection';
import { TaskModalAttachmentsSection } from '@/components/modals/task-modal/TaskModalAttachmentsSection';
import { TaskModalDetailsFooterActions } from '@/components/modals/task-modal/TaskModalDetailsFooterActions';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { LayoutPanelLeft } from 'lucide-react';
import { isAgentFilledForDisplay, listAgentFilledKeys } from '@/lib/task-field-provenance';

export type TaskModalDetailsBodyProps = {
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  /**
   * The always-visible cover header (`TaskModalCoverHeader`) owns title/description editing.
   * This body only renders its own copies as a fallback for the workout viewer split pane.
   */
  titleFieldsOwnedByCover?: boolean;
  itemType: ItemType;
  canWrite: boolean;
  onGenerateWorkoutFromIntake: (data: WorkoutIntakeWizardData) => void;
  onSubmitPreflightAndLaunch: () => void | Promise<void>;
  preflightSubmitting?: boolean;
  aiWorkoutGenerating: boolean;
  /** Memoized wizard panel props (workout + canWrite only). */
  workoutIntakePanelProps: WorkoutIntakePanelWizardProps | null;
  buildWizardPayload: () => WorkoutIntakeWizardData;
  workoutOutlineEditor: WorkoutOutlineEditorState | null;
  /** When true, outline editing is deferred to the full-page builder (panel hidden). */
  showStructureBuilderCta?: boolean;
  onOpenStructureBuilder?: () => void;
  /** Opens the TaskModal workout viewer split (when factory workout is saved). */
  onOpenWorkoutViewer?: () => void;
  intakeDisabledReason?: string;
  taskId: string | null;
  cardCoverPath: string;
  onPickCardCover: () => void;
  onRemoveCardCover: () => void;
  cardCoverPresetId: string;
  onCardCoverPresetIdChange: (value: string) => void;
  cardCoverAiHint: string;
  onCardCoverAiHintChange: (value: string) => void;
  saving: boolean;
  aiCardCoverGenerating: boolean;
  onGenerateCardCoverWithAi: () => void;
  eventLocation: string;
  onEventLocationChange: (value: string) => void;
  eventUrl: string;
  onEventUrlChange: (value: string) => void;
  eventBring: string[];
  onEventBringChange: (value: string[]) => void;
  eventGoing: string;
  onEventGoingChange: (value: string) => void;
  eventCapacity: string;
  onEventCapacityChange: (value: string) => void;
  eventGoingPeople: string[];
  onEventGoingPeopleChange: (value: string[]) => void;
  experienceSeason: string;
  onExperienceSeasonChange: (value: string) => void;
  scheduledOn: string;
  onExperienceStartDateChange: (value: string) => void;
  experienceEndDate: string;
  onExperienceEndDateChange: (value: string) => void;
  memoryCaption: string;
  onMemoryCaptionChange: (value: string) => void;
  aiWorkoutProgressIdx: number | null;
  onAiGenerateWorkout: () => void;
  workoutTemplates: WorkoutTemplate[];
  templatePickerOpen: boolean;
  onTemplatePickerOpenChange: (open: boolean) => void;
  onApplyWorkoutTemplate: (tpl: WorkoutTemplate) => void;
  workoutType: string;
  onWorkoutTypeChange: (value: string) => void;
  workoutDurationMin: string;
  onWorkoutDurationMinChange: (value: string) => void;
  workoutExercises: WorkoutExercise[];
  onWorkoutExercisesChange: (value: WorkoutExercise[]) => void;
  workoutUnitSystem: UnitSystem;
  initialAutoEdit: boolean;
  isWorkoutItemType: boolean;
  workspaceId: string;
  aiProgramPersonalizing: boolean;
  onPersonalizeProgram: () => void;
  programGoal: string;
  onProgramGoalChange: (value: string) => void;
  programDurationWeeks: string;
  onProgramDurationWeeksChange: (value: string) => void;
  programCurrentWeek: number;
  programSchedule: ProgramWeek[];
  dateLabels: TaskDateFieldLabels;
  status: string;
  onStatusChange: (value: string) => void;
  statusSelectOptions: { value: string; label: string }[];
  priority: TaskPriority;
  onPriorityChange: (value: TaskPriority) => void;
  assignedTo: string | null;
  onAssignedToChange: (value: string | null) => void;
  workspaceMembersForAssign: { user_id: string; label: string }[];
  scheduledTime: string;
  onScheduledTimeChange: (value: string) => void;
  onScheduledOnChange: (value: string) => void;
  attachments: TaskAttachment[];
  isCreateMode: boolean;
  typeNoun: string;
  onPickAttachmentFile: (file: File) => void;
  onDownloadAttachment: (att: TaskAttachment) => void | Promise<void>;
  onRemoveAttachment: (att: TaskAttachment) => void | Promise<void>;
  archiving: boolean;
  loading: boolean;
  onArchiveTask: () => void;
  onHardDeleteTask?: () => void | Promise<void>;
  taskMetadata?: Json;
  /** Idea canvas: graduate to event / program / class via existing type change. */
  onPromoteItemType?: (next: PromoteTargetType) => void;
  /** When false, Idea “Promote to Class” is disabled (matches class item-type gate). */
  canPromoteToClass?: boolean;
  /**
   * Provenance keys the user has overwritten vs last save (live demote for Coach tint).
   * Persisted demotion happens on save / title-desc autosave.
   */
  demotedProvenanceKeys?: readonly string[];
};

function TaskModalDetailsBodyInner(props: TaskModalDetailsBodyProps) {
  const {
    title,
    onTitleChange,
    description,
    onDescriptionChange,
    titleFieldsOwnedByCover = false,
    itemType,
    canWrite,
    onGenerateWorkoutFromIntake,
    onSubmitPreflightAndLaunch,
    preflightSubmitting = false,
    aiWorkoutGenerating,
    workoutIntakePanelProps,
    buildWizardPayload,
    workoutOutlineEditor,
    showStructureBuilderCta,
    onOpenStructureBuilder,
    onOpenWorkoutViewer,
    intakeDisabledReason,
    taskId,
    cardCoverPath,
    onPickCardCover,
    onRemoveCardCover,
    cardCoverPresetId,
    onCardCoverPresetIdChange,
    cardCoverAiHint,
    onCardCoverAiHintChange,
    saving,
    aiCardCoverGenerating,
    onGenerateCardCoverWithAi,
    eventLocation,
    onEventLocationChange,
    eventUrl,
    onEventUrlChange,
    eventBring,
    onEventBringChange,
    eventGoing,
    onEventGoingChange,
    eventCapacity,
    onEventCapacityChange,
    eventGoingPeople,
    onEventGoingPeopleChange,
    experienceSeason,
    onExperienceSeasonChange,
    scheduledOn,
    onExperienceStartDateChange,
    experienceEndDate,
    onExperienceEndDateChange,
    memoryCaption,
    onMemoryCaptionChange,
    aiWorkoutProgressIdx,
    onAiGenerateWorkout,
    workoutTemplates,
    templatePickerOpen,
    onTemplatePickerOpenChange,
    onApplyWorkoutTemplate,
    workoutType,
    onWorkoutTypeChange,
    workoutDurationMin,
    onWorkoutDurationMinChange,
    workoutExercises,
    onWorkoutExercisesChange,
    workoutUnitSystem,
    initialAutoEdit,
    isWorkoutItemType,
    workspaceId,
    aiProgramPersonalizing,
    onPersonalizeProgram,
    programGoal,
    onProgramGoalChange,
    programDurationWeeks,
    onProgramDurationWeeksChange,
    programCurrentWeek,
    programSchedule,
    dateLabels,
    status,
    onStatusChange,
    statusSelectOptions,
    priority,
    onPriorityChange,
    assignedTo,
    onAssignedToChange,
    workspaceMembersForAssign,
    scheduledTime,
    onScheduledTimeChange,
    onScheduledOnChange,
    attachments,
    isCreateMode,
    typeNoun,
    onPickAttachmentFile,
    onDownloadAttachment,
    onRemoveAttachment,
    archiving,
    loading,
    onArchiveTask,
    onHardDeleteTask,
    taskMetadata,
    onPromoteItemType,
    canPromoteToClass = true,
    demotedProvenanceKeys = [],
  } = props;

  const hasFactory = readCoachOutlineMetadata(taskMetadata).hasFactory;
  const agentDisplayKeys = listAgentFilledKeys(taskMetadata).filter((k) =>
    isAgentFilledForDisplay(taskMetadata, k, demotedProvenanceKeys),
  );
  const agentFieldCount = agentDisplayKeys.length;
  const isAgentField = (key: string) =>
    isAgentFilledForDisplay(taskMetadata, key, demotedProvenanceKeys);

  return (
    <div className="min-w-0 space-y-4" data-testid="task-modal-details-body">
      {!titleFieldsOwnedByCover ? (
        <div>
          <label htmlFor="task-title" className="sr-only">
            Title
          </label>
          <input
            id="task-title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={!canWrite}
            placeholder="Untitled"
            className="-mx-1.5 w-[calc(100%+0.75rem)] rounded-lg border-none bg-transparent px-1.5 py-0.5 text-2xl font-bold leading-tight tracking-tight text-foreground outline-none transition-colors hover:bg-foreground/[0.04] focus:bg-foreground/[0.06] focus:ring-1 focus:ring-inset focus:ring-ring disabled:opacity-60"
          />
          <textarea
            id="task-desc"
            aria-label="Description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={!canWrite}
            rows={2}
            placeholder="Add a description…"
            className="-mx-1.5 mt-1.5 w-[calc(100%+0.75rem)] resize-none rounded-lg border-none bg-transparent px-1.5 py-1 text-[14.5px] leading-relaxed text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.04] focus:bg-foreground/[0.06] focus:text-foreground focus:ring-1 focus:ring-inset focus:ring-ring disabled:opacity-60"
          />
        </div>
      ) : null}

      <TaskModalPropertiesSection
        status={status}
        onStatusChange={onStatusChange}
        statusSelectOptions={statusSelectOptions}
        priority={priority}
        onPriorityChange={onPriorityChange}
        workspaceId={workspaceId}
        assignedTo={assignedTo}
        onAssignedToChange={onAssignedToChange}
        workspaceMembersForAssign={workspaceMembersForAssign}
        canWrite={canWrite}
      />

      <TaskModalPersonaStrip agentFieldCount={agentFieldCount} />

      {showStructureBuilderCta && onOpenStructureBuilder ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Edit workout structure in the full-page builder with Coach chat alongside your
            blueprint.
          </p>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="mt-3 gap-2"
            onClick={onOpenStructureBuilder}
          >
            <LayoutPanelLeft className="size-4 shrink-0" aria-hidden />
            Open structure builder
          </Button>
        </div>
      ) : workoutOutlineEditor ? (
        <WorkoutOutlinePanel editor={workoutOutlineEditor} canWrite={canWrite} />
      ) : null}

      {workoutIntakePanelProps && !hasFactory ? (
        <WorkoutGenerationIntakePanel
          {...workoutIntakePanelProps}
          buildWizardPayload={buildWizardPayload}
          handleAiGenerateWorkout={onGenerateWorkoutFromIntake}
          isGenerating={aiWorkoutGenerating}
          disabledReason={intakeDisabledReason}
        />
      ) : null}

      {workoutIntakePanelProps && hasFactory ? (
        <WorkoutPreflightReadinessPanel
          {...workoutIntakePanelProps}
          onSubmitPreflight={onSubmitPreflightAndLaunch}
          isSubmitting={preflightSubmitting}
          disabledReason={intakeDisabledReason}
        />
      ) : null}

      {itemType === 'workout' ? <TaskModalWorkoutCanvas taskMetadata={taskMetadata} /> : null}

      {itemType === 'idea' ? (
        <TaskModalIdeaCanvas
          taskMetadata={taskMetadata}
          canWrite={canWrite}
          canPromoteToClass={canPromoteToClass}
          onPromoteItemType={onPromoteItemType}
          isAgentField={isAgentField}
        />
      ) : null}

      {itemType === 'memory' ? (
        <TaskModalMemoryCanvas
          attachments={attachments}
          canWrite={canWrite}
          isCreateMode={isCreateMode}
          taskId={taskId}
          typeNoun={typeNoun}
          onPickAttachmentFile={onPickAttachmentFile}
          onDownloadAttachment={onDownloadAttachment}
          onRemoveAttachment={onRemoveAttachment}
        />
      ) : null}

      {itemType === 'event' ? (
        <TaskModalEventCanvas
          canWrite={canWrite}
          eventGoing={eventGoing}
          onEventGoingChange={onEventGoingChange}
          eventCapacity={eventCapacity}
          onEventCapacityChange={onEventCapacityChange}
          eventGoingPeople={eventGoingPeople}
          onEventGoingPeopleChange={onEventGoingPeopleChange}
          eventBring={eventBring}
          onEventBringChange={onEventBringChange}
          isAgentField={isAgentField}
        />
      ) : null}

      {hasFactory && itemType === 'workout' && onOpenWorkoutViewer ? (
        <div className="flex justify-end" data-testid="task-modal-generated-workout">
          <Button type="button" variant="outline" size="sm" onClick={onOpenWorkoutViewer}>
            Open workout viewer
          </Button>
        </div>
      ) : null}

      <TaskModalItemMetadataSections
        itemType={itemType}
        canWrite={canWrite}
        eventLocation={eventLocation}
        onEventLocationChange={onEventLocationChange}
        eventUrl={eventUrl}
        onEventUrlChange={onEventUrlChange}
        experienceSeason={experienceSeason}
        onExperienceSeasonChange={onExperienceSeasonChange}
        scheduledOn={scheduledOn}
        onExperienceStartDateChange={onExperienceStartDateChange}
        experienceEndDate={experienceEndDate}
        onExperienceEndDateChange={onExperienceEndDateChange}
        memoryCaption={memoryCaption}
        onMemoryCaptionChange={onMemoryCaptionChange}
        isAgentField={isAgentField}
      />

      {itemType === 'workout_log' && (
        <TaskModalWorkoutFields
          itemType="workout_log"
          canWrite={canWrite}
          taskId={taskId}
          aiWorkoutGenerating={aiWorkoutGenerating}
          aiWorkoutProgressIdx={aiWorkoutProgressIdx ?? 0}
          onAiGenerateWorkout={onAiGenerateWorkout}
          workoutTemplates={workoutTemplates}
          templatePickerOpen={templatePickerOpen}
          onTemplatePickerOpenChange={onTemplatePickerOpenChange}
          onApplyWorkoutTemplate={onApplyWorkoutTemplate}
          workoutType={workoutType}
          onWorkoutTypeChange={onWorkoutTypeChange}
          workoutDurationMin={workoutDurationMin}
          onWorkoutDurationMinChange={onWorkoutDurationMinChange}
          workoutExercises={workoutExercises}
          onWorkoutExercisesChange={onWorkoutExercisesChange}
          workoutUnitSystem={workoutUnitSystem}
          autoEditFirstRow={Boolean(initialAutoEdit && isWorkoutItemType && taskId && canWrite)}
          taskMetadata={taskMetadata}
          isAgentField={isAgentField}
        />
      )}

      {itemType === 'program' && (
        <TaskModalProgramFields
          canWrite={canWrite}
          workspaceId={workspaceId}
          taskId={taskId}
          aiProgramPersonalizing={aiProgramPersonalizing}
          onPersonalizeProgram={onPersonalizeProgram}
          programGoal={programGoal}
          onProgramGoalChange={onProgramGoalChange}
          programDurationWeeks={programDurationWeeks}
          onProgramDurationWeeksChange={onProgramDurationWeeksChange}
          programCurrentWeek={programCurrentWeek}
          programSchedule={programSchedule}
          isAgentField={isAgentField}
        />
      )}

      <TaskModalSchedulingSection
        itemType={itemType}
        dateLabels={dateLabels}
        scheduledOn={scheduledOn}
        onScheduledOnChange={onScheduledOnChange}
        scheduledTime={scheduledTime}
        onScheduledTimeChange={onScheduledTimeChange}
        canWrite={canWrite}
      />

      <TaskModalCardCoverSection
        taskId={taskId}
        cardCoverPath={cardCoverPath}
        onPickCardCover={onPickCardCover}
        onRemoveCardCover={onRemoveCardCover}
        cardCoverPresetId={cardCoverPresetId}
        onCardCoverPresetIdChange={onCardCoverPresetIdChange}
        cardCoverAiHint={cardCoverAiHint}
        onCardCoverAiHintChange={onCardCoverAiHintChange}
        canWrite={canWrite}
        saving={saving}
        aiCardCoverGenerating={aiCardCoverGenerating}
        onGenerateCardCoverWithAi={onGenerateCardCoverWithAi}
      />

      <Separator className="my-2" />

      <TaskModalAttachmentsSection
        attachments={attachments}
        isCreateMode={isCreateMode}
        taskId={taskId}
        canWrite={canWrite}
        typeNoun={typeNoun}
        onPickAttachmentFile={onPickAttachmentFile}
        onDownloadAttachment={onDownloadAttachment}
        onRemoveAttachment={onRemoveAttachment}
      />

      <TaskModalDetailsFooterActions
        canWrite={canWrite}
        isCreateMode={isCreateMode}
        saving={saving}
        typeNoun={typeNoun}
        taskId={taskId}
        archiving={archiving}
        loading={loading}
        onArchiveTask={onArchiveTask}
        onHardDeleteTask={onHardDeleteTask}
      />
    </div>
  );
}

export const TaskModalDetailsBody = memo(TaskModalDetailsBodyInner);
