'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Library, Play } from 'lucide-react';
import { PublishVideoModal } from '@/components/modals/PublishVideoModal';
import { Button } from '@/components/ui/button';
import { AsyncPlaybackWorkoutLogger } from '@/features/live-video/shells/ParticipantWorkoutLogger';
import { SessionDeckBuilder } from '@/features/live-video/shells/huddle/SessionDeckBuilder';
import { SessionHeader } from '@/features/live-video/shells/huddle/SessionHeader';
import {
  WorkoutDeckSelectionProvider,
  useWorkoutDeckSelection,
} from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { initialSessionState } from '@/features/live-video/state/sessionStateMachine';
import { classDeckBuilderSessionId } from '@/lib/fitness/class-deck-builder-session-id';
import {
  CLASS_RECORDINGS_BUCKET,
  storagePathAsAgoraUploadKey,
} from '@/lib/class-recording-storage';
import { formatUserFacingError } from '@/lib/format-error';
import { cn } from '@/lib/utils';
import {
  isClassRecordingPipelineBusy,
  parseClassRecordingFromInstanceMetadata,
  type ClassRecordingPayload,
  type ClassRecordingStatus,
} from '@/types/live-session-invite';
import { useUserProfileStore } from '@/store/userProfileStore';
import { createClient } from '@utils/supabase/client';

export type AsyncPlaybackShellProps = {
  classInstanceId: string;
  onClose: () => void;
  className?: string;
  workspaceId?: string;
  defaultTitle?: string;
  canPublish?: boolean;
};

