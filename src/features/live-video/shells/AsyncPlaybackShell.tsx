'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
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
import { CLASS_RECORDINGS_BUCKET } from '@/lib/class-recording-storage';
import { formatUserFacingError } from '@/lib/format-error';
import { cn } from '@/lib/utils';
import {
  parseClassRecordingFromInstanceMetadata,
  type ClassRecordingPayload,
} from '@/types/live-session-invite';
import { useUserProfileStore } from '@/store/userProfileStore';
import { createClient } from '@utils/supabase/client';

export type AsyncPlaybackShellProps = {
  classInstanceId: string;
  onClose: () => void;
  className?: string;
};

function AsyncPlaybackShellInner({ classInstanceId, onClose, className }: AsyncPlaybackShellProps) {
  const deckSessionId = useMemo(
    () => classDeckBuilderSessionId(classInstanceId),
    [classInstanceId],
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [localActiveDeckItemId, setLocalActiveDeckItemId] = useState<string | null>(null);
  const [recordingRec, setRecordingRec] = useState<ClassRecordingPayload | null>(null);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);
  const [recordingLoadError, setRecordingLoadError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const deckCtx = useWorkoutDeckSelection();
  /** Last successful parse of `class_recording.status` — used to keep polling after transient read errors while processing. */
  const lastRecordingStatusRef = useRef<string | null>(null);

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
        if (lastRecordingStatusRef.current !== 'processing') {
          setRecordingRec(null);
        }
        clearPoll();
        if (lastRecordingStatusRef.current === 'processing') {
          schedulePoll();
        }
        return;
      }
      setRecordingLoadError(null);
      const rec = parseClassRecordingFromInstanceMetadata(data?.metadata);
      lastRecordingStatusRef.current = rec?.status ?? null;
      setRecordingRec(rec);
      clearPoll();
      if (rec?.status === 'processing') {
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
      return;
    }
    const direct = recordingRec.playbackUrl?.trim() ?? '';
    if (direct) {
      setResolvedVideoUrl(direct);
      return;
    }
    const path = recordingRec.storagePath?.trim() ?? '';
    if (!path) {
      return;
    }
    let cancelled = false;
    void supabase.storage
      .from(CLASS_RECORDINGS_BUCKET)
      .createSignedUrl(path, 60 * 60 * 4)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setResolvedVideoUrl(null);
          setRecordingLoadError(
            error
              ? formatUserFacingError(error)
              : 'Could not create a playback link for this recording.',
          );
          return;
        }
        setRecordingLoadError(null);
        setResolvedVideoUrl(data.signedUrl);
      });
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

  const recordingProcessing = recordingRec?.status === 'processing';
  const recordingFailed = recordingRec?.status === 'failed';
  const recordingReadyToPlay =
    recordingRec?.status === 'ready' && Boolean(resolvedVideoUrl?.trim());
  /** Queue-only async, failed pipeline, or playable video — theater still offers logger + queue. */
  const canStartTheater =
    !recordingProcessing &&
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
        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onClose}>
          Close
        </Button>
      </div>

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
              {recordingProcessing && !recordingLoadError ? (
                <p className="max-w-md text-center text-sm text-muted-foreground" role="status">
                  Recording is processing — check back shortly. You can still review the workout
                  queue.
                </p>
              ) : null}
              {recordingFailed && !recordingLoadError ? (
                <p className="max-w-md text-center text-sm text-destructive" role="alert">
                  {recordingRec?.errorMessage?.trim()
                    ? recordingRec.errorMessage.trim()
                    : 'Recording failed or is unavailable.'}
                </p>
              ) : null}
              {!recordingProcessing &&
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
              {resolvedVideoUrl ? (
                <video
                  key={resolvedVideoUrl}
                  src={resolvedVideoUrl}
                  controls
                  className="aspect-video w-full rounded-lg border border-border bg-black object-contain"
                />
              ) : (
                <div
                  className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground"
                  role="status"
                >
                  Recording unavailable — playback URL is missing for this class.
                </div>
              )}
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
}: AsyncPlaybackShellProps) {
  const profileId = useUserProfileStore((s) => s.profile?.id ?? null);
  const deckSessionId = useMemo(
    () => classDeckBuilderSessionId(classInstanceId),
    [classInstanceId],
  );

  if (!profileId) {
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
    >
      <AsyncPlaybackShellInner
        classInstanceId={classInstanceId}
        onClose={onClose}
        className={className}
      />
    </WorkoutDeckSelectionProvider>
  );
}
