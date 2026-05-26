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
  sessionTelemetry?: SessionTelemetrySnapshot | null;
};

export function SessionCoachPane({
  bubbleId,
  taskId,
  workoutTitle,
  workoutData,
  bubbleRow,
  canPostMessages,
  messageThread,
  sessionTelemetry,
}: Props) {
  return (
    <WorkoutCoachRail
      bubbleId={bubbleId}
      taskId={taskId}
      canPostMessages={canPostMessages}
      workoutTitle={workoutTitle}
      workoutData={workoutData}
      bubbleRow={bubbleRow}
      messageThread={messageThread}
      sessionTelemetry={sessionTelemetry}
      className="min-h-0 overflow-hidden rounded-lg border border-border"
    />
  );
}
