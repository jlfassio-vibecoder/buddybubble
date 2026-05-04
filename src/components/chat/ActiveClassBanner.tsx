'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEFAULT_CLASS_PROVIDER, type ClassInstance } from '@/lib/fitness/class-providers';
import { useLiveVideoStore } from '@/store/liveVideoStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import { parseLiveSessionInviteFromMessageMetadata } from '@/types/live-session-invite';

const THIRTY_MIN_MS = 30 * 60 * 1000;
const TICK_MS = 60_000;

function formatScheduled(iso: string): string {
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

function instanceWindow(inst: ClassInstance): { start: Date; end: Date } {
  const startMs = new Date(inst.scheduled_at).getTime() - THIRTY_MIN_MS;
  const durationMs = Math.max(1, inst.offering.duration_min) * 60 * 1000;
  const endMs = new Date(inst.scheduled_at).getTime() + durationMs;
  return { start: new Date(startMs), end: new Date(endMs) };
}

function pickActiveInstance(instances: ClassInstance[], now: Date): ClassInstance | null {
  const candidates = instances.filter((i) => i.status !== 'cancelled' && i.status !== 'completed');
  const inWindow = candidates.filter((i) => {
    const { start, end } = instanceWindow(i);
    return now >= start && now <= end;
  });
  if (inWindow.length === 0) return null;
  const enrolled = inWindow.filter((i) => i.my_enrollment_status === 'enrolled');
  const pool = enrolled.length > 0 ? enrolled : inWindow;
  return [...pool].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  )[0];
}

type Props = {
  workspaceId: string;
};

export function ActiveClassBanner({ workspaceId }: Props) {
  const [tick, setTick] = useState(0);
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const currentUserId = useUserProfileStore((s) => s.profile?.id ?? null);
  const activeLiveSession = useLiveVideoStore((s) => s.activeSession);

  const load = useCallback(async () => {
    if (!currentUserId) {
      setInstances([]);
      return;
    }
    try {
      const data = await DEFAULT_CLASS_PROVIDER.listInstances(workspaceId, currentUserId);
      setInstances(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load classes');
      setInstances([]);
    }
  }, [workspaceId, currentUserId]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const now = useMemo(() => new Date(), [tick]);

  const activeInstance = useMemo(() => pickActiveInstance(instances, now), [instances, now]);

  const liveInvite = useMemo(
    () =>
      activeInstance ? parseLiveSessionInviteFromMessageMetadata(activeInstance.metadata) : null,
    [activeInstance],
  );

  const inLiveSession = useMemo(() => {
    if (!activeLiveSession || !liveInvite) return false;
    return (
      activeLiveSession.sessionId === liveInvite.sessionId &&
      activeLiveSession.channelId === liveInvite.channelId &&
      activeLiveSession.workspaceId === liveInvite.workspaceId
    );
  }, [activeLiveSession, liveInvite]);

  if (!currentUserId || loadError) return null;
  if (!activeInstance) return null;

  const showJoin = liveInvite && !liveInvite.endedAt && !inLiveSession && currentUserId;

  return (
    <div
      className="relative z-10 w-full shrink-0 border-b border-blue-100 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
      role="region"
      aria-label="Active class"
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-lg font-bold leading-tight tracking-tight text-foreground">
            {activeInstance.offering.name}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            {formatScheduled(activeInstance.scheduled_at)}
            {activeInstance.offering.duration_min
              ? ` · ${activeInstance.offering.duration_min} min`
              : ''}
          </p>
          {activeInstance.instructor_notes ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {activeInstance.instructor_notes}
            </p>
          ) : null}
        </div>
        <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          {showJoin ? (
            <Button
              type="button"
              size="default"
              variant="default"
              className="h-10 w-full gap-2 font-semibold shadow-sm sm:w-auto sm:min-w-[10rem]"
              onClick={() => {
                if (inLiveSession || !currentUserId || !liveInvite) return;
                useLiveVideoStore.getState().joinSession({
                  workspaceId: liveInvite.workspaceId,
                  sessionId: liveInvite.sessionId,
                  channelId: liveInvite.channelId,
                  hostUserId: liveInvite.hostUserId,
                  mode: liveInvite.mode,
                  sourceInstanceId: activeInstance.id,
                });
              }}
            >
              <Video className="h-4 w-4 shrink-0" aria-hidden />
              Join live session
            </Button>
          ) : liveInvite && !liveInvite.endedAt && inLiveSession ? (
            <span className="text-center text-sm font-semibold text-primary sm:text-right">
              Joined
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
