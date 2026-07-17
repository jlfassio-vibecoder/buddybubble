'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Library, SkipForward } from 'lucide-react';
import {
  getAggregatorLinksAction,
  type AggregatorLinkDto,
} from '@/app/(dashboard)/app/[workspace_id]/aggregator-actions';
import { PublishVideoModal } from '@/components/modals/PublishVideoModal';
import { Button } from '@/components/ui/button';
import { CoachContextRail } from '@/features/live-video/components/CoachContextRail';
import { AsyncPlaybackWorkoutLogger } from '@/features/live-video/shells/ParticipantWorkoutLogger';
import { SessionHeader } from '@/features/live-video/shells/huddle/SessionHeader';
import {
  WorkoutDeckSelectionProvider,
  useWorkoutDeckSelection,
} from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { initialSessionState } from '@/features/live-video/state/sessionStateMachine';
import { WorkoutQueueRegion } from '@/features/live-video/ui/WorkoutQueueRegion';
import { classDeckBuilderSessionId } from '@/lib/fitness/class-deck-builder-session-id';
import { resolveClassRecordingPlaybackUrl } from '@/lib/video-library/resolve-class-recording-url';
import { cn } from '@/lib/utils';
import { useUserProfileStore } from '@/store/userProfileStore';
import { createClient } from '@utils/supabase/client';

export type AggregatedPlaybackShellProps = {
  classInstanceId: string;
  onClose: () => void;
  className?: string;
  workspaceId?: string;
  defaultTitle?: string;
  canPublish?: boolean;
};

function segmentTitle(link: AggregatorLinkDto): string {
  if (link.titleOverride?.trim()) return link.titleOverride.trim();
  if (link.linkKind === 'break') return 'Break';
  return link.childTitle?.trim() || 'Untitled recording';
}

