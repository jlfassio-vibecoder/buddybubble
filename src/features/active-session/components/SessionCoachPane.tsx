'use client';

import {
  WorkoutCoachRail,
  type WorkoutCoachRailMessageThread,
} from '@/components/chat/WorkoutCoachRail';
import type { BubbleRow, Json } from '@/types/database';

type Props = {
  bubbleId: string;
  taskId: string;
  workoutTitle: string;
  workoutData: Json | undefined;
  bubbleRow: BubbleRow | null;
  canPostMessages: boolean;
  messageThread: WorkoutCoachRailMessageThread;
};

export function SessionCoachPane({
  bubbleId,
  taskId,
  workoutTitle,
  workoutData,
  bubbleRow,
  canPostMessages,
  messageThread,
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
      className="min-h-0 overflow-hidden rounded-lg border border-border"
    />
  );
}
