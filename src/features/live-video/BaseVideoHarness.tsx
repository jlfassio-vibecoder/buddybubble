'use client';

import { useMemo, type ReactNode } from 'react';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import { LocalVideoPreview } from '@/features/live-video/LocalVideoPreview';
import { RemoteVideoPreview } from '@/features/live-video/RemoteVideoPreview';
import { FloatingMediaBar } from '@/features/live-video/ui/FloatingMediaBar';
import { GamifiedParticipantRail } from '@/features/live-video/ui/GamifiedParticipantRail';
import type { LiveAspectRatioId } from '@/features/live-video/shells/shared/shared-timer-sync.types';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type BaseVideoHarnessProps = {
  children?: ReactNode;
  className?: string;
  /**
   * When true, drop max-width caps and horizontal centering so the harness fills
   * the parent (e.g. Huddle theater dock). Other call sites keep the default contained layout.
   */
  fullWidth?: boolean;
  /** Runs after `leaveChannel()` when the user clicks Leave (e.g. clear global dashboard session). */
  onAfterLeave?: () => void;
  /** Supabase auth user ids — mapped to Agora RTC UIDs for stage vs rail sorting. */
  localUserId: string;
  hostUserId: string;
  /** Host-synced global aspect ratio for the main stage frame. */
  aspectRatio?: LiveAspectRatioId;
  /** Injected into FloatingMediaBar (e.g. host layout dropdown). */
  floatingMediaExtras?: ReactNode;
  /** Absolute overlays above video tiles (e.g. AMRAP HUD); use `pointer-events-auto` on interactive nodes. */
  videoOverlays?: ReactNode;
  /** Main stage bottom strip (e.g. AMRAP lap splits for the person on stage). */
  stageBottomOverlay?: ReactNode;
  /** Local PiP rail tile only (e.g. AMRAP lap splits for the local user). */
  localRailPipOverlay?: ReactNode;
  /** Remote rail tiles: lap UI for that tile’s user only (`agoraUidStr` = `String(remoteUser.uid)`). */
  renderRemoteRailBottomOverlay?: (agoraUidStr: string) => ReactNode;
  /** When set, the tile for this Agora uid shows a placeholder instead of live video. */
  excludeUidForTiles?: string | null;
  /** Tighter padding when embedded in the live theater dock (live session UI). */
  compactChrome?: boolean;
};

/** Stage tiles: match shell background so `fit: 'contain'` letterboxing blends with the dock. */
const stagePreviewClass =
  'absolute inset-0 h-full w-full min-h-0 min-w-0 bg-background [&_.agora_video_player]:bg-background [&_video]:bg-background';

const videoHiddenPlaceholderClass =
  'absolute inset-0 z-[1] flex items-center justify-center bg-black/80 text-xs text-muted-foreground';

/**
 * Theater layout: host fills the aspect-locked main stage; participants render in a sibling rail.
 */
