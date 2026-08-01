'use client';

import { useMemo } from 'react';
import { ClipboardList, Play } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { WorkoutLogReadSummary } from '@/components/fitness/workout-block-renderer';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  readSessionCompletion,
  readSessionDurationMin,
  readSessionRpe,
} from '@/lib/fitness/workout-log-session-stats';
import { isWorkoutLogInProgress, readWorkoutLogSourceTaskId } from '@/lib/workout-log-task-state';
import type { Json, UnitSystem } from '@/types/database';
import { TaskModalField, TaskModalSection } from '@/components/modals/task-modal/TaskModalSection';

export type TaskModalWorkoutLogCanvasProps = {
  canWrite: boolean;
  taskId: string | null;
  status: string;
  scheduledOn: string;
  scheduledTime: string;
  workoutType: string;
  onWorkoutTypeChange: (value: string) => void;
  workoutDurationMin: string;
  onWorkoutDurationMinChange: (value: string) => void;
  workoutExercises: WorkoutExercise[];
  workoutUnitSystem: UnitSystem;
  taskMetadata?: Json | null;
  onContinueSession?: () => void;
  continueSessionBusy?: boolean;
  isAgentField?: (key: string) => boolean;
  className?: string;
};

/**
 * Handoff-aligned workout_log Details canvas: session stats + recorded results.
 * Schedule section remains the editor for performed date/time; no PR detection / player.
 * In-progress logs with `source_task_id` show Continue session → live player/Active Session.
 */
export function TaskModalWorkoutLogCanvas({
  canWrite,
  taskId,
  status,
  scheduledOn,
  scheduledTime,
  workoutType,
  onWorkoutTypeChange,
  workoutDurationMin,
  onWorkoutDurationMinChange,
  workoutExercises,
  workoutUnitSystem,
  taskMetadata = null,
  onContinueSession,
  continueSessionBusy = false,
  isAgentField,
  className,
}: TaskModalWorkoutLogCanvasProps) {
  const agent = (key: string) => Boolean(isAgentField?.(key));

  const logReadMetadata = useMemo(() => {
    const base =
      typeof taskMetadata === 'object' && taskMetadata !== null && !Array.isArray(taskMetadata)
        ? taskMetadata
        : {};
    const durationMins = parseInt(workoutDurationMin, 10);
    return {
      ...base,
      exercises: workoutExercises,
      ...(!Number.isNaN(durationMins) && durationMins > 0 ? { duration_min: durationMins } : {}),
    };
  }, [taskMetadata, workoutExercises, workoutDurationMin]);

  const showContinueSession =
    Boolean(onContinueSession) &&
    isWorkoutLogInProgress({ item_type: 'workout_log', status }) &&
    Boolean(readWorkoutLogSourceTaskId(taskMetadata));

  const durationTile = readSessionDurationMin(workoutDurationMin, taskMetadata);
  const rpe = readSessionRpe(taskMetadata);
  const completion = readSessionCompletion(taskMetadata, workoutExercises);

  const tiles = [
    { k: 'Duration', v: durationTile.value, u: durationTile.unit },
    { k: 'Session RPE', v: rpe, u: '' },
    { k: 'Completion', v: completion, u: '' },
  ];

  const performedOn = scheduledOn.trim() || '—';
  const startTime = scheduledTime.trim() || '—';

  return (
    <div className={className} data-testid="task-modal-workout-log-canvas">
      <TaskModalSection
        icon={<ClipboardList className="size-4" aria-hidden />}
        title="Session log"
        sub="A record of what was actually performed — logged after the session, not a plan."
      >
        {showContinueSession ? (
          <div
            className="mb-3.5 rounded-lg border border-primary/25 bg-primary/5 px-3.5 py-3"
            data-testid="task-modal-workout-log-continue"
          >
            <p className="mb-2.5 text-[13px] text-muted-foreground">
              This log is still in progress. Continue the live workout session to finish logging.
            </p>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={continueSessionBusy}
              onClick={() => onContinueSession?.()}
              data-testid="task-modal-workout-log-continue-btn"
            >
              <Play className="size-3.5" aria-hidden />
              {continueSessionBusy ? 'Opening…' : 'Continue session'}
            </Button>
          </div>
        ) : null}

        <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div data-testid="task-modal-workout-log-performed-on">
            <p className="mb-1.5 text-xs font-semibold text-foreground">Performed on</p>
            <p className="text-[14.5px] text-foreground">{performedOn}</p>
          </div>
          <div data-testid="task-modal-workout-log-start-time">
            <p className="mb-1.5 text-xs font-semibold text-foreground">Start time</p>
            <p className="text-[14.5px] text-foreground">{startTime}</p>
          </div>
        </div>

        <div
          className="mb-3.5 grid grid-cols-3 gap-2.5"
          data-testid="task-modal-workout-log-canvas-stats"
        >
          {tiles.map((t) => (
            <div
              key={t.k}
              className="rounded-lg border border-border bg-background px-3.5 py-3"
              data-testid={`task-modal-workout-log-stat-${t.k.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="text-[19px] font-bold tracking-tight tabular-nums text-foreground">
                {t.v}
                {t.u ? (
                  <span className="ml-0.5 text-xs font-semibold text-muted-foreground">{t.u}</span>
                ) : null}
              </div>
              <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                {t.k}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-3.5 flex gap-3">
          <TaskModalField
            label="Type"
            agent={agent('workout_type')}
            className="mb-0 min-w-0 flex-1"
          >
            <Input
              id="task-workout-log-type"
              value={workoutType}
              onChange={(e) => onWorkoutTypeChange(e.target.value)}
              disabled={!canWrite}
              placeholder="e.g. Strength, Cardio"
              className="h-9"
            />
          </TaskModalField>
          <TaskModalField
            label="Duration (min)"
            agent={agent('duration_min')}
            className="mb-0 w-28 shrink-0"
          >
            <Input
              id="task-workout-log-duration"
              type="number"
              min={0}
              value={workoutDurationMin}
              onChange={(e) => onWorkoutDurationMinChange(e.target.value)}
              disabled={!canWrite}
              className="h-9"
            />
          </TaskModalField>
        </div>

        <WorkoutLogReadSummary
          metadata={logReadMetadata}
          taskId={taskId}
          density="full"
          unitSystem={workoutUnitSystem}
          data-testid="task-modal-workout-log-read"
        />
      </TaskModalSection>
    </div>
  );
}
