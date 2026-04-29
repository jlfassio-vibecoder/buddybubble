'use client';

import { useCallback, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PremiumGate } from '@/components/subscription/premium-gate';
import { WORKOUT_AI_GENERATE_PRIMARY_CLASS } from '@/components/modals/task-modal/workout-ai-generate-button';
import { cn } from '@/lib/utils';
import type { WorkoutIntakeWizardData } from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';

const MOCK_EQUIPMENT_OPTIONS = [
  'Dumbbells',
  'Kettlebell',
  'Resistance bands',
  'Pull-up bar',
  'Mat',
  'Bodyweight',
] as const;

const SORENESS_OPTIONS = ['None', 'Legs', 'Back', 'Shoulders', 'Chest', 'Core'] as const;

const DURATION_OPTIONS = [15, 30, 45, 60, 'Optimized for Goals'] as const;
type DurationChoice = (typeof DURATION_OPTIONS)[number];

const INTENSITY_OPTIONS = ['Light/Recovery', 'Moderate', 'High/HIIT'] as const;

type Step = 1 | 2 | 3 | 4;

export type WorkoutIntakePanelProps = {
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
}: WorkoutIntakePanelProps) {
  const [step, setStep] = useState<Step>(1);
  const [readiness, setReadiness] = useState(5);
  const [sleepQuality, setSleepQuality] = useState(7);
  const [durationMinutes, setDurationMinutes] = useState<DurationChoice>('Optimized for Goals');
  const [targetIntensity, setTargetIntensity] =
    useState<(typeof INTENSITY_OPTIONS)[number]>('Moderate');
  const [soreness, setSoreness] = useState<Set<string>>(() => new Set(['None']));
  const [equipment, setEquipment] = useState<Set<string>>(() => new Set());

  const toggleSoreness = useCallback((name: string) => {
    setSoreness((prev) => {
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
  }, []);

  const toggleEquipment = useCallback((name: string) => {
    setEquipment((prev) => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  }, []);

  const equipmentArray = useMemo(() => [...equipment].sort(), [equipment]);
  const sorenessArray = useMemo(() => {
    const arr = [...soreness].filter((s) => s !== 'None');
    if (soreness.has('None') && arr.length === 0) return ['None'];
    return arr.length ? arr.sort() : ['None'];
  }, [soreness]);

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
              {DURATION_OPTIONS.map((d) => {
                const key = d === 'Optimized for Goals' ? 'opt' : String(d);
                const selected = durationMinutes === d;
                const label = d === 'Optimized for Goals' ? 'Optimized for Goals' : `${d} min`;
                return (
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
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Target intensity</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {INTENSITY_OPTIONS.map((opt) => {
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
            {SORENESS_OPTIONS.map((name) => {
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
            {MOCK_EQUIPMENT_OPTIONS.map((name) => {
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
