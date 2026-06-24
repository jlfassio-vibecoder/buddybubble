'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { EmomActiveMinuteState } from '@/features/live-video/wrappers/interval/hooks/useEmomActiveMinute';
import { useEmomActiveMinute } from '@/features/live-video/wrappers/interval/hooks/useEmomActiveMinute';
import { vibrateSlapTarget, playSlapChime } from '@/lib/fitness/play-slap-chime';
import { resolveEmomLocalHighlightSetIndex } from '@/lib/workout-factory/interval-timer/resolve-emom-alternating';
import { isAlternatingEmomParams } from '@/lib/workout-factory/types/emom-format-params';
import type { LogSetParams } from '@/features/live-video/hooks/useWorkoutLogs';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

type EmomSlapTargetProps = {
  intervalSessionId: string;
  /** When provided, skips internal `useEmomActiveMinute` subscription. */
  activeMinute?: EmomActiveMinuteState;
  blocks: WorkoutSessionBlockView[];
  flatExerciseNames: { name: string; globalIndex: number; exerciseIndexInBlock: number }[];
  formatParams: Record<string, unknown>;
  logSet: (params: LogSetParams & { activeSeconds?: number }) => Promise<{ error: Error | null }>;
  getExistingLog: (
    exerciseName: string,
    setNumber: number,
  ) => {
    weight_lbs: number | null;
    reps: number | null;
    rpe: number | null;
  } | null;
  /** When true, DONE is disabled (e.g. live session paused). */
  disabled?: boolean;
};

export function EmomSlapTarget({
  intervalSessionId,
  activeMinute: activeMinuteProp,
  blocks: _blocks,
  flatExerciseNames,
  formatParams,
  logSet,
  getExistingLog,
  disabled = false,
}: EmomSlapTargetProps) {
  const internalMinute = useEmomActiveMinute(intervalSessionId, {
    enabled: activeMinuteProp == null && intervalSessionId.trim().length > 0,
  });
  const { segment, minuteIndex, segmentStartedAt, remainingSec, intervalSeconds } =
    activeMinuteProp ?? internalMinute;
  const [restingForMinute, setRestingForMinute] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (minuteIndex > 0 && restingForMinute !== minuteIndex) {
      setRestingForMinute(null);
    }
  }, [minuteIndex, restingForMinute]);

  const handleDone = useCallback(async () => {
    if (disabled || segment !== 'minute' || !segmentStartedAt || minuteIndex < 1) return;
    const startedMs = new Date(segmentStartedAt).getTime();
    if (!Number.isFinite(startedMs)) return;

    const activeSeconds = Math.min(
      intervalSeconds,
      Math.max(0, Math.round((Date.now() - startedMs) / 1000)),
    );

    vibrateSlapTarget();
    playSlapChime();
    setSaving(true);

    const minuteIndex0 = minuteIndex - 1;
    const isAlternating = isAlternatingEmomParams(formatParams);
    const targets = flatExerciseNames.filter(({ exerciseIndexInBlock }) => {
      if (!isAlternating) return true;
      const localSet = resolveEmomLocalHighlightSetIndex(
        exerciseIndexInBlock,
        minuteIndex0,
        formatParams,
      );
      return localSet != null;
    });

    let hadError = false;
    for (const { name, exerciseIndexInBlock } of targets) {
      const localSet = isAlternating
        ? resolveEmomLocalHighlightSetIndex(exerciseIndexInBlock, minuteIndex0, formatParams)
        : null;
      const setNumber = localSet != null ? localSet + 1 : minuteIndex;
      const existing = getExistingLog(name, setNumber);
      const { error } = await logSet({
        exerciseName: name,
        setNumber,
        weightLbs: existing?.weight_lbs ?? null,
        reps: existing?.reps ?? null,
        rpe: existing?.rpe ?? null,
        activeSeconds,
      });
      if (error) hadError = true;
    }

    setSaving(false);
    if (!hadError) setRestingForMinute(minuteIndex);
  }, [
    segment,
    segmentStartedAt,
    minuteIndex,
    intervalSeconds,
    flatExerciseNames,
    formatParams,
    logSet,
    getExistingLog,
    disabled,
  ]);

  if (segment !== 'minute' || minuteIndex < 1) {
    return null;
  }

  const isResting = restingForMinute === minuteIndex;

  if (isResting) {
    return (
      <div
        className="flex min-h-[12rem] flex-col items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-6 text-center"
        data-region="emom-slap-rest"
      >
        <p className="text-sm font-medium text-emerald-200/90">Rest</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-100">
          {Math.max(0, remainingSec)}s
        </p>
        <p className="mt-2 text-xs text-emerald-200/60">until the next minute</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-region="emom-slap-work">
      <Button
        type="button"
        disabled={disabled || saving || !segmentStartedAt}
        className="min-h-[12rem] w-full rounded-xl text-3xl font-bold uppercase tracking-wide"
        onClick={() => void handleDone()}
      >
        Done
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Tap when you finish your reps — we&apos;ll log your active time for this minute.
      </p>
    </div>
  );
}
