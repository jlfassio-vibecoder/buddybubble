'use client';

import { useCallback, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import { DEFAULT_CLASS_PROVIDER } from '@/lib/fitness/class-providers';

export type UseClassEnrollmentArgs = {
  classInstanceId: string;
  workspaceId: string;
  currentUserId: string | null;
  enrollmentId: string | null;
};

export type UseClassEnrollmentResult = {
  enroll: () => Promise<{ ok: boolean; error?: string }>;
  waitlist: () => Promise<{ ok: boolean; error?: string }>;
  unenroll: () => Promise<{ ok: boolean; error?: string }>;
  isMutating: boolean;
  error: string | null;
};

export function useClassEnrollment({
  classInstanceId,
  workspaceId,
  currentUserId,
  enrollmentId,
}: UseClassEnrollmentArgs): UseClassEnrollmentResult {
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const insertStatus = useCallback(
    async (status: 'enrolled' | 'waitlisted'): Promise<{ ok: boolean; error?: string }> => {
      const uid = currentUserId?.trim();
      if (!uid) {
        const msg = 'Sign in required.';
        setError(msg);
        return { ok: false, error: msg };
      }
      const iid = classInstanceId.trim();
      const wid = workspaceId.trim();
      if (!iid || !wid) {
        const msg = 'Missing class or workspace.';
        setError(msg);
        return { ok: false, error: msg };
      }
      setIsMutating(true);
      setError(null);
      const supabase = createClient();
      const { error: insErr } = await supabase.from('class_enrollments').insert({
        instance_id: iid,
        workspace_id: wid,
        user_id: uid,
        status,
      });
      setIsMutating(false);
      if (insErr) {
        setError(insErr.message);
        return { ok: false, error: insErr.message };
      }
      setError(null);
      return { ok: true };
    },
    [classInstanceId, workspaceId, currentUserId],
  );

  const enroll = useCallback(() => insertStatus('enrolled'), [insertStatus]);

  const waitlist = useCallback(() => insertStatus('waitlisted'), [insertStatus]);

  const unenroll = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const eid = enrollmentId?.trim();
    if (!eid) {
      const msg = 'No enrollment to remove.';
      setError(msg);
      return { ok: false, error: msg };
    }
    setIsMutating(true);
    setError(null);
    try {
      await DEFAULT_CLASS_PROVIDER.unenroll(eid);
      setIsMutating(false);
      setError(null);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not cancel enrollment';
      setIsMutating(false);
      setError(msg);
      return { ok: false, error: msg };
    }
  }, [enrollmentId]);

  return { enroll, waitlist, unenroll, isMutating, error };
}
