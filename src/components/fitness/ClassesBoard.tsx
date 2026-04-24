'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  History,
  MapPin,
  Pencil,
  Users,
  Video,
} from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { KanbanColumnAdd } from '@/components/board/kanban-column-add';
import type { ItemType } from '@/types/database';
import { DEFAULT_CLASS_PROVIDER, type ClassInstance } from '@/lib/fitness/class-providers';
import { useLiveVideoStore } from '@/store/liveVideoStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import { parseLiveSessionInviteFromMessageMetadata } from '@/types/live-session-invite';

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

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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

// ── ClassCard ─────────────────────────────────────────────────────────────────

type ClassCardProps = {
  instance: ClassInstance;
  /** Local calendar `YYYY-MM-DD` for the board render (must match `bucketInstance`). */
  todayYmd: string;
  onEnroll: (instance: ClassInstance) => void;
  onUnenroll: (instance: ClassInstance) => void;
  enrolling: boolean;
  /** When set with `onOpenClassEditor`, trainers see “Edit” to open the class editor. */
  canManageClasses?: boolean;
  onOpenClassEditor?: (instanceId: string) => void;
};

function ClassCard({
  instance,
  todayYmd: todayYmdProp,
  onEnroll,
  onUnenroll,
  enrolling,
  canManageClasses = false,
  onOpenClassEditor,
}: ClassCardProps) {
  const { offering } = instance;
  const enrolled = instance.my_enrollment_status === 'enrolled';
  const waitlisted = instance.my_enrollment_status === 'waitlisted';
  const isFull = instance.capacity !== null && instance.enrollment_count >= instance.capacity;
  const isPast =
    getLocalYmd(instance.scheduled_at) < todayYmdProp ||
    instance.status === 'completed' ||
    instance.status === 'cancelled';

  const liveInvite = useMemo(
    () => parseLiveSessionInviteFromMessageMetadata(instance.metadata),
    [instance.metadata],
  );
  const activeLiveSession = useLiveVideoStore((s) => s.activeSession);
  const currentUserId = useUserProfileStore((s) => s.profile?.id ?? null);
  const inLiveSession = useMemo(() => {
    if (!activeLiveSession || !liveInvite) return false;
    return (
      activeLiveSession.sessionId === liveInvite.sessionId &&
      activeLiveSession.channelId === liveInvite.channelId &&
      activeLiveSession.workspaceId === liveInvite.workspaceId
    );
  }, [activeLiveSession, liveInvite]);

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="min-w-0 font-medium leading-snug text-foreground">{offering.name}</p>
        {enrolled && (
          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
            Enrolled
          </span>
        )}
        {waitlisted && (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            Waitlist
          </span>
        )}
        {instance.status === 'cancelled' && (
          <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
            Cancelled
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" aria-hidden />
          {formatTime(instance.scheduled_at)}
          {offering.duration_min ? ` · ${offering.duration_min} min` : ''}
        </span>
        {offering.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            {offering.location}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3 shrink-0" aria-hidden />
          {instance.enrollment_count}
          {instance.capacity !== null ? `/${instance.capacity}` : ''} enrolled
        </span>
      </div>

      {offering.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{offering.description}</p>
      )}

      {instance.instructor_notes && (
        <p className="mt-1.5 text-xs italic text-muted-foreground">
          &ldquo;{instance.instructor_notes}&rdquo;
        </p>
      )}

      {!isPast &&
      ((liveInvite && !liveInvite.endedAt) || (canManageClasses && onOpenClassEditor)) ? (
        <div className="mt-3 flex flex-col gap-2">
          {canManageClasses && onOpenClassEditor ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 w-full gap-2 text-xs shadow-sm"
              onClick={() => onOpenClassEditor(instance.id)}
            >
              <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Edit
            </Button>
          ) : null}
          {liveInvite && !liveInvite.endedAt ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-full gap-2 text-xs shadow-sm"
              disabled={inLiveSession || !currentUserId}
              onClick={() => {
                if (inLiveSession || !currentUserId || !liveInvite) return;
                useLiveVideoStore.getState().joinSession({
                  workspaceId: liveInvite.workspaceId,
                  sessionId: liveInvite.sessionId,
                  channelId: liveInvite.channelId,
                  hostUserId: liveInvite.hostUserId,
                  mode: liveInvite.mode,
                  sourceInstanceId: instance.id,
                });
              }}
            >
              <Video className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {inLiveSession ? 'Joined' : !currentUserId ? 'Sign in to join' : 'Join live session'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!isPast && (
        <div className="mt-3">
          {enrolled || waitlisted ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={enrolling}
              onClick={() => onUnenroll(instance)}
            >
              {enrolling ? 'Updating…' : 'Cancel enrollment'}
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={enrolling || (isFull && instance.capacity !== null)}
              onClick={() => onEnroll(instance)}
            >
              {enrolling
                ? 'Enrolling…'
                : isFull && instance.capacity !== null
                  ? 'Class full'
                  : 'Enroll'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
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
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

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

  const handleEnroll = useCallback(
    async (inst: ClassInstance) => {
      if (!userId) return;
      setEnrollingId(inst.id);
      try {
        await DEFAULT_CLASS_PROVIDER.enroll(inst.id, userId, workspaceId);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Enrollment failed');
      } finally {
        setEnrollingId(null);
      }
    },
    [userId, workspaceId, load],
  );

  const handleUnenroll = useCallback(
    async (inst: ClassInstance) => {
      if (!inst.my_enrollment_id) return;
      setEnrollingId(inst.id);
      try {
        await DEFAULT_CLASS_PROVIDER.unenroll(inst.my_enrollment_id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not cancel enrollment');
      } finally {
        setEnrollingId(null);
      }
    },
    [load],
  );

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
                          instance={inst}
                          todayYmd={today}
                          onEnroll={handleEnroll}
                          onUnenroll={handleUnenroll}
                          enrolling={enrollingId === inst.id}
                          canManageClasses={canManageClasses}
                          onOpenClassEditor={onOpenClassEditor}
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
    </div>
  );
}
