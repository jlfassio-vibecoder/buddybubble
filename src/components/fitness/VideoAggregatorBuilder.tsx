'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2, Plus, Timer, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';

import {
  getAvailableVodsAction,
  saveAggregationAction,
  type AvailableVodItem,
} from '@/app/(dashboard)/app/[workspace_id]/aggregator-actions';
import { PublishVideoModal } from '@/components/modals/PublishVideoModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type VideoAggregatorBuilderProps = {
  workspaceId: string;
  onClose: () => void;
  canPublish?: boolean;
};

type TimelineSegment =
  | { clientId: string; kind: 'vod'; childId: string; title: string }
  | { clientId: string; kind: 'break'; durationSec: number; title?: string };

function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatBreakLabel(sec: number): string {
  if (sec < 60) return `${sec}s break`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r === 0 ? `${m}m break` : `${m}m ${r}s break`;
}

function SortableSegmentRow({
  segment,
  onRemove,
  onDurationChange,
}: {
  segment: TimelineSegment;
  onRemove: () => void;
  onDurationChange: (sec: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: segment.clientId,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-2 py-2"
    >
      <button
        type="button"
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      {segment.kind === 'vod' ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Video className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm font-medium text-foreground">{segment.title}</span>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Timer className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-sm text-muted-foreground">
            {formatBreakLabel(segment.durationSec)}
          </span>
          <Input
            type="number"
            min={1}
            step={1}
            className="h-8 w-24"
            aria-label="Break duration in seconds"
            value={segment.durationSec}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) onDurationChange(Math.round(n));
            }}
          />
          <span className="text-xs text-muted-foreground">sec</span>
        </div>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 text-muted-foreground"
        aria-label="Remove segment"
        onClick={onRemove}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}

// Copilot suggestion ignored: a full DnD/save-flow test suite for this new builder is out of scope for this review-fix pass.
export function VideoAggregatorBuilder({
  workspaceId,
  onClose,
  canPublish = true,
}: VideoAggregatorBuilderProps) {
  const dndId = useId();
  const [title, setTitle] = useState('Aggregated Workout');
  const [vods, setVods] = useState<AvailableVodItem[]>([]);
  const [segments, setSegments] = useState<TimelineSegment[]>([]);
  const [loadingVods, setLoadingVods] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [breakDraftSec, setBreakDraftSec] = useState(60);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishParentId, setPublishParentId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortIds = useMemo(() => segments.map((s) => s.clientId), [segments]);
  const hasVod = segments.some((s) => s.kind === 'vod');

  useEffect(() => {
    let cancelled = false;
    setLoadingVods(true);
    setLoadError(null);
    void (async () => {
      const res = await getAvailableVodsAction({ workspaceId });
      if (cancelled) return;
      if ('error' in res) {
        setLoadError(res.error);
        setVods([]);
        setLoadingVods(false);
        return;
      }
      setVods(res.vods);
      setLoadingVods(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const addVod = useCallback((vod: AvailableVodItem) => {
    setSegments((prev) => [
      ...prev,
      { clientId: newClientId(), kind: 'vod', childId: vod.id, title: vod.title },
    ]);
  }, []);

  const addBreak = useCallback(() => {
    const sec =
      Number.isFinite(breakDraftSec) && breakDraftSec > 0 ? Math.round(breakDraftSec) : 60;
    setSegments((prev) => [...prev, { clientId: newClientId(), kind: 'break', durationSec: sec }]);
  }, [breakDraftSec]);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSegments((prev) => {
      const oldIndex = prev.findIndex((s) => s.clientId === active.id);
      const newIndex = prev.findIndex((s) => s.clientId === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('Enter a title for this aggregated workout.');
      return;
    }
    if (!hasVod) {
      toast.error('Add at least one video to the timeline.');
      return;
    }
    setSaving(true);
    const res = await saveAggregationAction({
      workspaceId,
      title: trimmed,
      items: segments.map((s) =>
        s.kind === 'vod'
          ? { kind: 'vod' as const, childInstanceId: s.childId, titleOverride: s.title }
          : { kind: 'break' as const, breakDurationSec: s.durationSec },
      ),
    });
    setSaving(false);
    if ('error' in res) {
      toast.error(res.error);
      return;
    }
    toast.success('Aggregated workout saved.');
    setPublishParentId(res.parentInstanceId);
    if (canPublish) {
      setPublishOpen(true);
    } else {
      onClose();
    }
  }, [canPublish, hasVod, onClose, segments, title, workspaceId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="aggregator-title">
            Aggregated workout title
          </label>
          <Input
            id="aggregator-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 40-min Tabata + HIIT + AMRAP"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !hasVod}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              'Save Aggregator'
            )}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 lg:flex-row">
        <aside className="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border bg-muted/10 lg:w-72 lg:shrink-0">
          <div className="shrink-0 border-b border-border px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Available videos
            </h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loadingVods ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">Loading ready videos…</p>
            ) : loadError ? (
              <p className="px-2 py-4 text-sm text-destructive" role="alert">
                {loadError}
              </p>
            ) : vods.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                No ready recordings yet. Finish a Solo Studio upload first.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {vods.map((vod) => (
                  <li key={vod.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left text-sm',
                        'hover:bg-muted/60',
                      )}
                      onClick={() => addVod(vod)}
                    >
                      <span className="min-w-0 truncate font-medium">{vod.title}</span>
                      <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/10">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Timeline
            </h3>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                step={1}
                className="h-8 w-20"
                aria-label="New break duration in seconds"
                value={breakDraftSec}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setBreakDraftSec(n);
                }}
              />
              <Button type="button" size="sm" variant="secondary" onClick={addBreak}>
                <Timer className="size-3.5" aria-hidden />
                Add Break
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {segments.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Add videos from your library to build a longer workout.
              </p>
            ) : (
              <DndContext
                id={`${dndId}-aggregator-timeline`}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-2">
                    {segments.map((segment) => (
                      <SortableSegmentRow
                        key={segment.clientId}
                        segment={segment}
                        onRemove={() =>
                          setSegments((prev) => prev.filter((s) => s.clientId !== segment.clientId))
                        }
                        onDurationChange={(sec) =>
                          setSegments((prev) =>
                            prev.map((s) =>
                              s.clientId === segment.clientId && s.kind === 'break'
                                ? { ...s, durationSec: sec }
                                : s,
                            ),
                          )
                        }
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </section>
      </div>

      {canPublish && publishParentId ? (
        <PublishVideoModal
          open={publishOpen}
          onOpenChange={(open) => {
            setPublishOpen(open);
            if (!open) onClose();
          }}
          workspaceId={workspaceId}
          classInstanceId={publishParentId}
          defaultTitle={title.trim() || 'Aggregated Workout'}
        />
      ) : null}
    </div>
  );
}
