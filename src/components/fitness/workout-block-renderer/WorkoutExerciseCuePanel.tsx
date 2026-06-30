'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import type {
  CueProvenance,
  ResolvedCueBundle,
  ResolvedCueField,
} from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import type { WorkoutCuePatch } from '@/lib/workout-factory/apply-cue-patches-to-metadata';
import {
  computeEmptyCueFields,
  type ExerciseCueRequestV1,
} from '@/lib/agents/coach/exercise-cue-request';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type WorkoutExerciseCuePanelProps = {
  exerciseName: string;
  bundle: ResolvedCueBundle;
  isExpanded: boolean;
  canWrite?: boolean;
  resolutionKey?: string;
  onCueSave?: (key: string, patch: WorkoutCuePatch) => void;
  onCueDraftChange?: (key: string, patch: WorkoutCuePatch) => void;
  onCueCancel?: (key: string) => void;
  onAskCoachForCues?: (payload: ExerciseCueRequestV1) => void;
  onSaveToMyNotes?: (args: {
    resolutionKey: string;
    exerciseName: string;
    dictionaryId: string | null;
    patch: WorkoutCuePatch;
  }) => Promise<void>;
  injuriesOnFile?: boolean;
  prescription?: ExerciseCueRequestV1['prescription'];
  workoutExerciseIndex?: number;
};

const PROVENANCE_LABEL: Record<CueProvenance, string> = {
  workout: 'This workout',
  personal: 'Your notes',
  flat: 'This card',
  library: 'Library',
};

const EDITABLE_FIELDS = [
  { key: 'instructions' as const, label: 'Instructions' },
  { key: 'form_cues' as const, label: 'Form cues' },
  { key: 'tips' as const, label: 'Tips' },
  { key: 'injury_prevention_tips' as const, label: 'Injury notes' },
];

function fieldValue(field: ResolvedCueField | null | undefined): string {
  return field?.value ?? '';
}

function bundleToDraft(bundle: ResolvedCueBundle): WorkoutCuePatch {
  return {
    instructions: fieldValue(bundle.instructions),
    form_cues: fieldValue(bundle.form_cues),
    tips: fieldValue(bundle.tips),
    injury_prevention_tips: fieldValue(bundle.injury_prevention_tips),
  };
}

function CueSection({ label, field }: { label: string; field: ResolvedCueField }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-foreground/80">{label}</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {PROVENANCE_LABEL[field.provenance]}
        </span>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap">{field.value}</p>
    </div>
  );
}

