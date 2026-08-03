'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  enrollEventRsvp,
  listEventRsvps,
  unenrollEventRsvp,
  type EventRsvpWithProfile,
} from '@/lib/events/event-rsvp';

export type UseEventRsvpArgs = {
  taskId: string | null | undefined;
  workspaceId: string;
  currentUserId: string | null;
  /** Host capacity from metadata; null/undefined = unlimited. */
  capacity?: number | null;
};

export type UseEventRsvpResult = {
  rsvps: EventRsvpWithProfile[];
  myEnrollment: EventRsvpWithProfile | null;
  goingCount: number;
  loading: boolean;
  isMutating: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  toggleGoing: () => Promise<{ ok: boolean; error?: string }>;
};

export function useEventRsvp({
  taskId,
  workspaceId,
  currentUserId,
  capacity,
}: UseEventRsvpArgs): UseEventRsvpResult {
  const [rsvps, setRsvps] = useState<EventRsvpWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const tid = taskId?.trim() ?? '';
    if (!tid) {
      setRsvps([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listEventRsvps(tid);
      setRsvps(rows);
    } catch (e) {
      setRsvps([]);
      setError(e instanceof Error ? e.message : 'Could not load RSVPs.');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const myEnrollment = useMemo(() => {
    const uid = currentUserId?.trim();
    if (!uid) return null;
    return rsvps.find((r) => r.user_id === uid) ?? null;
  }, [rsvps, currentUserId]);

  const goingCount = rsvps.length;

  const toggleGoing = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const tid = taskId?.trim() ?? '';
    const wid = workspaceId.trim();
    const uid = currentUserId?.trim() ?? '';
    if (!tid || !wid || !uid) {
      const msg = !uid ? 'Sign in required.' : 'Save the event before RSVPing.';
      setError(msg);
      return { ok: false, error: msg };
    }

    if (myEnrollment) {
      setIsMutating(true);
      setError(null);
      const result = await unenrollEventRsvp(myEnrollment.id);
      if (!result.ok) {
        setIsMutating(false);
        setError(result.error);
        return result;
      }
      setRsvps((prev) => prev.filter((r) => r.id !== myEnrollment.id));
      setIsMutating(false);
      return { ok: true };
    }

    const cap =
      capacity != null && Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : null;
    if (cap != null && goingCount >= cap) {
      const msg = 'This event is at capacity.';
      setError(msg);
      return { ok: false, error: msg };
    }

    setIsMutating(true);
    setError(null);
    const result = await enrollEventRsvp({ taskId: tid, workspaceId: wid, userId: uid });
    if (!result.ok) {
      setIsMutating(false);
      setError(result.error);
      return result;
    }
    await refetch();
    setIsMutating(false);
    return { ok: true };
  }, [taskId, workspaceId, currentUserId, myEnrollment, capacity, goingCount, refetch]);

  return {
    rsvps,
    myEnrollment,
    goingCount,
    loading,
    isMutating,
    error,
    refetch,
    toggleGoing,
  };
}
