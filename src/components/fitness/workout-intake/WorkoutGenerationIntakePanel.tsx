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
import { WorkoutIntakeSessionParamsStep } from '@/components/fitness/workout-intake/WorkoutIntakeSessionParamsStep';
import { WorkoutIntakePlanningStep } from '@/components/fitness/workout-intake/WorkoutIntakePlanningStep';

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
  buildWizardPayload: () => WorkoutIntakeWizardData;
  isGenerating?: boolean;
  disabledReason?: string;
};

const sparklesClassName =
  'size-4 shrink-0 transition-transform duration-200 group-hover/button:scale-110 group-hover/button:drop-shadow-[0_0_10px_color-mix(in_oklab,var(--primary-foreground)_55%,transparent)]';

/**
 * Workout task intake: macro planning context, then AI generation.
 */
export function WorkoutGenerationIntakePanel({
  handleAiGenerateWorkout,
  buildWizardPayload,
  isGenerating = false,
  disabledReason,
  step,
  setStep,
  durationMinutes,
  setDurationMinutes,
  phaseIntent,
  setPhaseIntent,
  durationOptions,
  phaseIntentOptions,
  progressionTrend,
  setProgressionTrend,
  progressionTrendOptions,
  anchorLiftName,
  setAnchorLiftName,
  anchorLiftWeight,
  setAnchorLiftWeight,
  anchorLiftReps,
  setAnchorLiftReps,
  temporaryLimitations,
  setTemporaryLimitations,
}: WorkoutGenerationIntakePanelProps) {
  const intakeDisabled = Boolean(disabledReason) || isGenerating;

  const handleSubmit = useCallback(() => {
    void handleAiGenerateWorkout(buildWizardPayload());
  }, [buildWizardPayload, handleAiGenerateWorkout]);

  return (
    <WorkoutIntakePanelChrome
      headerLabel="Workout intake"
      stepLabel={`Step ${step} of 2`}
      disabled={intakeDisabled}
      disabledReason={disabledReason}
    >
      {step === 1 && (
        <WorkoutIntakeSessionParamsStep
          durationMinutes={durationMinutes}
          setDurationMinutes={setDurationMinutes}
          phaseIntent={phaseIntent}
          setPhaseIntent={setPhaseIntent}
          durationOptions={durationOptions}
          phaseIntentOptions={phaseIntentOptions}
          onBack={() => setStep(1)}
          onNext={() => setStep(2)}
          showBack={false}
        />
      )}

      {step === 2 && (
        <WorkoutIntakePlanningStep
          progressionTrend={progressionTrend}
          setProgressionTrend={setProgressionTrend}
          progressionTrendOptions={progressionTrendOptions}
          anchorLiftName={anchorLiftName}
          setAnchorLiftName={setAnchorLiftName}
          anchorLiftWeight={anchorLiftWeight}
          setAnchorLiftWeight={setAnchorLiftWeight}
          anchorLiftReps={anchorLiftReps}
          setAnchorLiftReps={setAnchorLiftReps}
          temporaryLimitations={temporaryLimitations}
          setTemporaryLimitations={setTemporaryLimitations}
          onBack={() => setStep(1)}
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
