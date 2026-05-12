'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';

import { sendClassInviteEmailAction } from '@/features/classes/actions/send-class-invite';

export type RosterEnrollment = {
  enrollmentId: string;
  userId: string;
  status: 'enrolled' | 'waitlisted' | 'cancelled' | 'completed';
  displayName: string;
  role: string | null;
  email: string | null;
};

export type RosterCandidate = {
  userId: string;
  displayName: string;
  role: string | null;
  email: string | null;
};

function displayNameFromUser(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed;
  const e = email?.trim();
  if (e && e.includes('@')) return e.split('@')[0] ?? e;
  return e ?? 'Unknown';
}

type UserRow = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
};

function readNestedUser(raw: unknown): UserRow | null {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === 'object' ? (first as UserRow) : null;
  }
  return raw as UserRow;
}

export type UseManageClassRosterArgs = {
  classInstanceId: string;
  workspaceId: string;
};

export function useManageClassRoster({ classInstanceId, workspaceId }: UseManageClassRosterArgs): {
  enrollments: RosterEnrollment[];
  candidates: RosterCandidate[];
  loading: boolean;
  error: string | null;
  addMember: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  removeMember: (enrollmentId: string) => Promise<{ ok: boolean; error?: string }>;
  sendInviteEmail: (targetUserId: string) => Promise<{ ok: boolean; error?: string }>;
  mutating: boolean;
  refetch: () => Promise<void>;
} {
  const [enrollments, setEnrollments] = useState<RosterEnrollment[]>([]);
  const [candidates, setCandidates] = useState<RosterCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  const refetch = useCallback(async () => {
    const iid = classInstanceId.trim();
    const wid = workspaceId.trim();
    if (!iid || !wid) {
      setEnrollments([]);
      setCandidates([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: enrollData, error: enrollErr } = await supabase
      .from('class_enrollments')
      .select(
        'id, user_id, status, user:users!class_enrollments_user_id_fkey(id, full_name, email, role)',
      )
      .eq('instance_id', iid)
      .in('status', ['enrolled', 'waitlisted'])
      .order('enrolled_at', { ascending: true });

    if (enrollErr) {
      setError(enrollErr.message);
      setEnrollments([]);
      setCandidates([]);
      setLoading(false);
      return;
    }

    const enrolledUserIds = new Set<string>();
    const rows: RosterEnrollment[] = [];
    for (const row of enrollData ?? []) {
      const eid = row.id as string;
      const uid = row.user_id as string;
      const st = row.status as RosterEnrollment['status'];
      if (!eid || !uid) continue;
      enrolledUserIds.add(uid);
      const u = readNestedUser(row.user);
      rows.push({
        enrollmentId: eid,
        userId: uid,
        status: st as RosterEnrollment['status'],
        displayName: displayNameFromUser(u?.full_name, u?.email),
        role: (u?.role as string | null | undefined) ?? null,
        email: (u?.email as string | null | undefined) ?? null,
      });
    }
    setEnrollments(rows);

    const { data: memberData, error: memberErr } = await supabase
      .from('workspace_members')
      .select('user_id, users!workspace_members_user_id_fkey(id, full_name, email, role)')
      .eq('workspace_id', wid);

    if (memberErr) {
      setError(memberErr.message);
      setCandidates([]);
      setLoading(false);
      return;
    }

    const cand: RosterCandidate[] = [];
    const seen = new Set<string>();
    for (const row of memberData ?? []) {
      const uid = row.user_id as string;
      if (!uid || enrolledUserIds.has(uid) || seen.has(uid)) continue;
      seen.add(uid);
      const u = readNestedUser(row.users);
      cand.push({
        userId: uid,
        displayName: displayNameFromUser(u?.full_name, u?.email),
        role: (u?.role as string | null | undefined) ?? null,
        email: (u?.email as string | null | undefined) ?? null,
      });
    }
    cand.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    );
    setCandidates(cand);
    setLoading(false);
  }, [classInstanceId, workspaceId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const addMember = useCallback(
    async (userId: string): Promise<{ ok: boolean; error?: string }> => {
      const uid = userId.trim();
      const iid = classInstanceId.trim();
      const wid = workspaceId.trim();
      if (!uid || !iid || !wid) return { ok: false, error: 'Missing instance or user.' };

      setMutating(true);
      const supabase = createClient();
      const { error: insErr } = await supabase.from('class_enrollments').insert({
        instance_id: iid,
        workspace_id: wid,
        user_id: uid,
        status: 'enrolled',
      });
      setMutating(false);
      if (insErr) {
        return { ok: false, error: insErr.message };
      }
      await refetch();
      return { ok: true };
    },
    [classInstanceId, workspaceId, refetch],
  );

  const sendInviteEmail = useCallback(
    async (targetUserId: string): Promise<{ ok: boolean; error?: string }> => {
      const uid = targetUserId.trim();
      const iid = classInstanceId.trim();
      const wid = workspaceId.trim();
      if (!uid || !iid || !wid) {
        return { ok: false, error: 'Missing instance or user.' };
      }
      const res = await sendClassInviteEmailAction({
        workspaceId: wid,
        classInstanceId: iid,
        targetUserId: uid,
      });
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    [classInstanceId, workspaceId],
  );

  const removeMember = useCallback(
    async (enrollmentId: string): Promise<{ ok: boolean; error?: string }> => {
      const eid = enrollmentId.trim();
      if (!eid) return { ok: false, error: 'Missing enrollment id.' };

      setMutating(true);
      const supabase = createClient();
      const { error: delErr } = await supabase.from('class_enrollments').delete().eq('id', eid);
      setMutating(false);
      if (delErr) {
        return { ok: false, error: delErr.message };
      }
      await refetch();
      return { ok: true };
    },
    [refetch],
  );

  return {
    enrollments,
    candidates,
    loading,
    error,
    addMember,
    removeMember,
    sendInviteEmail,
    mutating,
    refetch,
  };
}
