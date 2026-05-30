'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkoutIntakeWizardData } from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';
import {
  parseTaskModalIntakePatchFromMetadata,
  type TaskModalIntakePatch,
  type WorkoutIntakeDurationChoice,
  WORKOUT_INTAKE_DURATION_CHOICES,
  WORKOUT_INTAKE_SORENESS_OPTIONS,
} from '@/lib/agents/coach/task-modal-intake-patch';
import {
  buildGenerationIntakeContext,
  defaultGenerationIntakeValues,
  defaultGenerationPhaseIntent,
  WORKOUT_GENERATION_PHASE_INTENT_OPTIONS,
  WORKOUT_GENERATION_PROGRESSION_TREND_OPTIONS,
  type WorkoutGenerationPhaseIntent,
  type WorkoutGenerationProgressionTrend,
} from '@/lib/workout-factory/generation-intake-context';

export type WorkoutIntakeWizardStep = 1 | 2 | 3;

export type WorkoutIntakeWizardMode = 'generation' | 'preflight';

export type WorkoutIntakeWizardOptions = {
  mode?: WorkoutIntakeWizardMode;
};

export type WorkoutPreflightPayload = {
  readiness: number;
  sleepQuality: number;
  soreness: string[];
};

export type IntakeWritableField =
  | 'readiness'
  | 'sleep_quality'
  | 'wizard_step'
  | 'duration_minutes'
  | 'phase_intent'
  | 'soreness';

export type FieldWriteMeta = {
  userTouchedAtMs: number;
  agentAppliedAtMs: number;
};

export type WizardWritePolicyState = Record<IntakeWritableField, FieldWriteMeta>;

export type ApplyTaskModalIntakePatchFromMessageArgs = {
  patch: TaskModalIntakePatch;
  messageId: string;
  messageCreatedAtMs: number;
};

export type WorkoutIntakeWizardTelemetry = {
  onPatchFieldSkipped?: (
    field: IntakeWritableField,
    reason: 'stale_vs_user',
    messageId: string,
  ) => void;
  onPatchFieldApplied?: (field: IntakeWritableField, messageId: string) => void;
};

const ALL_FIELDS: IntakeWritableField[] = [
  'readiness',
  'sleep_quality',
  'wizard_step',
  'duration_minutes',
  'phase_intent',
  'soreness',
];

function emptyPolicy(): WizardWritePolicyState {
  const o = {} as WizardWritePolicyState;
  for (const f of ALL_FIELDS) {
    o[f] = { userTouchedAtMs: 0, agentAppliedAtMs: 0 };
  }
  return o;
}

function resetWizardValues(): {
  step: WorkoutIntakeWizardStep;
  readiness: number;
  sleepQuality: number;
  durationMinutes: WorkoutIntakeDurationChoice;
  phaseIntent: WorkoutGenerationPhaseIntent;
  soreness: Set<string>;
  progressionTrend: WorkoutGenerationProgressionTrend;
  anchorLiftName: string;
  anchorLiftWeight: number | null;
  anchorLiftReps: number | null;
  temporaryLimitations: string;
} {
  return {
    step: 1,
    readiness: 5,
    sleepQuality: 7,
    durationMinutes: 'Optimized for Goals',
    phaseIntent: defaultGenerationPhaseIntent(),
    soreness: new Set(['None']),
    ...defaultGenerationIntakeValues(),
  };
}

/**
 * Lifted state for `WorkoutIntakePanel` so the task chat rail (Coach metadata) and manual
 * edits share one wizard state.
 *
 * @param sessionKey — `existing:<taskId>` for a normal open, or `create:<sessionUuid>` for a
 *   create flow (must stay stable across `null -> taskId` first save; see TaskModal).
 */
function clampWizardStepForMode(
  step: WorkoutIntakeWizardStep,
  mode: WorkoutIntakeWizardMode,
): WorkoutIntakeWizardStep {
  const max = mode === 'preflight' ? 2 : 2;
  if (step > max) return max as WorkoutIntakeWizardStep;
  return step;
}

