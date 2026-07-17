'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Layers } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { formatUserFacingError } from '@/lib/format-error';
import { cn } from '@/lib/utils';
import {
  filterLibraryItems,
  offeringNameFromEmbed,
  parseAccessScope,
  type VideoLibraryCoachFilter,
  type VideoLibraryListItem,
} from '@/lib/video-library/library';
import { isVideoAggregationMetadata } from '@/lib/video-library/provision-aggregation-parent';
import { Button } from '@/components/ui/button';
import { VideoPublicationCard } from '@/components/fitness/VideoPublicationCard';

export type VideoLibraryBoardProps = {
  workspaceId: string;
  bubbleId: string;
  canManage?: boolean;
  calendarSlot?: React.ReactNode;
};

const FILTERS: { id: VideoLibraryCoachFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'public', label: 'Public' },
];

function mapPublicationRows(data: unknown[]): VideoLibraryListItem[] {
  const out: VideoLibraryListItem[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const classInstanceId = typeof row.class_instance_id === 'string' ? row.class_instance_id : '';
    const publishedBy = typeof row.published_by === 'string' ? row.published_by : '';
    const publishedAt = typeof row.published_at === 'string' ? row.published_at : '';
    const scope = parseAccessScope(row.access_scope);
    if (!id || !classInstanceId || !publishedBy || !publishedAt || !scope) continue;

    const nested = row.class_instances;
    let offeringName: string | null = null;
    let instanceMeta: unknown = null;
    if (Array.isArray(nested)) {
      offeringName = offeringNameFromEmbed(nested[0] ?? null);
      instanceMeta =
        nested[0] && typeof nested[0] === 'object'
          ? (nested[0] as { metadata?: unknown }).metadata
          : null;
    } else if (nested && typeof nested === 'object') {
      offeringName = offeringNameFromEmbed(nested);
      instanceMeta = (nested as { metadata?: unknown }).metadata;
    }

    out.push({
      id,
      title: typeof row.title === 'string' ? row.title : null,
      access_scope: scope,
      published_at: publishedAt,
      published_by: publishedBy,
      class_instance_id: classInstanceId,
      offeringName,
      isAggregation: isVideoAggregationMetadata(instanceMeta),
    });
  }
  return out;
}

export function VideoLibraryBoard({
  workspaceId,
  bubbleId,
  canManage = false,
  calendarSlot,
}: VideoLibraryBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<VideoLibraryListItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<VideoLibraryCoachFilter>('all');

  const openAggregatorBuilder = useCallback(() => {
    const q = new URLSearchParams(searchParams.toString());
    q.set('video_aggregator', 'new');
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null))
      .catch(() => setUserId(null));
  }, []);

  const load = useCallback(async () => {
    if (!workspaceId || !bubbleId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: qErr } = await supabase
      .from('video_library_publications')
      .select(
        `
        id,
        title,
        access_scope,
        published_at,
        published_by,
        class_instance_id,
        class_instances (
          offering_id,
          metadata,
          class_offerings ( name )
        )
      `,
      )
      .eq('workspace_id', workspaceId)
      .eq('bubble_id', bubbleId)
      .is('unpublished_at', null)
      .order('published_at', { ascending: false });

    if (qErr) {
      setError(formatUserFacingError(qErr));
      setItems([]);
      setLoading(false);
      return;
    }

    setItems(mapPublicationRows((data ?? []) as unknown[]));
    setLoading(false);
  }, [workspaceId, bubbleId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const hadEverSubscribedRef = { current: false };

    const scheduleLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void load();
      }, 400);
    };

    const channel = supabase
      .channel(`video_library_publications_${workspaceId}_${bubbleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'video_library_publications',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => scheduleLoad(),
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          if (hadEverSubscribedRef.current) {
            scheduleLoad();
          }
          hadEverSubscribedRef.current = true;
          return;
        }
        if (
          (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') &&
          process.env.NODE_ENV === 'development'
        ) {
          console.warn('[VideoLibraryBoard] Realtime channel', status, err ?? '');
        }
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, bubbleId, load]);

  const visible = useMemo(
    () => (canManage ? filterLibraryItems(items, filter, userId) : items),
    [canManage, filter, items, userId],
  );

  const emptyCopy = canManage
    ? 'Record a session in the Solo Studio or publish a class recording to see it here.'
    : 'No videos have been published here yet.';

  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">Video Library</h2>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={openAggregatorBuilder}
              >
                <Layers className="size-3.5 shrink-0" aria-hidden />
                Create aggregated workout
              </Button>
              <div
                className="flex rounded-lg border border-border p-0.5"
                role="group"
                aria-label="Filter publications"
              >
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      filter === f.id
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading && !items.length ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading videos…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {emptyCopy}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => (
                <VideoPublicationCard
                  key={item.id}
                  item={item}
                  canManage={canManage}
                  workspaceId={workspaceId}
                  onUnpublished={(id) => setItems((prev) => prev.filter((p) => p.id !== id))}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {calendarSlot ? (
        <div className="hidden min-h-0 w-[min(100%,20rem)] shrink-0 border-l border-border lg:flex lg:flex-col">
          {calendarSlot}
        </div>
      ) : null}
    </div>
  );
}
