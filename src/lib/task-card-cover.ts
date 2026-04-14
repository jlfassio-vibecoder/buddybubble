'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { TaskRow } from '@/types/database';
import { parseTaskMetadata } from '@/lib/item-metadata';
import { createSignedUrlForTaskCardCover } from '@/lib/task-attachment-url';

/** Reads `metadata.card_cover_path` from a task row. */
export function taskCardCoverPath(task: Pick<TaskRow, 'metadata'>): string | null {
  const o = parseTaskMetadata(task.metadata) as Record<string, unknown>;
  const p = o.card_cover_path;
  return typeof p === 'string' && p.trim().length > 0 ? p.trim() : null;
}

/** Signed URL for displaying the cover on Kanban / chat cards. */
export function useTaskCardCoverUrl(path: string | null): {
  url: string | null;
  loading: boolean;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    void createSignedUrlForTaskCardCover(supabase, path).then((signed) => {
      if (!cancelled) {
        setUrl(signed);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { url, loading };
}
