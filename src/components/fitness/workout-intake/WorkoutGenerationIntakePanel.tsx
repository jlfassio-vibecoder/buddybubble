'use client';

import { useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PremiumGate } from '@/components/subscription/premium-gate';
import { WORKOUT_AI_GENERATE_PRIMARY_CLASS } from '@/components/modals/task-modal/workout-ai-generate-button';
import { cn } from '@/lib/utils';
import type { WorkoutIntakeWizardData } from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';
import type { useWorkoutIntakeWizardState } from '@/components/modals/task-modal/hooks/useWorkoutIntakeWizardState';
import { WorkoutIntakePanelChrome } from '@/components/fitness/workout-intake/workout-intake-panel-chrome';
import { WorkoutIntakeReadinessStep } from '@/components/fitness/workout-intake/WorkoutIntakeReadinessStep';
import { WorkoutIntakeSessionParamsStep } from '@/components/fitness/workout-intake/WorkoutIntakeSessionParamsStep';
import { WorkoutIntakeSorenessStep } from '@/components/fitness/workout-intake/WorkoutIntakeSorenessStep';

export type WorkoutIntakePanelWizardProps = Omit<
  ReturnType<typeof useWorkoutIntakeWizardState>,
  | 'applyTaskModalIntakePatch'
  | 'applyTaskModalIntakePatchFromMessage'
  | 'markUserTouched'
  | 'buildWizardPayload'
  | 'buildPreflightPayload'
  | 'mode'
  | 'maxStep'
>;

export type WorkoutGenerationIntakePanelProps = WorkoutIntakePanelWizardProps & {
  handleAiGenerateWorkout: (wizardData: WorkoutIntakeWizardData) => void | Promise<void>;
  isGenerating?: boolean;
  disabledReason?: string;
};

const sparklesClassName =
  'size-4 shrink-0 transition-transform duration-200 group-hover/button:scale-110 group-hover/button:drop-shadow-[0_0_10px_color-mix(in_oklab,var(--primary-foreground)_55%,transparent)]';

/**
 * Workout task intake: daily check-in context, then AI generation.
 */
export function WorkoutGenerationIntakePanel({
  handleAiGenerateWorkout,
  isGenerating = false,
  disabledReason,
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
  toggleSoreness,
  sorenessArray,
  durationOptions,
  intensityOptions,
  sorenessOptions,
}: WorkoutGenerationIntakePanelProps) {
  const intakeDisabled = Boolean(disabledReason) || isGenerating;

  const handleSubmit = useCallback(() => {
    const payload: WorkoutIntakeWizardData = {
      readiness,
      sleepQuality,
      durationMinutes,
      soreness: sorenessArray,
      targetIntensity,
    };
    void handleAiGenerateWorkout(payload);
  }, [
    readiness,
    sleepQuality,
    durationMinutes,
    sorenessArray,
    targetIntensity,
    handleAiGenerateWorkout,
  ]);

  return (
    <WorkoutIntakePanelChrome
      headerLabel="Workout intake"
      stepLabel={`Step ${step} of 3`}
      disabled={intakeDisabled}
      disabledReason={disabledReason}
    >
      {step === 1 && (
        <WorkoutIntakeReadinessStep
          readiness={readiness}
          setReadiness={setReadiness}
          sleepQuality={sleepQuality}
          setSleepQuality={setSleepQuality}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <WorkoutIntakeSessionParamsStep
          durationMinutes={durationMinutes}
          setDurationMinutes={setDurationMinutes}
          targetIntensity={targetIntensity}
          setTargetIntensity={setTargetIntensity}
          durationOptions={durationOptions}
          intensityOptions={intensityOptions}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <WorkoutIntakeSorenessStep
          sorenessOptions={sorenessOptions}
          soreness={soreness}
          toggleSoreness={toggleSoreness}
          onBack={() => setStep(2)}
          submitSlot={
            <PremiumGate feature="ai" inline>
              <Button
                type="button"
                variant="default"
                size="sm"
                className={cn('group/button', WORKOUT_AI_GENERATE_PRIMARY_CLASS)}
                disabled={intakeDisabled}
                onClick={handleSubmit}
                title="Build the plan from this card's intake and brief (same as Details → AI workout)."
              >
                <Sparkles className={sparklesClassName} aria-hidden />
                {isGenerating ? 'Generating…' : 'Generate Workout'}
              </Button>
            </PremiumGate>
          }
        />
      )}
    </WorkoutIntakePanelChrome>
  );
}
