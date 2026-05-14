'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkoutIntakeWizardData } from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';
import {
  parseTaskModalIntakePatchFromMetadata,
  type TaskModalIntakePatch,
  type WorkoutIntakeDurationChoice,
  type WorkoutIntakeIntensityChoice,
  WORKOUT_INTAKE_DURATION_CHOICES,
  WORKOUT_INTAKE_EQUIPMENT_OPTIONS,
  WORKOUT_INTAKE_INTENSITY_OPTIONS,
  WORKOUT_INTAKE_SORENESS_OPTIONS,
} from '@/lib/agents/coach/task-modal-intake-patch';

export type WorkoutIntakeWizardStep = 1 | 2 | 3 | 4;

export type IntakeWritableField =
  | 'readiness'
  | 'sleep_quality'
  | 'wizard_step'
  | 'duration_minutes'
  | 'target_intensity'
  | 'soreness'
  | 'equipment';

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
  'target_intensity',
  'soreness',
  'equipment',
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
  targetIntensity: WorkoutIntakeIntensityChoice;
  soreness: Set<string>;
  equipment: Set<string>;
} {
  return {
    step: 1,
    readiness: 5,
    sleepQuality: 7,
    durationMinutes: 'Optimized for Goals',
    targetIntensity: 'Moderate',
    soreness: new Set(['None']),
    equipment: new Set(),
  };
}

/**
 * Lifted state for `WorkoutIntakePanel` so the task chat rail (Coach metadata) and manual
 * edits share one wizard state.
 *
 * @param sessionKey — `existing:<taskId>` for a normal open, or `create:<sessionUuid>` for a
 *   create flow (must stay stable across `null -> taskId` first save; see TaskModal).
 */
export function useWorkoutIntakeWizardState(
  sessionKey: string,
  telemetry: WorkoutIntakeWizardTelemetry = {},
) {
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;

  const [step, setStepState] = useState<WorkoutIntakeWizardStep>(1);
  const [readiness, setReadinessState] = useState(5);
  const [sleepQuality, setSleepQualityState] = useState(7);
  const [durationMinutes, setDurationMinutesState] =
    useState<WorkoutIntakeDurationChoice>('Optimized for Goals');
  const [targetIntensity, setTargetIntensityState] =
    useState<WorkoutIntakeIntensityChoice>('Moderate');
  const [soreness, setSorenessState] = useState<Set<string>>(() => new Set(['None']));
  const [equipment, setEquipmentState] = useState<Set<string>>(() => new Set());

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
    setTargetIntensityState(v.targetIntensity);
    setSorenessState(v.soreness);
    setEquipmentState(v.equipment);
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
        tryField('wizard_step', () => setStepState(patch.wizard_step!));
      }
      if (patch.duration_minutes !== undefined) {
        tryField('duration_minutes', () => setDurationMinutesState(patch.duration_minutes!));
      }
      if (patch.target_intensity !== undefined) {
        tryField('target_intensity', () => setTargetIntensityState(patch.target_intensity!));
      }
      if (patch.soreness !== undefined) {
        tryField('soreness', () => setSorenessState(new Set(patch.soreness)));
      }
      if (patch.equipment !== undefined) {
        tryField('equipment', () => setEquipmentState(new Set(patch.equipment)));
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
      setStepState(v);
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

  const setTargetIntensity = useCallback(
    (
      v:
        | WorkoutIntakeIntensityChoice
        | ((prev: WorkoutIntakeIntensityChoice) => WorkoutIntakeIntensityChoice),
    ) => {
      markUserTouched('target_intensity');
      setTargetIntensityState(v);
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

  const toggleEquipment = useCallback(
    (name: string) => {
      markUserTouched('equipment');
      setEquipmentState((prev) => {
        const n = new Set(prev);
        if (n.has(name)) n.delete(name);
        else n.add(name);
        return n;
      });
    },
    [markUserTouched],
  );

  const equipmentArray = useMemo(() => [...equipment].sort(), [equipment]);
  const sorenessArray = useMemo(() => {
    const arr = [...soreness].filter((s) => s !== 'None');
    if (soreness.has('None') && arr.length === 0) return ['None'];
    return arr.length ? arr.sort() : ['None'];
  }, [soreness]);

  const buildWizardPayload = useCallback((): WorkoutIntakeWizardData => {
    return {
      readiness,
      equipment: equipmentArray,
      sleepQuality,
      durationMinutes,
      soreness: sorenessArray,
      targetIntensity,
    };
  }, [readiness, equipmentArray, sleepQuality, durationMinutes, sorenessArray, targetIntensity]);

  // Copilot suggestion ignored: memoizing this return object caused an effect-loop OOM in TaskModal.layout.test.tsx; consumers tolerate fresh identities.
  return {
    step,
    setStep,
    readiness,
    setReadiness,
    sleepQuality,
    setSleepQuality,
    durationMinutes,
    setDurationMinutes,
    targetIntensity,
    setTargetIntensity,
    soreness,
    equipment,
    toggleSoreness,
    toggleEquipment,
    equipmentArray,
    sorenessArray,
    applyTaskModalIntakePatch,
    applyTaskModalIntakePatchFromMessage,
    markUserTouched,
    buildWizardPayload,
    durationOptions: WORKOUT_INTAKE_DURATION_CHOICES,
    intensityOptions: WORKOUT_INTAKE_INTENSITY_OPTIONS,
    sorenessOptions: WORKOUT_INTAKE_SORENESS_OPTIONS,
    equipmentOptions: WORKOUT_INTAKE_EQUIPMENT_OPTIONS,
  };
}

export type { TaskModalIntakePatch };