function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function VodTheaterInner({
  childInstanceId,
  workspaceId,
  canPublish,
  videoUrl,
  videoError,
  onVideoEnded,
  onSelectDeckItem,
  localActiveDeckItemId,
}: {
  childInstanceId: string;
  workspaceId?: string;
  canPublish: boolean;
  videoUrl: string | null;
  videoError: string | null;
  onVideoEnded: () => void;
  onSelectDeckItem: (id: string | null) => void;
  localActiveDeckItemId: string | null;
}) {
  const deckCtx = useWorkoutDeckSelection();
  const deckSessionId = classDeckBuilderSessionId(childInstanceId);

  useEffect(() => {
    if (localActiveDeckItemId) return;
    if (deckCtx.deck.length === 0) return;
    const first = deckCtx.deck[0];
    onSelectDeckItem(first.deckItemId ?? first.snapshotId);
  }, [deckCtx.deck, localActiveDeckItemId, onSelectDeckItem]);

  const activeSnapshot = useMemo(() => {
    if (!localActiveDeckItemId) return null;
    return (
      deckCtx.deck.find((s) => (s.deckItemId ?? s.snapshotId) === localActiveDeckItemId) ?? null
    );
  }, [deckCtx.deck, localActiveDeckItemId]);

  const deckIsEmpty = !deckCtx.isDeckHydrating && deckCtx.deck.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {!deckIsEmpty ? (
          <div className="flex min-h-[220px] min-w-0 flex-1 flex-col lg:max-w-md">
            <AsyncPlaybackWorkoutLogger
              className="min-h-0 flex-1 rounded-lg border border-border bg-muted/10 p-2"
              sessionId={deckSessionId}
              activeDeckItemId={localActiveDeckItemId}
            />
          </div>
        ) : (
          <div className="flex min-h-[120px] min-w-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 px-4 text-center text-sm text-muted-foreground lg:max-w-md">
            {deckCtx.isDeckHydrating ? 'Loading workout…' : 'No workout attached to this segment.'}
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-[1.4] flex-col justify-center">
          {videoError ? (
            <p className="mx-auto max-w-md text-center text-sm text-destructive" role="alert">
              {videoError}
            </p>
          ) : null}
          {!videoError && videoUrl ? (
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              autoPlay
              className="aspect-video w-full rounded-lg border border-border bg-black object-contain"
              onEnded={onVideoEnded}
            />
          ) : null}
          {!videoError && !videoUrl ? (
            <div
              className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground"
              role="status"
            >
              Preparing playback…
            </div>
          ) : null}
        </div>
        {!deckIsEmpty ? (
          <CoachContextRail
            workspaceId={workspaceId}
            activeSnapshot={activeSnapshot}
            canPostMessages={canPublish}
          />
        ) : (
          <aside className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 px-4 text-center text-sm text-muted-foreground lg:w-[min(100%,20rem)] lg:shrink-0">
            Coach notes appear when a workout is attached.
          </aside>
        )}
      </div>
      {!deckIsEmpty ? (
        <WorkoutQueueRegion
          className="min-h-0 min-w-0 shrink-0"
          state={initialSessionState}
          uiMode="builder"
          selectingFromBoard={false}
          asyncMemberReadOnlyQueue
          asyncQueueSessionId={deckSessionId}
          selectedAsyncDeckItemId={localActiveDeckItemId}
          onAsyncSelectDeckItem={onSelectDeckItem}
        />
      ) : null}
    </div>
  );
}

/**
 * Playlist theater for a parent aggregation instance: cycles `class_instance_links`
 * (vod + break) with nested child decks and auto-advance / Skip.
 */
export function AggregatedPlaybackShell({
  classInstanceId,
  onClose,
  className,
  workspaceId,
  defaultTitle,
  canPublish = false,
}: AggregatedPlaybackShellProps) {
  const profileId = useUserProfileStore((s) => s.profile?.id ?? null);
  const loadProfile = useUserProfileStore((s) => s.loadProfile);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  const [parentTitle, setParentTitle] = useState(defaultTitle?.trim() || 'Aggregated Workout');
  const [links, setLinks] = useState<AggregatorLinkDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentLinkIndex, setCurrentLinkIndex] = useState(0);
  const [complete, setComplete] = useState(false);
  const [localActiveDeckItemId, setLocalActiveDeckItemId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [urlCache, setUrlCache] = useState<Record<string, string>>({});
  const [breakRemaining, setBreakRemaining] = useState<number | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const advancingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadProfile();
      const {
        data: { user },
      } = await createClient().auth.getUser();
      if (cancelled) return;
      setAuthUserId(user?.id ?? null);
      setAuthResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  const userId = profileId ?? authUserId;

  useEffect(() => {
    if (!workspaceId?.trim()) return;
    if (!userId) {
      if (authResolved) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      const res = await getAggregatorLinksAction({
        workspaceId: workspaceId.trim(),
        parentInstanceId: classInstanceId,
      });
      if (cancelled) return;
      if ('error' in res) {
        setLoadError(res.error);
        setLinks([]);
        setLoading(false);
        return;
      }
      setParentTitle(defaultTitle?.trim() || res.parentTitle);
      setLinks(res.links);
      setCurrentLinkIndex(0);
      setComplete(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authResolved, classInstanceId, defaultTitle, userId, workspaceId]);

  const activeSegment = !complete && links.length > 0 ? (links[currentLinkIndex] ?? null) : null;
  const nextSegment = links[currentLinkIndex + 1] ?? null;

  const nextSegmentFn = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setLocalActiveDeckItemId(null);
    setVideoUrl(null);
    setVideoError(null);
    setBreakRemaining(null);
    setCurrentLinkIndex((idx) => {
      const next = idx + 1;
      if (next >= links.length) {
        setComplete(true);
        return idx;
      }
      return next;
    });
  }, [links.length]);

  // Release the advance lock once the cursor/complete state has settled.
  useEffect(() => {
    advancingRef.current = false;
  }, [currentLinkIndex, complete]);

  // Resolve VOD signed URL for active child
  useEffect(() => {
    if (!activeSegment || activeSegment.linkKind !== 'vod' || !activeSegment.childInstanceId) {
      setVideoUrl(null);
      setVideoError(null);
      return;
    }
    const childId = activeSegment.childInstanceId;
    const cached = urlCache[childId];
    if (cached) {
      setVideoUrl(cached);
      setVideoError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await resolveClassRecordingPlaybackUrl(supabase, activeSegment.childRecording);
      if (cancelled) return;
      if (!res.ok) {
        setVideoError(res.error);
        setVideoUrl(null);
        return;
      }
      setUrlCache((prev) => ({ ...prev, [childId]: res.url }));
      setVideoUrl(res.url);
      setVideoError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSegment, supabase, urlCache]);

  // Prefetch next VOD URL
  useEffect(() => {
    if (!nextSegment || nextSegment.linkKind !== 'vod' || !nextSegment.childInstanceId) return;
    const childId = nextSegment.childInstanceId;
    if (urlCache[childId]) return;
    let cancelled = false;
    void (async () => {
      const res = await resolveClassRecordingPlaybackUrl(supabase, nextSegment.childRecording);
      if (cancelled || !res.ok) return;
      setUrlCache((prev) => (prev[childId] ? prev : { ...prev, [childId]: res.url }));
    })();
    return () => {
      cancelled = true;
    };
  }, [nextSegment, supabase, urlCache]);

  // Break countdown
  useEffect(() => {
    if (!activeSegment || activeSegment.linkKind !== 'break') {
      setBreakRemaining(null);
      return;
    }
    const total =
      typeof activeSegment.breakDurationSec === 'number' && activeSegment.breakDurationSec > 0
        ? Math.round(activeSegment.breakDurationSec)
        : 60;
    setBreakRemaining(total);
    const id = window.setInterval(() => {
      setBreakRemaining((prev) => {
        if (prev == null) return prev;
        if (prev <= 1) {
          window.clearInterval(id);
          queueMicrotask(() => nextSegmentFn());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [activeSegment, nextSegmentFn]);

  const isCheckingAuth = !userId && !authResolved;

  if (isCheckingAuth || loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Loading aggregated workout…
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Sign in to play this workout.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-muted-foreground">This aggregation has no segments yet.</p>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const subtitle = complete
    ? 'Workout complete.'
    : activeSegment
      ? `Segment ${currentLinkIndex + 1} / ${links.length} · ${segmentTitle(activeSegment)}`
      : '';

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:p-4', className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <SessionHeader
          className="min-w-0 flex-1 border-b-0 pb-0 text-left"
          uiMode="builder"
          titleOverride={parentTitle}
          subtitleOverride={subtitle}
        />
        <div className="flex shrink-0 items-center gap-2">
          {!complete ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1.5"
              onClick={nextSegmentFn}
            >
              <SkipForward className="size-3.5 shrink-0" aria-hidden />
              {activeSegment?.linkKind === 'break' ? 'Skip break' : 'Next'}
            </Button>
          ) : null}
          {canPublish && workspaceId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setPublishOpen(true)}
            >
              <Library className="size-3.5 shrink-0" aria-hidden />
              Publish to Library
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {canPublish && workspaceId ? (
        <PublishVideoModal
          open={publishOpen}
          onOpenChange={setPublishOpen}
          workspaceId={workspaceId}
          classInstanceId={classInstanceId}
          defaultTitle={parentTitle}
        />
      ) : null}

      {complete ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-muted/10 px-4 py-10 text-center">
          <p className="text-lg font-semibold text-foreground">Workout complete</p>
          <p className="max-w-md text-sm text-muted-foreground">
            You finished all {links.length} segments in {parentTitle}.
          </p>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : activeSegment?.linkKind === 'vod' && activeSegment.childInstanceId ? (
        <WorkoutDeckSelectionProvider
          key={classDeckBuilderSessionId(activeSegment.childInstanceId)}
          sessionIdOverride={classDeckBuilderSessionId(activeSegment.childInstanceId)}
          disableGlobalBoardBridge
          viewerUserIdOverride={userId}
        >
          <VodTheaterInner
            childInstanceId={activeSegment.childInstanceId}
            workspaceId={workspaceId}
            canPublish={canPublish}
            videoUrl={videoUrl}
            videoError={videoError}
            onVideoEnded={nextSegmentFn}
            localActiveDeckItemId={localActiveDeckItemId}
            onSelectDeckItem={setLocalActiveDeckItemId}
          />
        </WorkoutDeckSelectionProvider>
      ) : activeSegment?.linkKind === 'break' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
            <div className="flex min-h-[120px] flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 px-4 text-center text-sm text-muted-foreground lg:max-w-md">
              Rest up!
            </div>
            <div className="flex min-h-0 min-w-0 flex-[1.4] flex-col items-center justify-center gap-4 rounded-lg border border-border bg-muted/10 px-4 py-10">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Break
              </p>
              <p className="font-mono text-6xl font-semibold tabular-nums text-foreground md:text-7xl">
                {formatCountdown(breakRemaining ?? activeSegment.breakDurationSec ?? 0)}
              </p>
              <Button type="button" variant="secondary" className="gap-1.5" onClick={nextSegmentFn}>
                <ChevronRight className="size-4" aria-hidden />
                Skip break
              </Button>
            </div>
            <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 px-4 text-center text-sm text-muted-foreground lg:w-[min(100%,20rem)] lg:shrink-0">
              Rest up!
            </div>
          </div>
          <div
            className="flex shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 px-4 py-4 text-sm text-muted-foreground"
            role="status"
          >
            {nextSegment ? `Up next: ${segmentTitle(nextSegment)}` : 'Up next: End of workout'}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Invalid segment.
        </div>
      )}
    </div>
  );
}
