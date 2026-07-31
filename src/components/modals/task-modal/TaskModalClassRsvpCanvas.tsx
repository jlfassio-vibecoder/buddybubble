'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { TaskModalSection } from '@/components/modals/task-modal/TaskModalSection';
import { useManageClassRoster } from '@/hooks/useManageClassRoster';

const AVATAR_PREVIEW = 5;

export type TaskModalClassRsvpCanvasProps = {
  instanceId: string;
  workspaceId: string;
  /** When omitted, loads persisted `class_instances.capacity`. */
  capacity?: number | null;
  onManageRoster?: () => void;
  className?: string;
};

/**
 * Handoff-aligned read canvas for Class Details: reserved fill, progress, avatar stack.
 * Capacity editing stays in ClassEditor; fill % uses persisted capacity unless overridden.
 */
export function TaskModalClassRsvpCanvas({
  instanceId,
  workspaceId,
  capacity: capacityProp,
  onManageRoster,
  className,
}: TaskModalClassRsvpCanvasProps) {
  const [fetchedCapacity, setFetchedCapacity] = useState<number | null | undefined>(undefined);
  const { enrollments, loading, error } = useManageClassRoster({
    classInstanceId: instanceId,
    workspaceId,
  });

  useEffect(() => {
    if (capacityProp !== undefined) {
      setFetchedCapacity(undefined);
      return;
    }
    const iid = instanceId.trim();
    if (!iid) {
      setFetchedCapacity(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data, error: capErr } = await supabase
        .from('class_instances')
        .select('capacity')
        .eq('id', iid)
        .maybeSingle();
      if (cancelled) return;
      if (capErr) {
        setFetchedCapacity(null);
        return;
      }
      const cap = data?.capacity;
      setFetchedCapacity(typeof cap === 'number' && Number.isFinite(cap) ? cap : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [instanceId, capacityProp]);

  const capacity = capacityProp !== undefined ? capacityProp : (fetchedCapacity ?? null);

  const reserved = useMemo(
    () => enrollments.filter((e) => e.status === 'enrolled').length,
    [enrollments],
  );

  const spotsLabel = useMemo(() => {
    if (capacity == null) return 'Unlimited spots';
    const left = Math.max(0, capacity - reserved);
    return `${left} spot${left === 1 ? '' : 's'} left`;
  }, [capacity, reserved]);

  const fillPct = useMemo(() => {
    if (capacity == null || capacity <= 0) return 0;
    return Math.min(100, Math.round((reserved / capacity) * 100));
  }, [capacity, reserved]);

  const shown = enrollments.slice(0, AVATAR_PREVIEW);
  const overflow = Math.max(0, enrollments.length - shown.length);

  return (
    <div className={className} data-testid="task-modal-class-rsvp-canvas">
      <TaskModalSection
        icon={<Users className="size-4" aria-hidden />}
        title="Signup"
        sub="Enrollment fill for this class. Edit capacity below; manage the roster to add or remove members."
      >
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div
          className="flex flex-wrap items-end justify-between gap-3 rounded-[var(--radius-xl)] border border-border bg-background px-3.5 py-3.5"
          data-testid="task-modal-class-rsvp"
        >
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="text-[13px] font-semibold tracking-tight text-foreground">
              {loading && enrollments.length === 0 ? (
                <span className="text-muted-foreground">Loading enrollment…</span>
              ) : (
                <>
                  <span data-testid="task-modal-class-rsvp-reserved">{reserved} reserved</span>
                  <span className="text-muted-foreground"> · {spotsLabel}</span>
                </>
              )}
            </div>

            {shown.length > 0 ? (
              <AvatarGroup
                className="-space-x-1.5 *:data-[slot=avatar]:size-7 *:data-[slot=avatar]:ring-1 *:data-[slot=avatar]:ring-background"
                data-testid="task-modal-class-rsvp-avatars"
              >
                {shown.map((e) => {
                  const initial = e.displayName.slice(0, 1).toUpperCase() || '?';
                  return (
                    <Avatar key={e.enrollmentId} size="sm" title={e.displayName}>
                      {e.avatarUrl ? <AvatarImage src={e.avatarUrl} alt="" /> : null}
                      <AvatarFallback className="text-[10px] text-muted-foreground">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                  );
                })}
                {overflow > 0 ? (
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-1 ring-background"
                    data-testid="task-modal-class-rsvp-avatar-overflow"
                  >
                    +{overflow}
                  </span>
                ) : null}
              </AvatarGroup>
            ) : null}

            {capacity != null && capacity > 0 ? (
              <Progress
                value={fillPct}
                className="max-w-xs"
                data-testid="task-modal-class-rsvp-progress"
              />
            ) : null}
          </div>

          {onManageRoster ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onManageRoster}
              data-testid="task-modal-class-rsvp-manage"
            >
              Manage roster
            </Button>
          ) : null}
        </div>
      </TaskModalSection>
    </div>
  );
}
