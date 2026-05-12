'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';

export type WorkspaceInstructor = {
  id: string;
  displayName: string;
};

function displayNameFromRow(fullName: string | null, email: string | null): string {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed;
  const e = email?.trim();
  if (e && e.includes('@')) return e.split('@')[0] ?? e;
  return e ?? 'Unknown';
}

export function useWorkspaceInstructors(workspaceId: string): {
  instructors: WorkspaceInstructor[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [instructors, setInstructors] = useState<WorkspaceInstructor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInstructors = useCallback(async () => {
    if (!workspaceId.trim()) {
      setInstructors([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: qErr } = await supabase
      .from('users')
      .select('id, full_name, email, workspace_members!inner(workspace_id)')
      .in('role', ['trainer', 'admin'])
      .eq('workspace_members.workspace_id', workspaceId);

    if (qErr) {
      setError(qErr.message);
      setInstructors([]);
      setLoading(false);
      return;
    }

    const byId = new Map<string, WorkspaceInstructor>();
    for (const row of data ?? []) {
      const id = row.id as string;
      if (!id) continue;
      byId.set(id, {
        id,
        displayName: displayNameFromRow(
          (row.full_name as string | null) ?? null,
          (row.email as string | null) ?? null,
        ),
      });
    }
    const list = Array.from(byId.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    );
    setInstructors(list);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void fetchInstructors();
  }, [fetchInstructors]);

  return { instructors, loading, error, refetch: fetchInstructors };
}
