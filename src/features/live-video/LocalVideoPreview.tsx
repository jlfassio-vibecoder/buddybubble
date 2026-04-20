'use client';

import { useEffect, useRef } from 'react';
import type { ILocalVideoTrack } from 'agora-rtc-sdk-ng';
import { MicOff, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LocalVideoPreviewProps = {
  track: ILocalVideoTrack | null;
  className?: string;
  isMicMuted?: boolean;
  isCameraOff?: boolean;
};

/**
 * Renders local camera preview via Agora `ILocalVideoTrack.play` / `stop`.
 * Track lifecycle (`close`) is owned by `AgoraSessionProvider.leaveChannel`.
 */
export function LocalVideoPreview({
  track,
  className,
  isMicMuted = false,
  isCameraOff = false,
}: LocalVideoPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!track || !el) return;
    track.play(el, { fit: 'contain', mirror: true });
    return () => {
      track.stop();
    };
  }, [track]);

  return (
    <div className={cn('relative h-full w-full bg-black', className)}>
      <div ref={containerRef} className="absolute inset-0" />
      {isCameraOff ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-sm text-muted-foreground">
          <VideoOff className="size-8 opacity-80" aria-hidden />
          <span>Camera off</span>
        </div>
      ) : null}
      {isMicMuted ? (
        <div
          className="pointer-events-none absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm"
          aria-label="Microphone muted"
        >
          <MicOff className="size-4" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}
