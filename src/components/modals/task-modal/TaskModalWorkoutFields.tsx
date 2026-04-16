'use client';

import { ChevronDown, Sparkles } from 'lucide-react';
import { WorkoutExercisesEditor } from '@/components/fitness/workout-exercises-editor';
import { PremiumGate } from '@/components/subscription/premium-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WORKOUT_FACTORY_CHAIN_MESSAGES } from '@/lib/workout-factory/api-client';
import { metadataFieldsFromParsed, type WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutTemplate } from '@/hooks/use-workout-templates';
import type { ItemType, UnitSystem } from '@/types/database';
import { cn } from '@/lib/utils';

export type TaskModalWorkoutFieldsProps = {
  itemType: Extract<ItemType, 'workout' | 'workout_log'>;
  canWrite: boolean;
  taskId: string | null;
  aiWorkoutGenerating: boolean;
  aiWorkoutProgressIdx: number;
  onAiGenerateWorkout: () => void | Promise<void>;
  workoutTemplates: WorkoutTemplate[];
  templatePickerOpen: boolean;
  onTemplatePickerOpenChange: (open: boolean) => void;
  onApplyWorkoutTemplate: (tpl: WorkoutTemplate) => void;
  workoutType: string;
  onWorkoutTypeChange: (value: string) => void;
  workoutDurationMin: string;
  onWorkoutDurationMinChange: (value: string) => void;
  workoutExercises: WorkoutExercise[];
  onWorkoutExercisesChange: (next: WorkoutExercise[]) => void;
  workoutUnitSystem: UnitSystem;
  autoEditFirstRow: boolean;
};

export function TaskModalWorkoutFields({
  itemType,
  canWrite,
  taskId,
  aiWorkoutGenerating,
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
  autoEditFirstRow,
}: TaskModalWorkoutFieldsProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {itemType === 'workout_log' ? 'Workout log' : 'Workout details'}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {canWrite && (
            <PremiumGate feature="ai" inline>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={aiWorkoutGenerating}
                onClick={() => void onAiGenerateWorkout()}
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                {aiWorkoutGenerating ? 'Generating…' : 'AI workout'}
              </Button>
            </PremiumGate>
          )}
          {!taskId && workoutTemplates.length > 0 && canWrite && (
            <div className="relative">
              <button
                type="button"
                onClick={() => onTemplatePickerOpenChange(!templatePickerOpen)}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                Use template
                <ChevronDown
                  className={cn(
                    'h-3 w-3 shrink-0 transition-transform',
                    templatePickerOpen && 'rotate-180',
                  )}
                />
              </button>
              {templatePickerOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                  <ul className="max-h-48 overflow-y-auto py-1">
                    {workoutTemplates.map((tpl) => {
                      const tplFields = metadataFieldsFromParsed(tpl.metadata);
                      return (
                        <li key={tpl.id}>
                          <button
                            type="button"
                            onClick={() => onApplyWorkoutTemplate(tpl)}
                            className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <span className="block font-medium">{tpl.title}</span>
                            {tplFields.workoutType && (
                              <span className="text-muted-foreground">
                                {tplFields.workoutType}
                                {tplFields.workoutDurationMin
                                  ? ` · ${tplFields.workoutDurationMin} min`
                                  : ''}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {aiWorkoutGenerating && (
        <p className="text-xs text-muted-foreground">
          {WORKOUT_FACTORY_CHAIN_MESSAGES[aiWorkoutProgressIdx]}
        </p>
      )}
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="task-workout-type">Type</Label>
          <Input
            id="task-workout-type"
            value={workoutType}
            onChange={(e) => onWorkoutTypeChange(e.target.value)}
            disabled={!canWrite}
            placeholder="e.g. Strength, Cardio, Yoga"
            className="h-9"
          />
        </div>
        <div className="w-28 space-y-2">
          <Label htmlFor="task-workout-duration">Duration (min)</Label>
          <Input
            id="task-workout-duration"
            type="number"
            min={0}
            value={workoutDurationMin}
            onChange={(e) => onWorkoutDurationMinChange(e.target.value)}
            disabled={!canWrite}
            className="h-9"
          />
        </div>
      </div>
      <WorkoutExercisesEditor
        key={taskId ?? 'new-task'}
        exercises={workoutExercises}
        onChange={onWorkoutExercisesChange}
        canWrite={canWrite}
        workoutUnitSystem={workoutUnitSystem}
        idPrefix="task-ex"
        autoEditFirstRow={autoEditFirstRow}
      />
    </div>
  );
}
