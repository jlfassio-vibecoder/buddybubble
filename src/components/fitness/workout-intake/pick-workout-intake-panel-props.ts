import type { useWorkoutIntakeWizardState } from '@/components/modals/task-modal/hooks/useWorkoutIntakeWizardState';
import type { WorkoutIntakePanelWizardProps } from '@/components/fitness/workout-intake/WorkoutGenerationIntakePanel';

export function pickWorkoutIntakePanelWizardProps(
  w: ReturnType<typeof useWorkoutIntakeWizardState>,
): WorkoutIntakePanelWizardProps {
  const {
    applyTaskModalIntakePatch,
    applyTaskModalIntakePatchFromMessage,
    markUserTouched,
    buildWizardPayload,
    buildPreflightPayload,
    mode,
    maxStep,
    ...rest
  } = w;
  return rest;
}
