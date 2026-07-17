'use client';

import { useEffect, useMemo, useState } from 'react';
import { AggregatedPlaybackShell } from '@/features/live-video/shells/AggregatedPlaybackShell';
import { AsyncPlaybackShell } from '@/features/live-video/shells/AsyncPlaybackShell';
import { isVideoAggregationMetadata } from '@/lib/video-library/provision-aggregation-parent';
import { createClient } from '@utils/supabase/client';

export type ClassAsyncPlaybackRouterProps = {
  classInstanceId: string;
  onClose: () => void;
  className?: string;
  workspaceId?: string;
  defaultTitle?: string;
  canPublish?: boolean;
};

/**
 * Resolves `?class_async_player=` to single-VOD AsyncPlaybackShell or AggregatedPlaybackShell.
 */
export function ClassAsyncPlaybackRouter({
  classInstanceId,
  onClose,
  className,
  workspaceId,
  defaultTitle,
  canPublish = false,
}: ClassAsyncPlaybackRouterProps) {
  const supabase = useMemo(() => createClient(), []);
  const [kind, setKind] = useState<'loading' | 'single' | 'aggregate' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setKind('loading');
    void (async () => {
      const { data, error } = await supabase
        .from('class_instances')
        .select('metadata')
        .eq('id', classInstanceId)
        .maybeSingle();
      if (cancelled) return;
      // Neither shell is safe to guess: an aggregate has no recording and a single is not a
      // playlist, so surface an error rather than silently mounting the wrong theater.
      if (error || !data) {
        setKind('error');
        return;
      }
      setKind(isVideoAggregationMetadata(data.metadata) ? 'aggregate' : 'single');
    })();
    return () => {
      cancelled = true;
    };
  }, [classInstanceId, supabase]);

  if (kind === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Loading playback…
      </div>
    );
  }

  if (kind === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-destructive" role="alert">
          Could not load this workout. Please try again.
        </p>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    );
  }

  if (kind === 'aggregate') {
    return (
      <AggregatedPlaybackShell
        classInstanceId={classInstanceId}
        onClose={onClose}
        className={className}
        workspaceId={workspaceId}
        defaultTitle={defaultTitle}
        canPublish={canPublish}
      />
    );
  }

  return (
    <AsyncPlaybackShell
      classInstanceId={classInstanceId}
      onClose={onClose}
      className={className}
      workspaceId={workspaceId}
      defaultTitle={defaultTitle}
      canPublish={canPublish}
    />
  );
}