export function WorkoutExerciseCuePanel({
  exerciseName,
  bundle,
  isExpanded,
  canWrite = false,
  resolutionKey = '',
  onCueSave,
  onCueDraftChange,
  onCueCancel,
  onAskCoachForCues,
  onSaveToMyNotes,
  injuriesOnFile = false,
  prescription,
  workoutExerciseIndex,
}: WorkoutExerciseCuePanelProps) {
  const [isAuthoring, setIsAuthoring] = useState(false);
  const [draft, setDraft] = useState<WorkoutCuePatch>(() => bundleToDraft(bundle));
  const [savedFlash, setSavedFlash] = useState(false);
  const [personalSaveState, setPersonalSaveState] = useState<'idle' | 'saving'>('idle');

  useEffect(() => {
    if (!isExpanded) {
      setIsAuthoring(false);
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isAuthoring) {
      setDraft(bundleToDraft(bundle));
    }
  }, [bundle, isAuthoring]);

  useEffect(() => {
    if (!savedFlash) return;
    const id = window.setTimeout(() => setSavedFlash(false), 2000);
    return () => window.clearTimeout(id);
  }, [savedFlash]);

  const updateDraft = useCallback(
    (field: keyof WorkoutCuePatch, value: string) => {
      const nextDraft = { ...draft, [field]: value };
      setDraft(nextDraft);
      if (resolutionKey && onCueDraftChange) {
        onCueDraftChange(resolutionKey, nextDraft);
      }
    },
    [draft, resolutionKey, onCueDraftChange],
  );

  const handleStartAuthoring = useCallback(() => {
    setDraft(bundleToDraft(bundle));
    setIsAuthoring(true);
  }, [bundle]);

  const handleCancel = useCallback(() => {
    setIsAuthoring(false);
    setDraft(bundleToDraft(bundle));
    if (resolutionKey) onCueCancel?.(resolutionKey);
  }, [bundle, resolutionKey, onCueCancel]);

  const handleSave = useCallback(() => {
    if (!resolutionKey || !onCueSave) return;
    onCueSave(resolutionKey, draft);
    setIsAuthoring(false);
    setSavedFlash(true);
  }, [resolutionKey, onCueSave, draft]);

  const hasDraftContent = EDITABLE_FIELDS.some(({ key }) => (draft[key] ?? '').trim().length > 0);
  const personalSaving = personalSaveState === 'saving';

  const handleSaveToMyNotes = useCallback(async () => {
    if (!resolutionKey || !onSaveToMyNotes || !hasDraftContent || personalSaving) return;
    setPersonalSaveState('saving');
    try {
      await onSaveToMyNotes({
        resolutionKey,
        exerciseName,
        dictionaryId: bundle.dictionaryId,
        patch: draft,
      });
      setIsAuthoring(false);
    } catch {
      /* parent shows toast */
    } finally {
      setPersonalSaveState('idle');
    }
  }, [
    resolutionKey,
    onSaveToMyNotes,
    hasDraftContent,
    personalSaving,
    exerciseName,
    bundle.dictionaryId,
    draft,
  ]);

  const emptyFields = useMemo(
    () => computeEmptyCueFields(bundle, { includeInjuryField: injuriesOnFile }),
    [bundle, injuriesOnFile],
  );

  const handleAskCoach = useCallback(() => {
    if (!resolutionKey || !onAskCoachForCues || emptyFields.length === 0) return;
    onAskCoachForCues({
      v: 1,
      resolution_key: resolutionKey,
      exercise_name: exerciseName,
      empty_fields: emptyFields,
      ...(prescription ? { prescription } : {}),
      ...(workoutExerciseIndex != null ? { workout_exercise_index: workoutExerciseIndex } : {}),
    });
  }, [
    resolutionKey,
    onAskCoachForCues,
    emptyFields,
    exerciseName,
    prescription,
    workoutExerciseIndex,
  ]);

  if (!isExpanded) return null;

  const showAuthoring = canWrite && isAuthoring;
  const showRead = !showAuthoring;

  if (bundle.isEmpty && !canWrite) {
    return (
      <p className="mt-2 text-xs text-muted-foreground" data-testid="workout-exercise-cue-empty">
        No form cues yet for {exerciseName}.
      </p>
    );
  }

  return (
    <div
      className={cn('mt-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2.5')}
      data-testid="workout-exercise-cue-panel"
    >
      <div className="flex gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2 text-xs leading-relaxed text-muted-foreground">
          {showRead && bundle.isEmpty ? (
            <p data-testid="workout-exercise-cue-empty">No form cues yet for {exerciseName}.</p>
          ) : null}

          {showRead ? (
            <>
              {bundle.instructions ? (
                <CueSection label="Instructions" field={bundle.instructions} />
              ) : null}
              {bundle.form_cues ? <CueSection label="Form cues" field={bundle.form_cues} /> : null}
              {bundle.tips ? <CueSection label="Tips" field={bundle.tips} /> : null}
              {bundle.injury_prevention_tips ? (
                <CueSection label="Injury notes" field={bundle.injury_prevention_tips} />
              ) : null}
              {bundle.coach_notes ? (
                <CueSection label="Coach notes" field={bundle.coach_notes} />
              ) : null}
            </>
          ) : null}

          {showAuthoring ? (
            <div className="space-y-3" data-testid="workout-exercise-cue-edit">
              {EDITABLE_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`cue-${resolutionKey}-${key}`} className="text-xs">
                    {label}
                  </Label>
                  <Textarea
                    id={`cue-${resolutionKey}-${key}`}
                    value={draft[key] ?? ''}
                    onChange={(e) => updateDraft(key, e.target.value)}
                    rows={3}
                    className="min-h-[4.5rem] resize-y text-xs"
                  />
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={personalSaving}
                >
                  Cancel
                </Button>
                {onSaveToMyNotes ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleSaveToMyNotes()}
                    disabled={personalSaving || !hasDraftContent}
                    aria-busy={personalSaving}
                  >
                    {personalSaving ? 'Saving…' : 'Save to my notes'}
                  </Button>
                ) : null}
                <Button type="button" size="sm" onClick={handleSave} disabled={personalSaving}>
                  Save to this workout
                </Button>
              </div>
            </div>
          ) : null}

          {canWrite && !isAuthoring ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={handleStartAuthoring}>
                {bundle.isEmpty ? 'Add cues' : 'Edit cues'}
              </Button>
              {onAskCoachForCues && emptyFields.length > 0 ? (
                <Button type="button" variant="secondary" size="sm" onClick={handleAskCoach}>
                  Ask Coach
                </Button>
              ) : null}
              {savedFlash ? (
                <span className="text-[10px] font-medium text-primary">Saved to this workout</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Badge state for row chrome: empty, partial, or full cues available. */
export function cueBadgeState(
  bundle: ResolvedCueBundle | null | undefined,
): 'empty' | 'partial' | 'full' {
  if (!bundle || bundle.isEmpty) return 'empty';
  const count = [
    bundle.instructions,
    bundle.form_cues,
    bundle.tips,
    bundle.injury_prevention_tips,
    bundle.coach_notes,
  ].filter(Boolean).length;
  if (count >= 3) return 'full';
  return 'partial';
}
