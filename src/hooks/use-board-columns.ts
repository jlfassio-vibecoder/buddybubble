'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';

/** Default columns when a workspace has no `board_columns` rows (legacy workspaces). */
export const LEGACY_KANBAN_COLUMNS: { id: string; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

/**
 * Loads workspace-specific Kanban columns from `board_columns`, or legacy 3-column defaults.
 * Returns `null` until the first fetch completes for a non-null workspace id.
 */
export function useBoardColumnDefs(
  workspaceId: string | null,
): { id: string; label: string }[] | null {
  const [columns, setColumns] = useState<{ id: string; label: string }[] | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setColumns(LEGACY_KANBAN_COLUMNS);
      return;
    }

    let cancelled = false;
    setColumns(null);

    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('board_columns')
        .select('slug,name,position')
        .eq('workspace_id', workspaceId)
        .order('position', { ascending: true });

      if (cancelled) return;

      if (error || !data?.length) {
        setColumns(LEGACY_KANBAN_COLUMNS);
        return;
      }

      setColumns(data.map((r) => ({ id: r.slug, label: r.name })));
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return columns;
}
