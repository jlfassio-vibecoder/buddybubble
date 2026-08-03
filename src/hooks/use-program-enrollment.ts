'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  enrollProgram,
  listProgramEnrollments,
  unenrollProgram,
  type ProgramEnrollmentWithProfile,
} from '@/lib/programs/program-enrollment';

export type UseProgramEnrollmentArgs = {
  taskId: string | null | undefined;
  workspaceId: string;
  currentUserId: string | null;
  /** Host capacity from metadata; null/undefined = unlimited. */
  capacity?: number | null;
};

export type UseProgramEnrollmentResult = {
  enrollments: ProgramEnrollmentWithProfile[];
  myEnrollment: ProgramEnrollmentWithProfile | null;
  enrolledCount: number;
  loading: boolean;
  isMutating: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  toggleEnroll: () => Promise<{ ok: boolean; error?: string }>;
};

export function useProgramEnrollment({
  taskId,
  workspaceId,
  currentUserId,
  capacity,
}: UseProgramEnrollmentArgs): UseProgramEnrollmentResult {
  const [enrollments, setEnrollments] = useState<ProgramEnrollmentWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const tid = taskId?.trim() ?? '';
    if (!tid) {
      setEnrollments([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listProgramEnrollments(tid);
      setEnrollments(rows);
    } catch (e) {
      setEnrollments([]);
      setError(e instanceof Error ? e.message : 'Could not load enrollments.');
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
    return enrollments.find((r) => r.user_id === uid) ?? null;
  }, [enrollments, currentUserId]);

  const enrolledCount = enrollments.length;

  const toggleEnroll = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const tid = taskId?.trim() ?? '';
    const wid = workspaceId.trim();
    const uid = currentUserId?.trim() ?? '';
    if (!tid || !wid || !uid) {
      const msg = !uid ? 'Sign in required.' : 'Save the program before enrolling.';
      setError(msg);
      return { ok: false, error: msg };
    }

    if (myEnrollment) {
      setIsMutating(true);
      setError(null);
      const result = await unenrollProgram(myEnrollment.id);
      if (!result.ok) {
        setIsMutating(false);
        setError(result.error);
        return result;
      }
      setEnrollments((prev) => prev.filter((r) => r.id !== myEnrollment.id));
      setIsMutating(false);
      return { ok: true };
    }

    const cap =
      capacity != null && Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : null;
    if (cap != null && enrolledCount >= cap) {
      const msg = 'This program is at capacity.';
      setError(msg);
      return { ok: false, error: msg };
    }

    setIsMutating(true);
    setError(null);
    const result = await enrollProgram({ taskId: tid, workspaceId: wid, userId: uid });
    if (!result.ok) {
      setIsMutating(false);
      setError(result.error);
      return result;
    }
    await refetch();
    setIsMutating(false);
    return { ok: true };
  }, [taskId, workspaceId, currentUserId, myEnrollment, capacity, enrolledCount, refetch]);

  return {
    enrollments,
    myEnrollment,
    enrolledCount,
    loading,
    isMutating,
    error,
    refetch,
    toggleEnroll,
  };
}