export function useWorkoutIntakeWizardState(
  sessionKey: string,
  telemetry: WorkoutIntakeWizardTelemetry = {},
  options: WorkoutIntakeWizardOptions = {},
) {
  const mode = options.mode ?? 'generation';
  const maxStep: WorkoutIntakeWizardStep = mode === 'preflight' ? 2 : 2;
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const [step, setStepState] = useState<WorkoutIntakeWizardStep>(1);
  const [readiness, setReadinessState] = useState(5);
  const [sleepQuality, setSleepQualityState] = useState(7);
  const [durationMinutes, setDurationMinutesState] =
    useState<WorkoutIntakeDurationChoice>('Optimized for Goals');
  const [phaseIntent, setPhaseIntentState] = useState<WorkoutGenerationPhaseIntent>(
    defaultGenerationPhaseIntent(),
  );
  const [soreness, setSorenessState] = useState<Set<string>>(() => new Set(['None']));
  const [progressionTrend, setProgressionTrendState] = useState<WorkoutGenerationProgressionTrend>(
    defaultGenerationIntakeValues().progressionTrend,
  );
  const [anchorLiftName, setAnchorLiftNameState] = useState('');
  const [anchorLiftWeight, setAnchorLiftWeightState] = useState<number | null>(null);
  const [anchorLiftReps, setAnchorLiftRepsState] = useState<number | null>(null);
  const [temporaryLimitations, setTemporaryLimitationsState] = useState('');

  const writePolicyRef = useRef<WizardWritePolicyState>(emptyPolicy());
  const prevSessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevSessionKeyRef.current === null) {
      prevSessionKeyRef.current = sessionKey;
      return;
    }
    if (prevSessionKeyRef.current === sessionKey) return;
    prevSessionKeyRef.current = sessionKey;

    const v = resetWizardValues();
    setStepState(v.step);
    setReadinessState(v.readiness);
    setSleepQualityState(v.sleepQuality);
    setDurationMinutesState(v.durationMinutes);
    setPhaseIntentState(v.phaseIntent);
    setSorenessState(v.soreness);
    setProgressionTrendState(v.progressionTrend);
    setAnchorLiftNameState(v.anchorLiftName);
    setAnchorLiftWeightState(v.anchorLiftWeight);
    setAnchorLiftRepsState(v.anchorLiftReps);
    setTemporaryLimitationsState(v.temporaryLimitations);
    writePolicyRef.current = emptyPolicy();
  }, [sessionKey]);

  const markUserTouched = useCallback((field: IntakeWritableField | IntakeWritableField[]) => {
    const now = Date.now();
    const list = Array.isArray(field) ? field : [field];
    for (const f of list) {
      writePolicyRef.current[f] = {
        ...writePolicyRef.current[f],
        userTouchedAtMs: now,
      };
    }
  }, []);

  const applyTaskModalIntakePatchFromMessage = useCallback(
    ({ patch, messageId, messageCreatedAtMs }: ApplyTaskModalIntakePatchFromMessageArgs) => {
      const { onPatchFieldSkipped, onPatchFieldApplied } = telemetryRef.current;

      const tryField = (field: IntakeWritableField, apply: () => void) => {
        if (messageCreatedAtMs < writePolicyRef.current[field].userTouchedAtMs) {
          onPatchFieldSkipped?.(field, 'stale_vs_user', messageId);
          return;
        }
        apply();
        writePolicyRef.current[field] = {
          ...writePolicyRef.current[field],
          agentAppliedAtMs: messageCreatedAtMs,
        };
        onPatchFieldApplied?.(field, messageId);
      };

      if (patch.readiness !== undefined) {
        tryField('readiness', () => setReadinessState(patch.readiness!));
      }
      if (patch.sleep_quality !== undefined) {
        tryField('sleep_quality', () => setSleepQualityState(patch.sleep_quality!));
      }
      if (patch.wizard_step !== undefined) {
        tryField('wizard_step', () =>
          setStepState(clampWizardStepForMode(patch.wizard_step!, modeRef.current)),
        );
      }
      if (modeRef.current !== 'preflight' && patch.duration_minutes !== undefined) {
        tryField('duration_minutes', () => setDurationMinutesState(patch.duration_minutes!));
      }
      if (modeRef.current !== 'preflight' && patch.phase_intent !== undefined) {
        tryField('phase_intent', () => setPhaseIntentState(patch.phase_intent!));
      }
      if (patch.soreness !== undefined) {
        tryField('soreness', () => setSorenessState(new Set(patch.soreness)));
      }
    },
    [],
  );

  const applyTaskModalIntakePatch = useCallback(
    (raw: unknown) => {
      const patch = parseTaskModalIntakePatchFromMetadata(raw);
      if (!patch) return;
      applyTaskModalIntakePatchFromMessage({
        patch,
        messageId: '__compatibility__',
        messageCreatedAtMs: Date.now(),
      });
    },
    [applyTaskModalIntakePatchFromMessage],
  );

  const setStep = useCallback(
    (v: WorkoutIntakeWizardStep | ((prev: WorkoutIntakeWizardStep) => WorkoutIntakeWizardStep)) => {
      markUserTouched('wizard_step');
      setStepState((prev) => {
        const next = typeof v === 'function' ? v(prev) : v;
        return clampWizardStepForMode(next, modeRef.current);
      });
    },
    [markUserTouched],
  );

  const setReadiness = useCallback(
    (v: number | ((prev: number) => number)) => {
      markUserTouched('readiness');
      setReadinessState(v);
    },
    [markUserTouched],
  );

  const setSleepQuality = useCallback(
    (v: number | ((prev: number) => number)) => {
      markUserTouched('sleep_quality');
      setSleepQualityState(v);
    },
    [markUserTouched],
  );

  const setDurationMinutes = useCallback(
    (
      v:
        | WorkoutIntakeDurationChoice
        | ((prev: WorkoutIntakeDurationChoice) => WorkoutIntakeDurationChoice),
    ) => {
      markUserTouched('duration_minutes');
      setDurationMinutesState(v);
    },
    [markUserTouched],
  );

  const setPhaseIntent = useCallback(
    (
      v:
        | WorkoutGenerationPhaseIntent
        | ((prev: WorkoutGenerationPhaseIntent) => WorkoutGenerationPhaseIntent),
    ) => {
      markUserTouched('phase_intent');
      setPhaseIntentState(v);
    },
    [markUserTouched],
  );

  const toggleSoreness = useCallback(
    (name: string) => {
      markUserTouched('soreness');
      setSorenessState((prev) => {
        const next = new Set(prev);
        if (name === 'None') {
          next.clear();
          next.add('None');
          return next;
        }
        next.delete('None');
        if (next.has(name)) next.delete(name);
        else next.add(name);
        if (next.size === 0) next.add('None');
        return next;
      });
    },
    [markUserTouched],
  );

  const setProgressionTrend = useCallback((v: WorkoutGenerationProgressionTrend) => {
    setProgressionTrendState(v);
  }, []);

  const setAnchorLiftName = useCallback((v: string) => {
    setAnchorLiftNameState(v);
  }, []);

  const setAnchorLiftWeight = useCallback((v: number | null) => {
    setAnchorLiftWeightState(v);
  }, []);

  const setAnchorLiftReps = useCallback((v: number | null) => {
    setAnchorLiftRepsState(v);
  }, []);

  const setTemporaryLimitations = useCallback((v: string) => {
    setTemporaryLimitationsState(v);
  }, []);

  const sorenessArray = useMemo(() => {
    const arr = [...soreness].filter((s) => s !== 'None');
    if (soreness.has('None') && arr.length === 0) return ['None'];
    return arr.length ? arr.sort() : ['None'];
  }, [soreness]);

  const buildWizardPayload = useCallback((): WorkoutIntakeWizardData => {
    return buildGenerationIntakeContext({
      durationMinutes,
      phaseIntent,
      progressionTrend,
      anchorLiftName,
      anchorLiftWeight,
      anchorLiftReps,
      temporaryLimitations,
    });
  }, [
    durationMinutes,
    phaseIntent,
    progressionTrend,
    anchorLiftName,
    anchorLiftWeight,
    anchorLiftReps,
    temporaryLimitations,
  ]);

  const buildPreflightPayload = useCallback((): WorkoutPreflightPayload => {
    return {
      readiness,
      sleepQuality,
      soreness: sorenessArray,
    };
  }, [readiness, sleepQuality, sorenessArray]);

  // Copilot suggestion ignored: memoizing this return object caused an effect-loop OOM in TaskModal.layout.test.tsx; consumers tolerate fresh identities.
  return {
    mode,
    maxStep,
    step,
    setStep,
    readiness,
    setReadiness,
    sleepQuality,
    setSleepQuality,
    durationMinutes,
    setDurationMinutes,
    phaseIntent,
    setPhaseIntent,
    soreness,
    toggleSoreness,
    sorenessArray,
    progressionTrend,
    setProgressionTrend,
    anchorLiftName,
    setAnchorLiftName,
    anchorLiftWeight,
    setAnchorLiftWeight,
    anchorLiftReps,
    setAnchorLiftReps,
    temporaryLimitations,
    setTemporaryLimitations,
    applyTaskModalIntakePatch,
    applyTaskModalIntakePatchFromMessage,
    markUserTouched,
    buildWizardPayload,
    buildPreflightPayload,
    durationOptions: WORKOUT_INTAKE_DURATION_CHOICES,
    phaseIntentOptions: WORKOUT_GENERATION_PHASE_INTENT_OPTIONS,
    sorenessOptions: WORKOUT_INTAKE_SORENESS_OPTIONS,
    progressionTrendOptions: WORKOUT_GENERATION_PROGRESSION_TREND_OPTIONS,
  };
}

export type { TaskModalIntakePatch };
