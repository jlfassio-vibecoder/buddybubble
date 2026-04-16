'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import { createSignedUrlForTaskAttachmentThumb } from '@/lib/task-attachment-url';
import { useTaskCardCoverUrl } from '@/lib/task-card-cover';

/** Private bucket: must use signed URLs — raw `/storage/v1/object/...` 400s in the browser. */
export function TaskAttachmentImagePreview({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void createSignedUrlForTaskAttachmentThumb(supabase, path).then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!src) {
    return (
      <div
        className="h-10 w-10 shrink-0 animate-pulse rounded border border-border bg-muted"
        aria-hidden
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-10 w-10 shrink-0 rounded border border-border object-cover"
    />
  );
}

export function TaskCardCoverModalPreview({ path }: { path: string | null }) {
  const { url, loading } = useTaskCardCoverUrl(path);
  if (!path?.trim()) return null;
  if (loading || !url) {
    return (
      <div
        className="h-24 w-full max-w-md animate-pulse rounded-md border border-border bg-muted"
        aria-hidden
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="h-24 w-full max-w-md rounded-md border border-border object-cover"
    />
  );
}
