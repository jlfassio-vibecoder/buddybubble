'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProgramWeek } from '@/lib/item-metadata';
import { TaskModalField } from '@/components/modals/task-modal/TaskModalSection';
import { TaskModalProgramWeekCards } from '@/components/modals/task-modal/TaskModalProgramWeekCards';

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
  isAgentField,
}: TaskModalProgramFieldsProps) {
  const agent = (key: string) => Boolean(isAgentField?.(key));
  const hasSchedule = programSchedule.some((w) => (w.days?.length ?? 0) > 0);

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

      {programCurrentWeek > 0 && programDurationWeeks && (
        <p className="text-xs text-muted-foreground">
          Progress: Week {programCurrentWeek} of {programDurationWeeks}
        </p>
      )}

      {hasSchedule ? (
        <TaskModalField label="Weekly schedule" agent={agent('schedule')} className="mb-0">
          <TaskModalProgramWeekCards
            programSchedule={programSchedule}
            programDurationWeeks={programDurationWeeks}
          />
        </TaskModalField>
      ) : null}
    </div>
  );
}
