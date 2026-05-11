'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { createClient } from '@utils/supabase/client';
import { Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useExerciseDictionaryAutocomplete } from '@/hooks/useExerciseDictionaryAutocomplete';
import { resolveFirstBoardColumnSlug } from '@/lib/fitness/resolve-first-board-column-slug';
import { formatUserFacingError } from '@/lib/format-error';
import {
  dictionaryRowToWorkoutExercise,
  orderDictionaryRowsByPickerSelection,
} from '@/lib/workout-factory/dictionary-row-to-workout-exercise';
import { rpcExerciseDictionaryLookupByNames } from '@/lib/workout-factory/exercise-dictionary-bridge';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import { mergeWorkoutExercisesIntoTaskMetadata } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { useWorkoutDeckSelection } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { cn } from '@/lib/utils';
import { useUserProfileStore } from '@/store/userProfileStore';
import type { ExerciseDictionaryAutocompleteRow } from '@/lib/exercise-dictionary-autocomplete-cache';
import type { Json, TaskRow } from '@/types/database';

const MAX_SELECT = 25;

function isWorkoutItemType(t: string): boolean {
  return t === 'workout' || t === 'workout_log';
}

export type LiveDeckExerciseInjectorProps = {
  workspaceId: string;
  workoutsBubbleId: string | null;
  canWrite: boolean;
  disabled?: boolean;
  className?: string;
  triggerLabel?: string;
  triggerVariant?: ComponentProps<typeof Button>['variant'];
};

