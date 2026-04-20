'use client';

import { useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-error';
import type { CoachDraftPayload } from '@/types/coach-draft';
import type { TaskModalChatCardWorkoutActions } from '@/components/modals/task-modal/TaskModalCommentsPanel';
import { WorkoutAiGenerateButton } from '@/components/modals/task-modal/workout-ai-generate-button';

export type CoachDraftCardProps = {
  messageId: string;
  draft: CoachDraftPayload;
  /** Called after `apply_workout_draft` succeeds (e.g. TaskModal refetch + switch to Details). */
  onFinalizeSuccess?: () => void | Promise<void>;
  /** TaskModal: switch to Details / open viewer + generate (same as hero). */
  chatCardWorkoutActions?: TaskModalChatCardWorkoutActions;
};

export function CoachDraftCard({
  messageId,
  draft,
  onFinalizeSuccess,
  chatCardWorkoutActions,
}: CoachDraftCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPending = draft.status === 'pending';

  async function finalize() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcErr } = await supabase.rpc('apply_workout_draft', {
      p_message_id: messageId,
    });
    if (rpcErr) {
      setBusy(false);
      setError(formatUserFacingError(rpcErr));
      return;
    }
    const ok = data && typeof data === 'object' && (data as { ok?: unknown }).ok === true;
    if (!ok) {
      setBusy(false);
      setError('Could not finalize workout. Try again.');
      return;
    }
    try {
      await onFinalizeSuccess?.();
    } finally {
      setBusy(false);
    }
  }

  const exercises = Array.isArray(draft.proposed_metadata.exercises)
    ? draft.proposed_metadata.exercises
    : [];

  return (
    <div
      className={cn(
        'mt-2 w-full max-w-sm overflow-hidden rounded-xl border shadow-md',
        'border-primary/35 bg-gradient-to-br from-primary/10 via-card to-card',
        'dark:border-primary/40',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-primary/5 px-3 py-2">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          Proposed workout
        </span>
        {!isPending ? (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <Check className="size-3.5 text-green-600 dark:text-green-500" aria-hidden />
            Applied to card
          </span>
        ) : null}
      </div>
      <div className="space-y-2 px-3 py-3 text-left text-sm">
        {draft.proposed_title ? (
          <p className="font-semibold text-foreground">{draft.proposed_title}</p>
        ) : null}
        {draft.proposed_description ? (
          <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">
            {draft.proposed_description}
          </p>
        ) : null}
        {exercises.length > 0 ? (
          <ul className="max-h-40 list-inside list-disc space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {exercises.slice(0, 12).map((ex, i) => {
              const row =
                ex && typeof ex === 'object' && !Array.isArray(ex)
                  ? (ex as Record<string, unknown>)
                  : {};
              const name = typeof row.name === 'string' ? row.name : 'Exercise';
              const sets = row.sets != null ? String(row.sets) : '';
              const reps = row.reps != null ? String(row.reps) : '';
              const bits = [sets && `${sets} sets`, reps && `${reps} reps`].filter(Boolean);
              return (
                <li key={i}>
                  <span className="font-medium text-foreground">{name}</span>
                  {bits.length ? ` — ${bits.join(', ')}` : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {isPending ? (
          <Button
            type="button"
            size="sm"
            className="w-full gap-2 font-semibold shadow-[0_0_18px_color-mix(in_oklab,var(--primary)_40%,transparent)]"
            disabled={busy}
            onClick={() => void finalize()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            Finalize workout
          </Button>
        ) : null}
        {chatCardWorkoutActions ? (
          <div className="flex flex-wrap items-stretch justify-end gap-2 border-t border-border/60 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-w-0 flex-1 gap-1.5 text-xs sm:flex-none"
              onClick={() => chatCardWorkoutActions.onReviewDetails()}
            >
              Review & Generate
            </Button>
            {chatCardWorkoutActions.onGenerateWorkout ? (
              <WorkoutAiGenerateButton
                onClick={() => chatCardWorkoutActions.onGenerateWorkout?.()}
                busy={chatCardWorkoutActions.generateBusy}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
