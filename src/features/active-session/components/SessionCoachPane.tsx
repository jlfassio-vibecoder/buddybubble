'use client';

import {
  WorkoutCoachRail,
  type WorkoutCoachRailMessageThread,
} from '@/components/chat/WorkoutCoachRail';
import type { SessionTelemetrySnapshot } from '@/lib/workout-factory/session-telemetry';
import type { BubbleRow, Json } from '@/types/database';

type Props = {
  bubbleId: string;
  taskId: string;
  workoutTitle: string;
  workoutData: Json | undefined;
  bubbleRow: BubbleRow | null;
  canPostMessages: boolean;
  messageThread: WorkoutCoachRailMessageThread;
  sessionTelemetryBase?: SessionTelemetrySnapshot | null;
  elapsedSec?: number;
};

export function SessionCoachPane({
  bubbleId,
  taskId,
  workoutTitle,
  workoutData,
  bubbleRow,
  canPostMessages,
  messageThread,
  sessionTelemetryBase,
  elapsedSec,
}: Props) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border">
      <WorkoutCoachRail
        bubbleId={bubbleId}
        taskId={taskId}
        canPostMessages={canPostMessages}
        workoutTitle={workoutTitle}
        workoutData={workoutData}
        bubbleRow={bubbleRow}
        messageThread={messageThread}
        sessionTelemetryBase={sessionTelemetryBase}
        elapsedSec={elapsedSec}
        className="min-h-0 flex-1 overflow-hidden"
      />
    </div>
  );
}
