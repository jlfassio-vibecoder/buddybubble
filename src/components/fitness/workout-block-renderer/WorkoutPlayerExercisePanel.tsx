'use client';

import { Check, Info, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
import type { UserExerciseNotesRow } from '@/hooks/useUserExerciseNotes';

export type SetDraft = {
  weight: string;
  reps: string;
  rpe: string;
  done: boolean;
};

function trimNonEmpty(s: string | undefined): string | null {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length > 0 ? t : null;
}

function formatFormCues(ex: WorkoutExercise): string | null {
  const raw = ex.form_cues;
  if (raw != null) {
    if (Array.isArray(raw)) {
      const parts = raw
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter((x) => x.length > 0);
      if (parts.length > 0) return parts.join('\n');
    } else if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return trimNonEmpty(ex.form_cue);
}

/** Prescription summary line for simple view header. */
export function formatExerciseTargetLine(exercise: WorkoutExercise, unit: string): string {
  const parts = [
    exercise.sets != null && `${exercise.sets} sets`,
    exercise.reps != null && `${exercise.reps} reps`,
    exercise.weight != null && `${exercise.weight} ${unit}`,
    exercise.duration_min != null && `${exercise.duration_min} min`,
    exercise.rpe != null && `RPE ${exercise.rpe}`,
    exercise.work_seconds != null && exercise.work_seconds > 0 && `${exercise.work_seconds}s work`,
    exercise.rest_seconds != null && exercise.rest_seconds > 0 && `${exercise.rest_seconds}s rest`,
    exercise.rounds != null && exercise.rounds > 0 && `${exercise.rounds} rounds`,
  ].filter(Boolean) as string[];
  return parts.join(' · ');
}

export type WorkoutPlayerExercisePanelProps = {
  exercise: WorkoutExercise;
  index: number;
  sets: SetDraft[];
  view: 'simple' | 'detailed';
  unit: string;
  personalNotes: UserExerciseNotesRow | null;
  onSetChange: (setIdx: number, field: 'weight' | 'reps' | 'rpe', value: string) => void;
  onToggleDone: (setIdx: number) => void;
  onAddSet: () => void;
  /** Tabata / interval shell: highlight active set row (editing never disabled). */
  activeSetIndex?: number | null;
  activeSetPhase?: IntervalRowSnapshot['activeSetPhase'] | null;
};

export function WorkoutPlayerExercisePanel({
  exercise,
  index,
  sets,
  view,
  unit,
  personalNotes,
  onSetChange,
  onToggleDone,
  onAddSet,
  activeSetIndex = null,
  activeSetPhase = null,
}: WorkoutPlayerExercisePanelProps) {
  const targetLine = formatExerciseTargetLine(exercise, unit);

  return (
    <div className="space-y-3" data-testid={`exercise-panel-${index}`}>
      <div>
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-sm font-bold text-primary">#{index + 1}</span>
          <h3 className="font-semibold leading-snug text-foreground">{exercise.name}</h3>
        </div>
        {targetLine ? <p className="text-xs text-muted-foreground">{targetLine}</p> : null}
        {view === 'detailed' &&
          (() => {
            const instructionText =
              trimNonEmpty(exercise.instructions) ?? trimNonEmpty(exercise.notes);
            const formCuesTextRaw = formatFormCues(exercise);
            const formCuesText =
              formCuesTextRaw && formCuesTextRaw !== instructionText ? formCuesTextRaw : null;
            const tipsT = trimNonEmpty(exercise.tips);
            const coachT = trimNonEmpty(exercise.coach_notes);
            const tipsParagraph = tipsT && tipsT !== instructionText ? tipsT : null;
            const coachParagraph =
              coachT && coachT !== instructionText && coachT !== tipsT ? coachT : null;
            const personalInstr = trimNonEmpty(personalNotes?.instructions ?? undefined);
            const personalForm = trimNonEmpty(personalNotes?.form_cues ?? undefined);
            const personalTips = trimNonEmpty(personalNotes?.tips ?? undefined);
            const personalInjury = trimNonEmpty(personalNotes?.injury_prevention_tips ?? undefined);
            const hasPersonal = Boolean(
              personalInstr || personalForm || personalTips || personalInjury,
            );
            const hasCatalog = Boolean(
              instructionText || formCuesText || tipsParagraph || coachParagraph,
            );
            if (!hasCatalog && !hasPersonal) return null;
            return (
              <div className="mt-2 space-y-2">
                {hasCatalog && (
                  <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2.5">
                    <div className="flex gap-2">
                      <Info
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-2 text-xs leading-relaxed text-muted-foreground">
                        {instructionText && (
                          <div>
                            <p className="font-medium text-foreground/80">Instructions</p>
                            <p className="mt-0.5 whitespace-pre-wrap">{instructionText}</p>
                          </div>
                        )}
                        {formCuesText && (
                          <div>
                            <p className="font-medium text-foreground/80">Form cues</p>
                            <p className="mt-0.5 whitespace-pre-wrap">{formCuesText}</p>
                          </div>
                        )}
                        {tipsParagraph && (
                          <div>
                            <p className="font-medium text-foreground/80">Tips</p>
                            <p className="mt-0.5 whitespace-pre-wrap">{tipsParagraph}</p>
                          </div>
                        )}
                        {coachParagraph && (
                          <div>
                            <p className="font-medium text-foreground/80">Coach notes</p>
                            <p className="mt-0.5 whitespace-pre-wrap">{coachParagraph}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {hasPersonal && (
                  <div className="rounded-md border-y border-r border-border/60 border-l-4 border-l-primary/50 bg-muted/30 px-3 py-2.5">
                    <p className="text-xs font-semibold text-foreground">
                      Personal cues from your coach
                    </p>
                    <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                      {personalInstr && (
                        <div>
                          <p className="font-medium text-foreground/80">Instructions</p>
                          <p className="mt-0.5 whitespace-pre-wrap">{personalInstr}</p>
                        </div>
                      )}
                      {personalForm && (
                        <div>
                          <p className="font-medium text-foreground/80">Form cues</p>
                          <p className="mt-0.5 whitespace-pre-wrap">{personalForm}</p>
                        </div>
                      )}
                      {personalTips && (
                        <div>
                          <p className="font-medium text-foreground/80">Tips</p>
                          <p className="mt-0.5 whitespace-pre-wrap">{personalTips}</p>
                        </div>
                      )}
                      {personalInjury && (
                        <div>
                          <p className="font-medium text-foreground/80">Injury prevention</p>
                          <p className="mt-0.5 whitespace-pre-wrap">{personalInjury}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
      </div>

      <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_2.5rem] items-center gap-2 px-1">
        <span className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Set
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Weight
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Reps
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          RPE
        </span>
        <span />
      </div>

      <div className="space-y-1.5">
        {sets.map((s, idx) => {
          const isActiveRow =
            activeSetIndex != null && idx === activeSetIndex && activeSetPhase != null;
          const activeWork = isActiveRow && activeSetPhase === 'work';
          const activeMuted =
            isActiveRow &&
            (activeSetPhase === 'rest' ||
              activeSetPhase === 'prepare' ||
              activeSetPhase === 'paused');
          return (
            <div
              key={idx}
              className={cn(
                'grid grid-cols-[2.5rem_1fr_1fr_1fr_2.5rem] items-center gap-2 rounded-md px-1 py-1 transition-colors',
                s.done && 'bg-primary/5',
                activeWork && 'bg-primary/10 ring-2 ring-primary',
                activeMuted && 'bg-muted/30 ring-1 ring-primary/40',
              )}
            >
              <span
                className={cn(
                  'text-center text-sm font-semibold tabular-nums',
                  s.done ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {idx + 1}
              </span>
              <Input
                value={s.weight}
                onChange={(e) => onSetChange(idx, 'weight', e.target.value)}
                placeholder={`— ${unit}`}
                className="h-8 text-center text-sm"
                type="number"
                min={0}
                step={0.5}
              />
              <Input
                value={s.reps}
                onChange={(e) => onSetChange(idx, 'reps', e.target.value)}
                placeholder="—"
                className="h-8 text-center text-sm"
                type="number"
                min={0}
              />
              <Input
                value={s.rpe}
                onChange={(e) => onSetChange(idx, 'rpe', e.target.value)}
                placeholder="—"
                className="h-8 text-center text-sm"
                type="number"
                min={1}
                max={10}
              />
              <button
                type="button"
                onClick={() => onToggleDone(idx)}
                aria-label={s.done ? `Mark set ${idx + 1} undone` : `Mark set ${idx + 1} done`}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md border-2 transition-colors',
                  s.done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-transparent hover:border-primary/40',
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAddSet}
        className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Add set
      </button>
    </div>
  );
}
