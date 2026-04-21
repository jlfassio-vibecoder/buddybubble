'use client';

import { isValidElement, useMemo, type ReactNode } from 'react';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import { LocalVideoPreview } from '@/features/live-video/LocalVideoPreview';
import { RemoteVideoPreview } from '@/features/live-video/RemoteVideoPreview';
import { FloatingMediaBar } from '@/features/live-video/ui/FloatingMediaBar';
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
};

/** Single function/class child → `type.name`; fragments, arrays, strings → `'none'` (blueprint). */
function childShellDebugName(children: ReactNode | undefined): string {
  if (!isValidElement(children)) return 'none';
  const t = children.type;
  if (typeof t === 'function') {
    const n = t.name;
    return typeof n === 'string' && n.length > 0 ? n : 'none';
  }
  if (typeof t === 'object' && t !== null && 'name' in t) {
    const n = (t as { name?: string }).name;
    return typeof n === 'string' && n.length > 0 ? n : 'none';
  }
  return 'none';
}

const stagePreviewClass = 'absolute inset-0 h-full w-full min-h-0 min-w-0';
const railTileClass =
  'relative h-28 w-full shrink-0 overflow-hidden rounded-lg border border-border bg-black shadow-md';

/**
 * Theater layout: host fills the main stage; other participants stack in a right PiP rail.
 */
export function BaseVideoHarness(props: BaseVideoHarnessProps) {
  if (process.env.NODE_ENV === 'development') {
    console.log(
      '[DEBUG] BaseVideoHarness Rendered with child shell:',
      childShellDebugName(props.children),
    );
  }

  const fullWidth = Boolean(props.fullWidth);

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

  const sortedRemotes = useMemo(
    () => [...remoteUsers].sort((a, b) => Number(a.uid) - Number(b.uid)),
    [remoteUsers],
  );

  const hostRemote = useMemo(
    () => sortedRemotes.find((u) => Number(u.uid) === hostRtcUid) ?? null,
    [sortedRemotes, hostRtcUid],
  );

  const railRemotes = useMemo(() => {
    if (localIsHost) return sortedRemotes;
    return sortedRemotes.filter((u) => Number(u.uid) !== hostRtcUid);
  }, [localIsHost, sortedRemotes, hostRtcUid]);

  const railHasLocalPip = !localIsHost;
  const railCount = railRemotes.length + (railHasLocalPip ? 1 : 0);

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

  const localIdleLabel =
    joinError != null
      ? joinError
      : isConnecting
        ? 'Connecting…'
        : isConnected
          ? 'Connected (no local video)'
          : 'Idle';

  return (
    <div
      className={cn(
        fullWidth
          ? 'mx-0 flex w-full min-w-0 max-w-none flex-1 min-h-0 flex-col items-stretch gap-4 px-2 py-4 sm:gap-6 sm:px-4 sm:py-6'
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
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          <div
            className={cn(
              // Height-driven frame inside the flex-1 slot: fill height, derive
              // width from `aspect-*`, clamp with `max-w-full` + `min-w-0`.
              'relative m-auto block h-full max-h-full w-auto max-w-full min-w-0 overflow-hidden rounded-xl border border-border bg-muted shadow-sm transition-[aspect-ratio] duration-300',
              aspectClass,
            )}
            data-live-video-stage
          >
            <div className="absolute inset-0 overflow-hidden rounded-xl bg-black">
              {localIsHost ? (
                <>
                  <LocalVideoPreview
                    track={localVideoTrack}
                    isMicMuted={isMicMuted}
                    isCameraOff={isCameraOff}
                    className={stagePreviewClass}
                  />
                  {localVideoTrack == null ? (
                    <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-muted/80 text-sm text-muted-foreground">
                      {localIdleLabel}
                    </div>
                  ) : null}
                </>
              ) : hostRemote != null ? (
                <RemoteVideoPreview
                  user={hostRemote}
                  className={cn(stagePreviewClass, 'rounded-none border-0')}
                />
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

            {railCount > 0 ? (
              <div
                className="pointer-events-auto absolute top-4 right-4 z-40 flex max-h-[calc(100%-6rem)] w-48 flex-col gap-3 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-black/30 p-2 shadow-lg backdrop-blur-sm"
                aria-label="Participant thumbnails"
              >
                {railHasLocalPip ? (
                  <div className={railTileClass}>
                    <LocalVideoPreview
                      track={localVideoTrack}
                      isMicMuted={isMicMuted}
                      isCameraOff={isCameraOff}
                      className="absolute inset-0 h-full w-full min-h-0 min-w-0"
                    />
                    {localVideoTrack == null ? (
                      <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/70 text-[10px] text-muted-foreground">
                        {localIdleLabel}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {railRemotes.map((user) => (
                  <div key={user.uid} className={railTileClass}>
                    <RemoteVideoPreview
                      user={user}
                      className="absolute inset-0 h-full w-full min-h-0 min-w-0 rounded-none border-0"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {props.videoOverlays != null ? (
              <div className="pointer-events-none absolute inset-0 z-[43]">
                {props.videoOverlays}
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
