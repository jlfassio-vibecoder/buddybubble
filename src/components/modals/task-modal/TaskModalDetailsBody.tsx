'use client';

import { memo } from 'react';
import type { Json, UnitSystem } from '@/types/database';
import type { TaskDateFieldLabels } from '@/lib/task-date-labels';
import type { RefObject } from 'react';
import type { ItemType } from '@/lib/item-types';
import type { TaskAttachment } from '@/types/task-modal';
import type { TaskPriority } from '@/lib/task-priority';
import type { ProgramWeek, WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutIntakeWizardData } from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';
import { useWorkoutIntakeWizardState } from '@/components/modals/task-modal/hooks/useWorkoutIntakeWizardState';
import type { WorkoutIntakePanelWizardProps } from '@/components/fitness/WorkoutIntakePanel';
import type { WorkoutTemplate } from '@/hooks/use-workout-templates';
import { WorkoutIntakePanel } from '@/components/fitness/WorkoutIntakePanel';
import { WorkoutOutlinePanel } from '@/components/fitness/WorkoutOutlinePanel';
import type { WorkoutOutlineEditorState } from '@/components/modals/task-modal/hooks/useWorkoutOutlineEditor';
import { TaskModalCardCoverSection } from '@/components/modals/task-modal/TaskModalCardCoverSection';
import { TaskModalItemMetadataSections } from '@/components/modals/task-modal/TaskModalItemMetadataSections';
import { TaskModalProgramFields } from '@/components/modals/task-modal/TaskModalProgramFields';
import { TaskModalWorkoutFields } from '@/components/modals/task-modal/TaskModalWorkoutFields';
import { TaskModalSchedulingSection } from '@/components/modals/task-modal/TaskModalSchedulingSection';
import { TaskModalAttachmentsSection } from '@/components/modals/task-modal/TaskModalAttachmentsSection';
import { TaskModalDetailsFooterActions } from '@/components/modals/task-modal/TaskModalDetailsFooterActions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

function pickWorkoutIntakePanelWizardProps(
  w: ReturnType<typeof useWorkoutIntakeWizardState>,
): WorkoutIntakePanelWizardProps {
  const {
    applyTaskModalIntakePatch,
    applyTaskModalIntakePatchFromMessage,
    markUserTouched,
    buildWizardPayload,
    ...rest
  } = w;
  return rest;
}

export type TaskModalDetailsBodyProps = {
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  itemType: ItemType;
  canWrite: boolean;
  onGenerateWorkoutFromIntake: (data: WorkoutIntakeWizardData) => void;
  aiWorkoutGenerating: boolean;
  /** When set with workout + canWrite, renders controlled `WorkoutIntakePanel`. */
  workoutIntakeState: ReturnType<typeof useWorkoutIntakeWizardState> | null;
  workoutOutlineEditor: WorkoutOutlineEditorState | null;
  intakeDisabledReason?: string;
  taskId: string | null;
  cardCoverPath: string;
  cardCoverFileInputRef: RefObject<HTMLInputElement | null>;
  onCardCoverFileChange: (file: File) => void;
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
  coreDirty: boolean;
  onCreateTask: () => void;
  onSaveCoreFields: () => void | Promise<void>;
  archiving: boolean;
  loading: boolean;
  onArchiveTask: () => void;
  onHardDeleteTask?: () => void | Promise<void>;
  taskMetadata?: Json;
};

function TaskModalDetailsBodyInner(props: TaskModalDetailsBodyProps) {
  const {
    title,
    onTitleChange,
    description,
    onDescriptionChange,
    itemType,
    canWrite,
    onGenerateWorkoutFromIntake,
    aiWorkoutGenerating,
    workoutIntakeState,
    workoutOutlineEditor,
    intakeDisabledReason,
    taskId,
    cardCoverPath,
    cardCoverFileInputRef,
    onCardCoverFileChange,
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
    coreDirty,
    onCreateTask,
    onSaveCoreFields,
    archiving,
    loading,
    onArchiveTask,
    onHardDeleteTask,
    taskMetadata,
  } = props;

  return (
    <div className="min-w-0 space-y-4" data-testid="task-modal-details-body">
      <div className="space-y-2">
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={!canWrite}
          className="h-9"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="task-desc">Description</Label>
        <Textarea
          id="task-desc"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          disabled={!canWrite}
          rows={5}
        />
      </div>

      {workoutOutlineEditor ? (
        <WorkoutOutlinePanel editor={workoutOutlineEditor} canWrite={canWrite} />
      ) : null}

      {workoutIntakeState ? (
        <WorkoutIntakePanel
          {...pickWorkoutIntakePanelWizardProps(workoutIntakeState)}
          handleAiGenerateWorkout={onGenerateWorkoutFromIntake}
          isGenerating={aiWorkoutGenerating}
          disabledReason={intakeDisabledReason}
        />
      ) : null}

      <TaskModalCardCoverSection
        taskId={taskId}
        cardCoverPath={cardCoverPath}
        cardCoverFileInputRef={cardCoverFileInputRef}
        onCardCoverFileChange={onCardCoverFileChange}
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
        />
      )}

      <TaskModalSchedulingSection
        itemType={itemType}
        dateLabels={dateLabels}
        status={status}
        onStatusChange={onStatusChange}
        statusSelectOptions={statusSelectOptions}
        priority={priority}
        onPriorityChange={onPriorityChange}
        workspaceId={workspaceId}
        assignedTo={assignedTo}
        onAssignedToChange={onAssignedToChange}
        workspaceMembersForAssign={workspaceMembersForAssign}
        scheduledOn={scheduledOn}
        onScheduledOnChange={onScheduledOnChange}
        scheduledTime={scheduledTime}
        onScheduledTimeChange={onScheduledTimeChange}
        canWrite={canWrite}
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
        title={title}
        typeNoun={typeNoun}
        coreDirty={coreDirty}
        onCreateTask={onCreateTask}
        onSaveCoreFields={onSaveCoreFields}
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