export function BaseVideoHarness(props: BaseVideoHarnessProps) {
  const fullWidth = Boolean(props.fullWidth);
  const compactChrome = Boolean(props.compactChrome);

  const {
    isConnected,
    isConnecting,
    joinChannel,
    leaveChannel,
    localVideoTrack,
    joinError,
    remoteUsers,
    role,
    isMicMuted,
    isCameraOff,
    toggleMic,
    toggleCamera,
  } = useAgoraSession();

  const mediaControlsEnabled =
    isConnected && role === 'publisher' && !isConnecting && localVideoTrack != null;

  const hostRtcUid = agoraUidFromUuid(props.hostUserId);
  const localRtcUid = agoraUidFromUuid(props.localUserId);
  const localIsHost = localRtcUid === hostRtcUid;

  const exclude = props.excludeUidForTiles;
  const localTileExcluded = exclude != null && String(localRtcUid) === String(exclude);

  const sortedRemotes = useMemo(
    () => [...remoteUsers].sort((a, b) => Number(a.uid) - Number(b.uid)),
    [remoteUsers],
  );

  const hostRemote = useMemo(
    () => sortedRemotes.find((u) => Number(u.uid) === hostRtcUid) ?? null,
    [sortedRemotes, hostRtcUid],
  );

  const hostRemoteTileExcluded =
    exclude != null && hostRemote != null && String(hostRemote.uid) === String(exclude);

  const aspectClass = (() => {
    switch (props.aspectRatio ?? '16:9') {
      case '9:16':
        return 'aspect-[9/16]';
      case '1:1':
        return 'aspect-square';
      case '16:9':
      default:
        return 'aspect-video';
    }
  })();

  const previewStageFit: 'contain' | 'cover' =
    (props.aspectRatio ?? '16:9') === '16:9' ? 'contain' : 'cover';

  const localIdleLabel =
    joinError != null
      ? joinError
      : isConnecting
        ? 'Connecting…'
        : isConnected
          ? 'Connected (no local video)'
          : 'Idle';

  const hideConnectedLeaveRow = fullWidth && isConnected;
  // Leave/Exit lives in SessionControls ("Exit workout") when the dock passes onAfterLeave.

  return (
    <div
      className={cn(
        fullWidth
          ? compactChrome
            ? 'mx-0 flex w-full min-w-0 max-w-none flex-1 min-h-0 flex-col items-stretch gap-2 px-0 py-0 sm:px-1 sm:py-1'
            : 'mx-0 flex w-full min-w-0 max-w-none flex-1 min-h-0 flex-col items-stretch gap-4 px-2 py-4 sm:gap-6 sm:px-4 sm:py-6'
          : 'mx-auto flex w-full max-w-4xl flex-1 min-h-0 flex-col items-center gap-6 px-4 py-6',
        props.className,
      )}
    >
      <div
        className={cn(
          'flex w-full flex-1 min-h-0 flex-col gap-3',
          fullWidth ? 'max-w-none min-w-0 items-stretch' : 'max-w-3xl items-center',
        )}
      >
        {/*
         * Isolate the stage in its own flex-1 row so `h-full` resolves against a
         * real height (sibling Leave/Join row must not compete for the same %).
         */}
        <div className="flex min-h-0 w-full flex-1 flex-row items-stretch gap-4">
          {/*
           * Row flex + items-center vertically centers children and prevents stretch,
           * so an aspect-ratio box with only max-* caps collapses to ~0 height and
           * Agora has no pixels to paint. Use stretch + justify-center so height is
           * definite and width follows aspect (w-auto), centered on the main axis.
           */}
          <div className="flex min-h-0 min-w-0 h-full flex-[1_1_0%] flex-row items-stretch justify-center">
            <div
              className={cn(
                'relative h-full max-h-full w-auto max-w-full min-h-0 overflow-hidden rounded-xl bg-transparent transition-[aspect-ratio] duration-300',
                aspectClass,
              )}
              data-live-video-stage
            >
              <div className="absolute inset-0 overflow-hidden rounded-xl bg-background [&_.agora_video_player]:bg-background [&_video]:bg-background">
                {localIsHost ? (
                  localTileExcluded ? (
                    <div className={videoHiddenPlaceholderClass}>Video hidden</div>
                  ) : (
                    <>
                      <LocalVideoPreview
                        track={localVideoTrack}
                        isMicMuted={isMicMuted}
                        isCameraOff={isCameraOff}
                        fit={previewStageFit}
                        className={stagePreviewClass}
                      />
                      {localVideoTrack == null ? (
                        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-muted/80 text-sm text-muted-foreground">
                          {localIdleLabel}
                        </div>
                      ) : null}
                    </>
                  )
                ) : hostRemote != null ? (
                  hostRemoteTileExcluded ? (
                    <div className={videoHiddenPlaceholderClass}>Video hidden</div>
                  ) : (
                    <RemoteVideoPreview
                      user={hostRemote}
                      fit={previewStageFit}
                      className={cn(stagePreviewClass, 'rounded-none border-0')}
                    />
                  )
                ) : (
                  <div className="absolute inset-0 z-[1] flex items-center justify-center bg-muted/80 text-sm text-muted-foreground">
                    {joinError != null
                      ? joinError
                      : isConnecting
                        ? 'Connecting…'
                        : 'Waiting for host video…'}
                  </div>
                )}
              </div>

              {props.videoOverlays != null ? (
                <div className="pointer-events-none absolute inset-0 z-[43]">
                  {props.videoOverlays}
                </div>
              ) : null}

              {props.stageBottomOverlay != null ? (
                <div className="pointer-events-none absolute inset-0 z-[44] flex items-end justify-end px-3 pb-20">
                  {props.stageBottomOverlay}
                </div>
              ) : null}

              <FloatingMediaBar
                isMicMuted={isMicMuted}
                isCameraOff={isCameraOff}
                onToggleMic={toggleMic}
                onToggleCamera={toggleCamera}
                micDisabled={!mediaControlsEnabled}
                cameraDisabled={!mediaControlsEnabled}
              >
                {props.floatingMediaExtras}
              </FloatingMediaBar>
            </div>
          </div>

          <GamifiedParticipantRail
            localUserId={props.localUserId}
            hostUserId={props.hostUserId}
            excludeUidForTiles={exclude}
            localRailPipOverlay={props.localRailPipOverlay}
            renderRemoteRailBottomOverlay={props.renderRemoteRailBottomOverlay}
          />
        </div>
        {!hideConnectedLeaveRow ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/*
             * Harness no longer owns the primary Join CTA — that lives in
             * `PreJoinBuilder` so the pre-join surface stays content-first.
             * Keep Join visible only when the harness is rendered disconnected
             * (e.g. legacy scaffold paths); hide it once Agora is live.
             */}
            {!isConnected && !isConnecting ? (
              <Button type="button" size="sm" variant="secondary" onClick={joinChannel}>
                Join
              </Button>
            ) : null}
            {isConnected || isConnecting ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  leaveChannel();
                  props.onAfterLeave?.();
                }}
              >
                Leave
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {props.children != null ? (
        <div
          className={cn(
            'w-full rounded-lg border border-dashed border-border/80 bg-card/40 p-4',
            fullWidth ? 'max-w-none' : 'max-w-3xl',
          )}
        >
          {props.children}
        </div>
      ) : null}
    </div>
  );
}
