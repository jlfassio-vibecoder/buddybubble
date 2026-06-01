'use client';

import { Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WorkoutIntakePanelWizardProps } from '@/components/fitness/workout-intake/WorkoutGenerationIntakePanel';
import { WorkoutIntakePanelChrome } from '@/components/fitness/workout-intake/workout-intake-panel-chrome';
import { WorkoutIntakeReadinessStep } from '@/components/fitness/workout-intake/WorkoutIntakeReadinessStep';
import { WorkoutIntakeSorenessStep } from '@/components/fitness/workout-intake/WorkoutIntakeSorenessStep';

export type WorkoutPreflightReadinessPanelProps = WorkoutIntakePanelWizardProps & {
  onSubmitPreflight: () => void | Promise<void>;
  isSubmitting?: boolean;
  disabledReason?: string;
};

export function WorkoutPreflightReadinessPanel({
  onSubmitPreflight,
  isSubmitting = false,
  disabledReason,
  step,
  setStep,
  readiness,
  setReadiness,
  sleepQuality,
  setSleepQuality,
  soreness,
  toggleSoreness,
  sorenessOptions,
}: WorkoutPreflightReadinessPanelProps) {
  const preflightDisabled = Boolean(disabledReason) || isSubmitting;
  const displayStep = step > 2 ? 2 : step;

  return (
    <WorkoutIntakePanelChrome
      headerLabel="Pre-session check-in"
      stepLabel={`Step ${displayStep} of 2`}
      disabled={preflightDisabled}
      disabledReason={disabledReason}
    >
      {displayStep === 1 && (
        <WorkoutIntakeReadinessStep
          readiness={readiness}
          setReadiness={setReadiness}
          sleepQuality={sleepQuality}
          setSleepQuality={setSleepQuality}
          onNext={() => setStep(2)}
        />
      )}

      {displayStep === 2 && (
        <WorkoutIntakeSorenessStep
          sorenessOptions={sorenessOptions}
          soreness={soreness}
          toggleSoreness={toggleSoreness}
          onBack={() => setStep(1)}
          submitSlot={
            <Button
              type="button"
              variant="default"
              size="sm"
              className={cn('group/button gap-1.5')}
              disabled={preflightDisabled}
              onClick={() => void onSubmitPreflight()}
            >
              <Dumbbell className="size-4 shrink-0" aria-hidden />
              {isSubmitting ? 'Starting…' : 'Start Active Session'}
            </Button>
          }
        />
      )}
    </WorkoutIntakePanelChrome>
  );
}
