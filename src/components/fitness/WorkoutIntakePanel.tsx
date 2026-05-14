'use client';

import { useCallback, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PremiumGate } from '@/components/subscription/premium-gate';
import { WORKOUT_AI_GENERATE_PRIMARY_CLASS } from '@/components/modals/task-modal/workout-ai-generate-button';
import { cn } from '@/lib/utils';
import type { WorkoutIntakeWizardData } from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';
import type { useWorkoutIntakeWizardState } from '@/components/modals/task-modal/hooks/useWorkoutIntakeWizardState';

export type WorkoutIntakePanelWizardProps = Omit<
  ReturnType<typeof useWorkoutIntakeWizardState>,
  | 'applyTaskModalIntakePatch'
  | 'applyTaskModalIntakePatchFromMessage'
  | 'markUserTouched'
  | 'buildWizardPayload'
>;

export type WorkoutIntakePanelProps = WorkoutIntakePanelWizardProps & {
  handleAiGenerateWorkout: (wizardData: WorkoutIntakeWizardData) => void | Promise<void>;
  isGenerating?: boolean;
};

const sparklesClassName =
  'size-4 shrink-0 transition-transform duration-200 group-hover/button:scale-110 group-hover/button:drop-shadow-[0_0_10px_color-mix(in_oklab,var(--primary-foreground)_55%,transparent)]';

/**
 * Workout task intake: daily check-in context, then AI generation.
 */
export function WorkoutIntakePanel({
  handleAiGenerateWorkout,
  isGenerating = false,
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
  durationOptions,
  intensityOptions,
  sorenessOptions,
  equipmentOptions,
}: WorkoutIntakePanelProps) {
  const handleSubmit = useCallback(() => {
    const payload: WorkoutIntakeWizardData = {
      readiness,
      equipment: equipmentArray,
      sleepQuality,
      durationMinutes,
      soreness: sorenessArray,
      targetIntensity,
    };
    void handleAiGenerateWorkout(payload);
  }, [
    readiness,
    equipmentArray,
    sleepQuality,
    durationMinutes,
    sorenessArray,
    targetIntensity,
    handleAiGenerateWorkout,
  ]);

  const durationButtons = useMemo(
    () =>
      durationOptions.map((d) => {
        const key = d === 'Optimized for Goals' ? 'opt' : String(d);
        const selected = durationMinutes === d;
        const label = d === 'Optimized for Goals' ? 'Optimized for Goals' : `${d} min`;
        return { key, d, selected, label };
      }),
    [durationMinutes, durationOptions],
  );

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Workout intake</p>
        <p className="text-[11px] text-muted-foreground">Step {step} of 4</p>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workout-readiness">Readiness / energy (1–10)</Label>
            <div className="flex items-center gap-3">
              <input
                id="workout-readiness"
                type="range"
                min={1}
                max={10}
                step={1}
                value={readiness}
                onChange={(e) => setReadiness(Number(e.target.value))}
                className="h-2 w-full flex-1 cursor-pointer accent-primary"
                aria-valuemin={1}
                aria-valuemax={10}
                aria-valuenow={readiness}
              />
              <span className="w-8 tabular-nums text-sm font-medium text-foreground">
                {readiness}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="workout-sleep">Sleep quality (1–10)</Label>
            <div className="flex items-center gap-3">
              <input
                id="workout-sleep"
                type="range"
                min={1}
                max={10}
                step={1}
                value={sleepQuality}
                onChange={(e) => setSleepQuality(Number(e.target.value))}
                className="h-2 w-full flex-1 cursor-pointer accent-primary"
                aria-valuemin={1}
                aria-valuemax={10}
                aria-valuenow={sleepQuality}
              />
              <span className="w-8 tabular-nums text-sm font-medium text-foreground">
                {sleepQuality}
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => setStep(2)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Session duration</p>
            <div className="flex flex-wrap gap-2">
              {durationButtons.map(({ key, d, selected, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDurationMinutes(d)}
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    selected
                      ? 'border-primary bg-primary/15 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Target intensity</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {intensityOptions.map((opt) => {
                const selected = targetIntensity === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setTargetIntensity(opt)}
                    className={cn(
                      'rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                      selected
                        ? 'border-primary bg-primary/15 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="button" size="sm" onClick={() => setStep(3)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Soreness (select any that apply)</p>
          <div className="flex flex-wrap gap-2">
            {sorenessOptions.map((name) => {
              const selected = soreness.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleSoreness(name)}
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    selected
                      ? 'border-primary bg-primary/15 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="button" size="sm" onClick={() => setStep(4)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Select equipment available for this session.
          </p>
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map((name) => {
              const selected = equipment.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleEquipment(name)}
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    selected
                      ? 'border-primary bg-primary/15 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setStep(3)}>
              Back
            </Button>
            <PremiumGate feature="ai" inline>
              <Button
                type="button"
                variant="default"
                size="sm"
                className={cn('group/button', WORKOUT_AI_GENERATE_PRIMARY_CLASS)}
                disabled={isGenerating}
                onClick={handleSubmit}
                title="Build the plan from this card's intake and brief (same as Details → AI workout)."
              >
                <Sparkles className={sparklesClassName} aria-hidden />
                {isGenerating ? 'Generating…' : 'Generate Workout'}
              </Button>
            </PremiumGate>
          </div>
        </div>
      )}
    </div>
  );
}