export function LiveDeckExerciseInjector({
  workspaceId,
  workoutsBubbleId,
  canWrite,
  disabled = false,
  className,
  triggerLabel = 'Add custom',
  triggerVariant = 'outline',
}: LiveDeckExerciseInjectorProps) {
  const supabase = useMemo(() => createClient(), []);
  const profileId = useUserProfileStore((s) => s.profile?.id ?? null);
  const ctx = useWorkoutDeckSelection();
  const { rows, loading, error, refresh } = useExerciseDictionaryAutocomplete();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<ExerciseDictionaryAutocompleteRow[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const resolvedActive = useMemo(() => {
    if (!ctx.activeSnapshotId) return null;
    return ctx.deck.find((s) => s.snapshotId === ctx.activeSnapshotId) ?? null;
  }, [ctx.activeSnapshotId, ctx.deck]);

  /** Deck has cards but host has not tapped one — never fall back to deck[0]. */
  const needsSelectionFirst = ctx.deck.length > 0 && ctx.activeSnapshotId == null;

  useEffect(() => {
    if (needsSelectionFirst) setOpen(false);
  }, [needsSelectionFirst]);

  const blockNonWorkoutActive =
    resolvedActive != null && !isWorkoutItemType(String(resolvedActive.task.item_type));

  const toggleRow = useCallback((row: ExerciseDictionaryAutocompleteRow) => {
    setSelected((prev) => {
      const i = prev.findIndex((x) => x.id === row.id);
      if (i >= 0) return prev.filter((_, j) => j !== i);
      if (prev.length >= MAX_SELECT) {
        toast.message(`You can add up to ${MAX_SELECT} exercises at once.`);
        return prev;
      }
      return [...prev, row];
    });
  }, []);

  const clearSelection = useCallback(() => setSelected([]), []);

  const handleConfirm = useCallback(async () => {
    if (selected.length === 0 || submitting) return;
    if (needsSelectionFirst) {
      toast.error('Select a card in the deck above first.');
      return;
    }
    if (ctx.activeSnapshotId && resolvedActive == null) {
      toast.error('Selected deck card is no longer available. Pick another card.');
      return;
    }
    if (blockNonWorkoutActive) {
      toast.error('Selected card is not a workout — pick a workout card or clear the deck first.');
      return;
    }

    cancelledRef.current = false;
    setSubmitting(true);
    try {
      const names = selected.map((s) => s.name);
      const rich = await rpcExerciseDictionaryLookupByNames(supabase, names);
      const ordered = orderDictionaryRowsByPickerSelection(rich, names);
      if (ordered.length < names.length) {
        toast.warning('Some exercises could not be loaded from the directory.');
      }
      if (ordered.length === 0) {
        toast.error('No matching exercises found in the directory.');
        return;
      }

      const mapped = ordered.map(dictionaryRowToWorkoutExercise);

      if (resolvedActive && isWorkoutItemType(String(resolvedActive.task.item_type))) {
        const existing = metadataFieldsFromParsed(resolvedActive.task.metadata).workoutExercises;
        const nextMeta = mergeWorkoutExercisesIntoTaskMetadata(resolvedActive.task, [
          ...existing,
          ...mapped,
        ]);
        ctx.updateSnapshotTask(resolvedActive.snapshotId, {
          ...resolvedActive.task,
          metadata: nextMeta,
        });
      } else if (ctx.deck.length === 0) {
        if (!workoutsBubbleId) {
          toast.error('Add a "Workouts" channel to add custom exercises.');
          return;
        }
        if (!profileId) {
          toast.error('Sign in to add custom exercises.');
          return;
        }
        const status = await resolveFirstBoardColumnSlug(supabase, workspaceId);
        const metadata: Json = {
          workout_type: 'strength',
          exercises: mapped,
        } as Json;
        const { data: insertedIdRow, error: insErr } = await supabase
          .from('tasks')
          .insert({
            bubble_id: workoutsBubbleId,
            title: 'Custom workout',
            description: null,
            status,
            position: 0,
            priority: 'medium',
            item_type: 'workout',
            metadata,
            visibility: 'private',
            attachments: [],
            created_by: profileId,
          })
          .select('id')
          .single();
        if (insErr || !insertedIdRow?.id) {
          toast.error(formatUserFacingError(insErr ?? new Error('Insert failed')));
          return;
        }
        const { data: taskRow, error: fetchErr } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', insertedIdRow.id)
          .maybeSingle();
        if (fetchErr || !taskRow) {
          toast.error(formatUserFacingError(fetchErr ?? new Error('Failed to load new task')));
          return;
        }
        ctx.addTaskToDeck(taskRow as TaskRow);
      } else {
        toast.error('Could not add exercises to the deck. Please try again.');
        return;
      }

      if (cancelledRef.current) return;
      toast.success(`Added ${mapped.length} exercise${mapped.length === 1 ? '' : 's'}`);
      clearSelection();
      setOpen(false);
    } catch (e) {
      if (!cancelledRef.current) {
        toast.error('Could not add exercises. Please try again.');
        if (process.env.NODE_ENV === 'development') {
          console.error('[LiveDeckExerciseInjector]', e);
        }
      }
    } finally {
      if (!cancelledRef.current) setSubmitting(false);
    }
  }, [
    blockNonWorkoutActive,
    clearSelection,
    ctx,
    needsSelectionFirst,
    profileId,
    resolvedActive,
    selected,
    submitting,
    supabase,
    workoutsBubbleId,
    workspaceId,
  ]);

  if (!canWrite || disabled) {
    return null;
  }

  const confirmDisabled =
    selected.length === 0 || submitting || blockNonWorkoutActive || needsSelectionFirst;

  return (
    <div className={cn('inline-flex', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={triggerVariant}
            className="shrink-0 gap-1 font-semibold"
            aria-expanded={open}
            disabled={needsSelectionFirst}
            title={needsSelectionFirst ? 'Select a card in the deck above first.' : undefined}
          >
            <Plus className="size-3.5" aria-hidden />
            {triggerLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[360px] max-w-[calc(100vw-2rem)] p-0"
          align="end"
          sideOffset={8}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter>
            <CommandInput placeholder="Search exercises…" />
            <CommandList>
              <CommandEmpty>
                {loading
                  ? 'Loading exercises…'
                  : error
                    ? 'Could not load exercises.'
                    : 'No exercises found.'}
              </CommandEmpty>
              <CommandGroup heading="Exercises">
                {rows.map((row) => {
                  const isOn = selected.some((s) => s.id === row.id);
                  return (
                    <CommandItem
                      key={row.id}
                      value={`${row.name} ${row.slug}`}
                      onSelect={() => toggleRow(row)}
                    >
                      <span
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded border border-border',
                          isOn && 'border-primary bg-primary/10',
                        )}
                        aria-hidden
                      >
                        {isOn ? <Check className="size-3 text-primary" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                      <span className="shrink-0 truncate text-xs text-muted-foreground">
                        {row.slug}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          {error ? (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <p className="text-xs text-destructive">
                Failed to load exercises. Please try again.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void refresh().catch(() => {
                    toast.error('Failed to load exercises. Please try again.');
                  });
                }}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {blockNonWorkoutActive ? (
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Selected card is not a workout — exercises can only be added to workout cards.
            </p>
          ) : null}
          {selected.length >= MAX_SELECT ? (
            <p className="border-t border-border px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Maximum {MAX_SELECT} exercises per add.
            </p>
          ) : null}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border p-2">
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={selected.length === 0 || submitting}
                onClick={clearSelection}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={confirmDisabled}
                onClick={() => void handleConfirm()}
              >
                {submitting ? 'Adding…' : 'Add to deck'}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
