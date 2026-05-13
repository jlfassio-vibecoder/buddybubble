'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, History } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { cn } from '@/lib/utils';
import { KanbanColumnAdd } from '@/components/board/kanban-column-add';
import type { ItemType } from '@/types/database';
import { DEFAULT_CLASS_PROVIDER, type ClassInstance } from '@/lib/fitness/class-providers';
import { ManageClassRosterModal } from '@/components/modals/ManageClassRosterModal';
import { ClassCard } from '@/components/fitness/ClassCard';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Calendar date `YYYY-MM-DD` in the browser's local timezone (for bucketing vs "today"). */
function getLocalYmd(dateInput: string | number | Date): string {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayYmd(): string {
  return getLocalYmd(new Date());
}

// ── Column definitions ────────────────────────────────────────────────────────

type ColumnDef = {
  id: 'available' | 'scheduled' | 'today' | 'history';
  label: string;
  icon: React.ReactNode;
  emptyText: string;
};

const COLUMNS: ColumnDef[] = [
  {
    id: 'available',
    label: 'Available',
    icon: <CalendarDays className="h-4 w-4" />,
    emptyText: 'No upcoming classes available.',
  },
  {
    id: 'scheduled',
    label: 'Scheduled',
    icon: <Clock className="h-4 w-4" />,
    emptyText: "You haven't enrolled in any upcoming classes.",
  },
  {
    id: 'today',
    label: 'Today',
    icon: <CheckCircle2 className="h-4 w-4" />,
    emptyText: 'No classes scheduled for today.',
  },
  {
    id: 'history',
    label: 'History',
    icon: <History className="h-4 w-4" />,
    emptyText: 'Past classes will appear here.',
  },
];

// ── Bucketing ────────────────────────────────────────────────────────────────

function bucketInstance(inst: ClassInstance, today: string): ColumnDef['id'] {
  const instanceYmd = getLocalYmd(inst.scheduled_at);
  const isPast = instanceYmd < today || inst.status === 'completed' || inst.status === 'cancelled';

  if (isPast) return 'history';
  if (instanceYmd === today && inst.my_enrollment_status === 'enrolled') return 'today';
  if (inst.my_enrollment_status === 'enrolled' || inst.my_enrollment_status === 'waitlisted') {
    return 'scheduled';
  }
  return 'available';
}

// ── ClassesBoard ──────────────────────────────────────────────────────────────

type Props = {
  workspaceId: string;
  /** Injected by WorkspaceMainSplit via cloneElement — rendered alongside the board. */
  calendarSlot?: React.ReactNode;
  /** Bumped when tasks change; triggers a re-fetch. */
  taskViewsNonce?: number;
  /** Workspace owner/admin — show “Add new class” and open TaskModal with `class` type. */
  canManageClasses?: boolean;
  /** Bubble id for `openCreateTaskModal` when creating a class from this board. */
  classCreateBubbleId?: string | null;
  onOpenCreateTask?: (opts?: {
    status?: string;
    itemType?: ItemType;
    title?: string;
    workoutDurationMin?: string | null;
    bubbleId?: string | null;
    classEditorInstanceId?: string | null;
    preserveChatCallback?: boolean;
  }) => void;
  /** Opens TaskModal class shell in edit mode for the instance (details, schedule, workout deck). */
  onOpenClassEditor?: (instanceId: string) => void;
};

export function ClassesBoard({
  workspaceId,
  calendarSlot,
  taskViewsNonce,
  canManageClasses = false,
  classCreateBubbleId = null,
  onOpenCreateTask,
  onOpenClassEditor,
}: Props) {
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manageRosterInstance, setManageRosterInstance] = useState<ClassInstance | null>(null);

  // Resolve current user once.
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null))
      .catch(() => setUserId(null));
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await DEFAULT_CLASS_PROVIDER.listInstances(workspaceId, userId);
      setInstances(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, userId]);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    /** Stays true after the first `SUBSCRIBED` so a later resubscribe still refetches the board. */
    const hadEverSubscribedRef = { current: false };

    const scheduleLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void load();
      }, 400);
    };

    const channel = supabase
      .channel(`class_instances_workspace_${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'class_instances',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => scheduleLoad(),
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          // After a reconnect we may have missed UPDATEs while the socket was down — refetch once.
          if (hadEverSubscribedRef.current) {
            scheduleLoad();
          }
          hadEverSubscribedRef.current = true;
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[ClassesBoard] Realtime channel', status, err ?? '');
          }
        }
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [userId, workspaceId, load]);

  useEffect(() => {
    void load();
  }, [load, taskViewsNonce]);

  const today = todayYmd();

  const columns = useMemo(() => {
    const buckets = new Map<ColumnDef['id'], ClassInstance[]>(COLUMNS.map((c) => [c.id, []]));
    for (const inst of instances) {
      buckets.get(bucketInstance(inst, today))!.push(inst);
    }
    return buckets;
  }, [instances, today]);

  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      {/* Board columns */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && !instances.length ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading classes…
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
            {COLUMNS.map((col) => {
              const items = columns.get(col.id) ?? [];
              const showAddClass =
                canManageClasses &&
                !!onOpenCreateTask &&
                !!classCreateBubbleId &&
                (col.id === 'scheduled' || col.id === 'available');

              return (
                <div
                  key={col.id}
                  className="flex w-72 min-w-[17rem] shrink-0 flex-col rounded-xl border border-border bg-muted/20"
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                    <span
                      className={cn('text-muted-foreground', col.id === 'today' && 'text-primary')}
                    >
                      {col.icon}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{col.label}</span>
                    <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                      {items.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                    {items.length === 0 ? (
                      <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                        {col.emptyText}
                      </p>
                    ) : (
                      items.map((inst) => (
                        <ClassCard
                          key={inst.id}
                          classInstance={inst}
                          todayYmd={today}
                          canManageClasses={canManageClasses}
                          onOpenClassEditor={onOpenClassEditor}
                          onOpenManageRoster={setManageRosterInstance}
                          onEnrollmentChanged={() => void load()}
                        />
                      ))
                    )}
                    {showAddClass ? (
                      <KanbanColumnAdd
                        onAdd={() =>
                          onOpenCreateTask!({
                            itemType: 'class',
                            bubbleId: classCreateBubbleId,
                          })
                        }
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Calendar slot injected by WorkspaceMainSplit */}
      {calendarSlot ?? null}

      <ManageClassRosterModal
        open={manageRosterInstance != null}
        onOpenChange={(o) => {
          if (!o) setManageRosterInstance(null);
        }}
        classInstanceId={manageRosterInstance?.id ?? ''}
        workspaceId={workspaceId}
        capacity={manageRosterInstance?.capacity ?? null}
        currentUserId={userId}
        onChanged={() => void load()}
      />
    </div>
  );
}
