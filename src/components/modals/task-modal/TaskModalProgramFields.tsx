'use client';

import { Plus, Sparkles, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { appendProgramWeek, type ProgramWeek } from '@/lib/item-metadata';
import {
  TaskModalField,
  taskModalInputClass,
} from '@/components/modals/task-modal/TaskModalSection';
import {
  TaskModalProgramWeekCards,
  type ProgramLinkedWorkout,
} from '@/components/modals/task-modal/TaskModalProgramWeekCards';

const AVATAR_PREVIEW = 4;

export type ProgramEnrollPerson = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type TaskModalProgramFieldsProps = {
  canWrite: boolean;
  workspaceId: string | null;
  taskId: string | null;
  aiProgramPersonalizing: boolean;
  onPersonalizeProgram: () => void | Promise<void>;
  programGoal: string;
  onProgramGoalChange: (value: string) => void;
  programDurationWeeks: string;
  onProgramDurationWeeksChange: (value: string) => void;
  programDaysPerWeek: string;
  onProgramDaysPerWeekChange: (value: string) => void;
  programLevel: string;
  onProgramLevelChange: (value: string) => void;
  programCurrentWeek: number;
  programSchedule: ProgramWeek[];
  onProgramScheduleChange: (value: ProgramWeek[]) => void;
  programCapacity: string;
  onProgramCapacityChange: (value: string) => void;
  enrolledCount: number;
  enrollPeople: ProgramEnrollPerson[];
  isEnrolled: boolean;
  onToggleEnroll: () => void;
  enrollBusy?: boolean;
  enrollDisabled?: boolean;
  enrollLoading?: boolean;
  linkedWorkouts?: ProgramLinkedWorkout[];
  onOpenLinkedTask?: (taskId: string) => void;
  isAgentField?: (key: string) => boolean;
};

export function TaskModalProgramFields({
  canWrite,
  workspaceId,
  taskId,
  aiProgramPersonalizing,
  onPersonalizeProgram,
  programGoal,
  onProgramGoalChange,
  programDurationWeeks,
  onProgramDurationWeeksChange,
  programDaysPerWeek,
  onProgramDaysPerWeekChange,
  programLevel,
  onProgramLevelChange,
  programCurrentWeek,
  programSchedule,
  onProgramScheduleChange,
  programCapacity,
  onProgramCapacityChange,
  enrolledCount,
  enrollPeople,
  isEnrolled,
  onToggleEnroll,
  enrollBusy = false,
  enrollDisabled = false,
  enrollLoading = false,
  linkedWorkouts,
  onOpenLinkedTask,
  isAgentField,
}: TaskModalProgramFieldsProps) {
  const agent = (key: string) => Boolean(isAgentField?.(key));
  const hasSchedule = programSchedule.length > 0;

  const capacityN = (() => {
    const n = parseInt(programCapacity, 10);
    return !isNaN(n) && n > 0 ? n : null;
  })();
  const atCapacity = capacityN != null && enrolledCount >= capacityN && !isEnrolled;
  const shown = enrollPeople.slice(0, AVATAR_PREVIEW);
  const overflow = Math.max(0, enrollPeople.length - shown.length);
  const enrollLabel =
    capacityN == null ? `${enrolledCount}/∞ enrolled` : `${enrolledCount}/${capacityN} enrolled`;

  const handleAddWeek = () => {
    const next = appendProgramWeek(programSchedule);
    onProgramScheduleChange(next);
    const maxWeek = next.reduce((m, w) => Math.max(m, w.week), 0);
    const dw = parseInt(programDurationWeeks, 10);
    if (isNaN(dw) || dw < maxWeek) {
      onProgramDurationWeeksChange(String(maxWeek));
    }
  };

  const handleWeekFocusChange = (weekNumber: number, focus: string) => {
    onProgramScheduleChange(
      programSchedule.map((w) => (w.week === weekNumber ? { ...w, focus } : w)),
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Program details</p>
        {canWrite && workspaceId && taskId ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={aiProgramPersonalizing}
            onClick={() => void onPersonalizeProgram()}
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            {aiProgramPersonalizing ? 'Personalizing…' : 'Personalize with AI'}
          </Button>
        ) : null}
      </div>

      <TaskModalField label="Goal" agent={agent('goal')} className="mb-0">
        <Input
          id="task-program-goal"
          value={programGoal}
          onChange={(e) => onProgramGoalChange(e.target.value)}
          disabled={!canWrite}
          placeholder="e.g. Build lean muscle, Run a 5K"
          className="h-9"
        />
      </TaskModalField>

      <div className="flex flex-wrap gap-3">
        <TaskModalField
          label="Duration (weeks)"
          agent={agent('duration_weeks')}
          className="mb-0 w-36"
        >
          <Input
            id="task-program-duration"
            type="number"
            min={1}
            value={programDurationWeeks}
            onChange={(e) => onProgramDurationWeeksChange(e.target.value)}
            disabled={!canWrite}
            className="h-9"
          />
        </TaskModalField>
        <TaskModalField label="Days / week" agent={agent('days_per_week')} className="mb-0 w-28">
          <Input
            id="task-program-days-per-week"
            type="number"
            min={1}
            max={7}
            value={programDaysPerWeek}
            onChange={(e) => onProgramDaysPerWeekChange(e.target.value)}
            disabled={!canWrite}
            className="h-9"
            data-testid="task-modal-program-days-per-week"
          />
        </TaskModalField>
        <TaskModalField label="Level" agent={agent('level')} className="mb-0 w-44">
          <select
            id="task-program-level"
            value={programLevel}
            onChange={(e) => onProgramLevelChange(e.target.value)}
            disabled={!canWrite}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            data-testid="task-modal-program-level"
          >
            <option value="">—</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </TaskModalField>
      </div>

      <div
        className="flex flex-wrap items-end justify-between gap-3 rounded-[var(--radius-xl)] border border-border bg-background px-3.5 py-3.5"
        data-testid="task-modal-program-enroll"
      >
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight text-foreground">
            <Users className="size-3.5 text-muted-foreground" aria-hidden />
            {enrollLoading && enrollPeople.length === 0 ? (
              <span className="text-muted-foreground">Loading enrollment…</span>
            ) : (
              <span data-testid="task-modal-program-enroll-count">{enrollLabel}</span>
            )}
          </div>
          {shown.length > 0 ? (
            <AvatarGroup
              className="-space-x-1.5 *:data-[slot=avatar]:size-7 *:data-[slot=avatar]:ring-1 *:data-[slot=avatar]:ring-background"
              data-testid="task-modal-program-enroll-avatars"
            >
              {shown.map((person) => {
                const initial = person.displayName.slice(0, 1).toUpperCase() || '?';
                return (
                  <Avatar key={person.id} size="sm" title={person.displayName}>
                    {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt="" /> : null}
                    <AvatarFallback className="text-[10px] text-muted-foreground">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                );
              })}
              {overflow > 0 ? (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-1 ring-background">
                  +{overflow}
                </span>
              ) : null}
            </AvatarGroup>
          ) : null}
        </div>
        <Button
          type="button"
          variant={isEnrolled ? 'outline' : 'default'}
          size="sm"
          disabled={enrollDisabled || enrollBusy || (!isEnrolled && atCapacity)}
          onClick={onToggleEnroll}
          data-testid="task-modal-program-enroll-toggle"
        >
          {enrollBusy ? 'Updating…' : isEnrolled ? 'Leave' : 'Enroll'}
        </Button>
      </div>

      <TaskModalField label="Capacity" optional agent={agent('capacity')} className="mb-0">
        <input
          type="number"
          min={1}
          value={programCapacity}
          onChange={(e) => onProgramCapacityChange(e.target.value)}
          disabled={!canWrite}
          placeholder="Unlimited"
          aria-label="Program capacity"
          className={taskModalInputClass}
          data-testid="task-modal-program-capacity"
        />
      </TaskModalField>

      {programCurrentWeek > 0 && programDurationWeeks && (
        <p className="text-xs text-muted-foreground">
          Progress: Week {programCurrentWeek} of {programDurationWeeks}
        </p>
      )}

      <TaskModalField label="Weekly schedule" agent={agent('schedule')} className="mb-0">
        {hasSchedule ? (
          <TaskModalProgramWeekCards
            programSchedule={programSchedule}
            programDurationWeeks={programDurationWeeks}
            canWrite={canWrite}
            onWeekFocusChange={canWrite ? handleWeekFocusChange : undefined}
            linkedWorkouts={linkedWorkouts}
            onOpenLinkedTask={onOpenLinkedTask}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            No sessions yet — ask the Coach to lay out the weeks, or add a week below.
          </p>
        )}
        {canWrite ? (
          <Button
            type="button"
            variant="outline"
            className="mt-2 h-10 w-full border-dashed"
            onClick={handleAddWeek}
            data-testid="task-modal-program-add-week"
          >
            <Plus className="size-3.5" aria-hidden />
            Add week
          </Button>
        ) : null}
      </TaskModalField>
    </div>
  );
}
