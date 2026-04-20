'use client';

import { isValidElement, type ReactNode } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import { LocalVideoPreview } from '@/features/live-video/LocalVideoPreview';
import { RemoteVideoPreview } from '@/features/live-video/RemoteVideoPreview';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type BaseVideoHarnessProps = {
  children?: ReactNode;
  className?: string;
  /** Runs after `leaveChannel()` when the user clicks Leave (e.g. clear global dashboard session). */
  onAfterLeave?: () => void;
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

/**
 * Horizontally centered shell: video stage + injectable interactive UI (timers, games, etc.).
 */
export function BaseVideoHarness(props: BaseVideoHarnessProps) {
  console.log(
    '[DEBUG] BaseVideoHarness Rendered with child shell:',
    childShellDebugName(props.children),
  );

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

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 py-6',
        props.className,
      )}
    >
      <div className="flex w-full max-w-3xl flex-col items-center gap-3">
        <div
          className="flex w-full flex-col gap-3 md:flex-row md:flex-wrap md:items-stretch md:justify-center"
          data-live-video-stage
        >
          <div className="relative aspect-video w-full min-w-0 shrink-0 overflow-hidden rounded-xl border border-border bg-muted shadow-sm md:max-w-md md:flex-1">
            <LocalVideoPreview
              track={localVideoTrack}
              isMicMuted={isMicMuted}
              isCameraOff={isCameraOff}
              className="absolute inset-0"
            />
            {localVideoTrack == null ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                {joinError != null
                  ? joinError
                  : isConnecting
                    ? 'Connecting…'
                    : isConnected
                      ? 'Connected (no local video)'
                      : 'Idle'}
              </div>
            ) : null}
          </div>
          {remoteUsers.map((user) => (
            <RemoteVideoPreview key={user.uid} user={user} className="md:max-w-md md:flex-1" />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={joinChannel}
            disabled={isConnecting || isConnected}
          >
            Join
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              leaveChannel();
              props.onAfterLeave?.();
            }}
            disabled={!isConnected && !isConnecting}
          >
            Leave
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={isMicMuted}
            onClick={toggleMic}
            disabled={!mediaControlsEnabled}
          >
            {isMicMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
            aria-pressed={isCameraOff}
            onClick={toggleCamera}
            disabled={!mediaControlsEnabled}
          >
            {isCameraOff ? <VideoOff className="size-4" /> : <Video className="size-4" />}
          </Button>
        </div>
      </div>

      {props.children != null ? (
        <div className="w-full max-w-3xl rounded-lg border border-dashed border-border/80 bg-card/40 p-4">
          {props.children}
        </div>
      ) : null}
    </div>
  );
}
