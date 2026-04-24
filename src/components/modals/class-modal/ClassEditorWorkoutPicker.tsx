'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@utils/supabase/client';
import type { TaskRow } from '@/types/database';
import { formatUserFacingError } from '@/lib/format-error';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import { normalizeItemType } from '@/lib/item-types';
import { getItemTypeVisual } from '@/lib/item-type-styles';
import { useWorkoutDeckSelection } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ClassEditorWorkoutPickerProps = {
  workspaceId: string;
};

export function ClassEditorWorkoutPicker({ workspaceId }: ClassEditorWorkoutPickerProps) {
  const { addTaskToDeck, exitSelectionMode } = useWorkoutDeckSelection();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [noBubble, setNoBubble] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoBubble(false);
    const supabase = createClient();
    try {
      const { data: bubble, error: bErr } = await supabase
        .from('bubbles')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('name', 'Workouts')
        .maybeSingle();

      if (bErr) {
        setError(formatUserFacingError(bErr));
        setTasks([]);
        return;
      }
      if (!bubble?.id) {
        setNoBubble(true);
        setTasks([]);
        return;
      }

      const { data: rows, error: tErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('bubble_id', bubble.id)
        .eq('status', 'planned')
        .eq('item_type', 'workout')
        .is('archived_at', null)
        .order('title', { ascending: true });

      if (tErr) {
        setError(formatUserFacingError(tErr));
        setTasks([]);
        return;
      }

      const list = (rows ?? []) as TaskRow[];
      setTasks(list);
      console.log('[DEBUG] Fetched Library Workouts', { count: list.length });
    } catch (e) {
      setError(formatUserFacingError(e));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Workout Library
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={exitSelectionMode}
        >
          Close library
        </Button>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="py-4 text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : noBubble ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Workouts channel not found.
        </p>
      ) : tasks.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No workouts in the library yet.
        </p>
      ) : (
        <div className="max-h-[400px] space-y-1.5 overflow-y-auto pr-0.5">
          {tasks.map((task) => {
            const fields = metadataFieldsFromParsed(task.metadata);
            const durationLabel =
              fields.workoutDurationMin.trim() !== '' ? `${fields.workoutDurationMin} min` : '—';
            const typeKey = normalizeItemType(task.item_type);
            const typeVisual = getItemTypeVisual(typeKey);
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => addTaskToDeck(task)}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-md border border-border/80 bg-background/80 px-3 py-2 text-left text-sm',
                  'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <span className="font-medium text-foreground">{task.title || 'Untitled'}</span>
                <span className="text-xs text-muted-foreground">
                  {durationLabel} · {typeVisual.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