function AsyncPlaybackShellInner({
  classInstanceId,
  onClose,
  className,
  workspaceId,
  defaultTitle,
  canPublish = false,
}: AsyncPlaybackShellProps) {
  const deckSessionId = useMemo(
    () => classDeckBuilderSessionId(classInstanceId),
    [classInstanceId],
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [localActiveDeckItemId, setLocalActiveDeckItemId] = useState<string | null>(null);
  const [recordingRec, setRecordingRec] = useState<ClassRecordingPayload | null>(null);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);
  const [recordingLoadError, setRecordingLoadError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [resolvedTitle, setResolvedTitle] = useState(defaultTitle?.trim() || 'Untitled recording');

  const supabase = useMemo(() => createClient(), []);
  const deckCtx = useWorkoutDeckSelection();
  /** Last successful parse of `class_recording.status` — used to keep polling after transient read errors while processing. */
  const lastRecordingStatusRef = useRef<ClassRecordingStatus | null>(null);

  useEffect(() => {
    if (defaultTitle?.trim()) {
      setResolvedTitle(defaultTitle.trim());
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('class_instances')
        .select('offering_id, class_offerings(name)')
        .eq('id', classInstanceId)
        .maybeSingle();
      if (cancelled) return;
      const nested = data as {
        class_offerings?: { name?: string } | { name?: string }[] | null;
      } | null;
      const offering = nested?.class_offerings;
      const name = Array.isArray(offering) ? offering[0]?.name : offering?.name;
      if (typeof name === 'string' && name.trim()) {
        setResolvedTitle(name.trim());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classInstanceId, defaultTitle, supabase]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[AsyncPlayback] Loaded shell for class:',
        classInstanceId,
        '| isPlaying:',
        isPlaying,
      );
    }
  }, [classInstanceId, isPlaying]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const clearPoll = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const schedulePoll = () => {
      intervalId = setInterval(() => {
        void fetchMetadata();
      }, 15_000);
    };

    const fetchMetadata = async () => {
      const { data, error } = await supabase
        .from('class_instances')
        .select('metadata')
        .eq('id', classInstanceId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setRecordingLoadError(formatUserFacingError(error));
        if (!isClassRecordingPipelineBusy(lastRecordingStatusRef.current)) {
          setRecordingRec(null);
        }
        clearPoll();
        if (isClassRecordingPipelineBusy(lastRecordingStatusRef.current)) {
          schedulePoll();
        }
        return;
      }
      setRecordingLoadError(null);
      const rec = parseClassRecordingFromInstanceMetadata(data?.metadata);
      lastRecordingStatusRef.current = rec?.status ?? null;
      setRecordingRec(rec);
      clearPoll();
      if (isClassRecordingPipelineBusy(rec?.status)) {
        schedulePoll();
      }
    };

    lastRecordingStatusRef.current = null;
    void fetchMetadata();

    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [classInstanceId, supabase]);

  useEffect(() => {
    setResolvedVideoUrl(null);
    if (!recordingRec || recordingRec.status !== 'ready') {
      setRecordingLoadError(null);
      return;
    }
    const direct = recordingRec.playbackUrl?.trim() ?? '';
    if (direct) {
      setRecordingLoadError(null);
      setResolvedVideoUrl(direct);
      return;
    }
    const path = recordingRec.storagePath?.trim() ?? '';
    if (!path) {
      setRecordingLoadError(null);
      return;
    }
    const altPath = storagePathAsAgoraUploadKey(path);
    const candidates = path === altPath ? [path] : [path, altPath];
    let cancelled = false;

    void (async () => {
      let lastErr: string | null = null;
      try {
        for (const candidate of candidates) {
          const { data, error } = await supabase.storage
            .from(CLASS_RECORDINGS_BUCKET)
            .createSignedUrl(candidate, 60 * 60 * 4);
          if (cancelled) return;
          if (error) lastErr = formatUserFacingError(error);
          if (!error && data?.signedUrl) {
            setRecordingLoadError(null);
            setResolvedVideoUrl(data.signedUrl);
            return;
          }
        }
        if (cancelled) return;
        setResolvedVideoUrl(null);
        setRecordingLoadError(lastErr ?? 'Could not create a playback link for this recording.');
      } catch (e) {
        if (cancelled) return;
        setResolvedVideoUrl(null);
        setRecordingLoadError(formatUserFacingError(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recordingRec, supabase]);

  useEffect(() => {
    if (localActiveDeckItemId) return;
    if (deckCtx.deck.length === 0) return;
    const first = deckCtx.deck[0];
    setLocalActiveDeckItemId(first.deckItemId ?? first.snapshotId);
  }, [deckCtx.deck, localActiveDeckItemId]);

  const recordingPipelineBusy = isClassRecordingPipelineBusy(recordingRec?.status);
  const recordingFailed = recordingRec?.status === 'failed';
  const recordingReadyToPlay =
    recordingRec?.status === 'ready' && Boolean(resolvedVideoUrl?.trim());
  /** Queue-only async, failed pipeline, or playable video — theater still offers logger + queue. */
  const canStartTheater =
    !recordingPipelineBusy &&
    (recordingFailed ||
      !recordingRec ||
      recordingReadyToPlay ||
      Boolean(recordingRec?.status === 'ready' && recordingLoadError));

  const queueProps = {
    asyncMemberReadOnlyQueue: true as const,
    asyncQueueSessionId: deckSessionId,
    selectedAsyncDeckItemId: localActiveDeckItemId,
    onAsyncSelectDeckItem: (itemId: string | null) => setLocalActiveDeckItemId(itemId),
  };

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:p-4', className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <SessionHeader
          className="min-w-0 flex-1 border-b-0 pb-0 text-left"
          uiMode="builder"
          titleOverride="Async class playback"
          subtitleOverride={
            isPlaying
              ? 'Log your sets alongside the recording. Tap a card in the queue to switch workouts.'
              : 'Review exercises for each queue card below, then play the class recording when it’s available.'
          }
        />
        <div className="flex shrink-0 items-center gap-2">
          {canPublish && workspaceId && recordingRec?.status === 'ready' ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
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
          defaultTitle={resolvedTitle}
        />
      ) : null}

      {!isPlaying ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
            <div className="flex min-h-[220px] min-w-0 flex-1 flex-col lg:max-w-md">
              <AsyncPlaybackWorkoutLogger
                className="min-h-0 flex-1 rounded-lg border border-border bg-muted/10 p-2"
                sessionId={deckSessionId}
                activeDeckItemId={localActiveDeckItemId}
              />
            </div>
            <div className="flex min-h-0 min-w-0 flex-[1.4] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-muted/10 px-4 py-8">
              {recordingLoadError ? (
                <p className="max-w-md text-center text-sm text-destructive" role="alert">
                  {recordingLoadError}
                </p>
              ) : null}
              {recordingPipelineBusy && !recordingLoadError ? (
                <p className="max-w-md text-center text-sm text-muted-foreground" role="status">
                  {recordingRec?.status === 'recording'
                    ? 'Live recording is in progress. You can review the workout queue; playback will be available after the recording finishes and uploads.'
                    : 'Recording is processing — check back shortly. You can still review the workout queue.'}
                </p>
              ) : null}
              {recordingFailed && !recordingLoadError ? (
                <p className="max-w-md text-center text-sm text-destructive" role="alert">
                  {recordingRec?.errorMessage?.trim()
                    ? recordingRec.errorMessage.trim()
                    : 'Recording failed or is unavailable.'}
                </p>
              ) : null}
              {!recordingPipelineBusy &&
              !recordingFailed &&
              !recordingReadyToPlay &&
              !recordingLoadError ? (
                <p className="max-w-md text-center text-sm text-muted-foreground">
                  {recordingRec?.status === 'ready'
                    ? 'Preparing playback link…'
                    : 'Class recording isn’t available yet. You can still review exercises and the queue below.'}
                </p>
              ) : null}
              <Button
                type="button"
                size="lg"
                className="gap-2 shadow-md"
                disabled={!canStartTheater}
                onClick={() => setIsPlaying(true)}
              >
                <Play className="size-4 shrink-0" aria-hidden />
                Play
              </Button>
            </div>
          </div>
          <SessionDeckBuilder
            className="min-h-0 min-w-0 shrink-0"
            state={initialSessionState}
            {...queueProps}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
            <div className="flex min-h-[220px] min-w-0 flex-1 flex-col lg:max-w-md">
              <AsyncPlaybackWorkoutLogger
                className="min-h-0 flex-1 rounded-lg border border-border bg-muted/10 p-2"
                sessionId={deckSessionId}
                activeDeckItemId={localActiveDeckItemId}
              />
            </div>
            <div className="flex min-h-0 min-w-0 flex-[1.4] flex-col justify-center">
              {recordingLoadError ? (
                <p className="mx-auto max-w-md text-center text-sm text-destructive" role="alert">
                  {recordingLoadError}
                </p>
              ) : null}
              {!recordingLoadError && resolvedVideoUrl ? (
                <video
                  key={resolvedVideoUrl}
                  src={resolvedVideoUrl}
                  controls
                  className="aspect-video w-full rounded-lg border border-border bg-black object-contain"
                />
              ) : null}
              {!recordingLoadError && !resolvedVideoUrl ? (
                <div
                  className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground"
                  role="status"
                >
                  Recording unavailable — playback URL is missing for this class.
                </div>
              ) : null}
            </div>
          </div>
          <SessionDeckBuilder
            className="min-h-0 min-w-0 shrink-0"
            state={initialSessionState}
            {...queueProps}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Member-facing async playback: class draft deck namespace (`bb-class-deck:`) + optional recording URL.
 * No Agora / live runtime required.
 */
export function AsyncPlaybackShell({
  classInstanceId,
  onClose,
  className,
  workspaceId,
  defaultTitle,
  canPublish = false,
}: AsyncPlaybackShellProps) {
  const profileId = useUserProfileStore((s) => s.profile?.id ?? null);
  const loadProfile = useUserProfileStore((s) => s.loadProfile);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const deckSessionId = useMemo(
    () => classDeckBuilderSessionId(classInstanceId),
    [classInstanceId],
  );

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
  const isCheckingAuth = !userId && !authResolved;

  if (isCheckingAuth) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Loading playback…
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Sign in to play this class workout.
      </div>
    );
  }

  return (
    <WorkoutDeckSelectionProvider
      key={deckSessionId}
      sessionIdOverride={deckSessionId}
      disableGlobalBoardBridge
      viewerUserIdOverride={userId}
    >
      <AsyncPlaybackShellInner
        classInstanceId={classInstanceId}
        onClose={onClose}
        className={className}
        workspaceId={workspaceId}
        defaultTitle={defaultTitle}
        canPublish={canPublish}
      />
    </WorkoutDeckSelectionProvider>
  );
}
