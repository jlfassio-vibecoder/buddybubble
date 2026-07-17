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
  const [kind, setKind] = useState<'loading' | 'single' | 'aggregate'>('loading');

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
      if (error || !data) {
        setKind('single');
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
