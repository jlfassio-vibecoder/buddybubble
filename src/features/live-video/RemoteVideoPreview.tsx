'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { MicOff, VideoOff, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RemoteVideoPreviewProps = {
  user: IAgoraRTCRemoteUser;
  className?: string;
};

/**
 * Plays a remote user's camera track (`play` / `stop`). Track teardown is via Agora client leave/unsubscribe.
 */
function readRemoteTrackEnabled(track: unknown): boolean {
  if (!track || typeof track !== 'object') return false;
  const enabled = (track as { enabled?: boolean }).enabled;
  return enabled !== false;
}

export function RemoteVideoPreview({ user, className }: RemoteVideoPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const { uid, videoTrack, audioTrack } = user;
  const [, setTrackTick] = useState(0);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const transformStyle = useMemo(() => {
    return {
      transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel})`,
      transformOrigin: 'center center',
      willChange: 'transform',
    } as const;
  }, [panX, panY, zoomLevel]);

  useEffect(() => {
    const el = containerRef.current;
    if (!videoTrack || !el) return;
    videoTrack.play(el, { fit: 'cover' });
    return () => {
      videoTrack.stop();
    };
  }, [uid, videoTrack]);

  useEffect(() => {
    if (!videoTrack) return;
    const onUpdated = () => setTrackTick((n) => n + 1);
    videoTrack.on('track-updated', onUpdated);
    return () => {
      videoTrack.off('track-updated', onUpdated);
    };
  }, [uid, videoTrack]);

  useEffect(() => {
    if (!audioTrack) return;
    const onUpdated = () => setTrackTick((n) => n + 1);
    audioTrack.on('track-updated', onUpdated);
    return () => {
      audioTrack.off('track-updated', onUpdated);
    };
  }, [uid, audioTrack]);

  const videoLive = readRemoteTrackEnabled(videoTrack);
  const audioLive = readRemoteTrackEnabled(audioTrack);
  const showNoVideo = videoTrack == null || !videoLive;

  return (
    <div
      className={cn(
        'group relative min-h-0 min-w-0 overflow-hidden rounded-lg border border-border bg-black',
        className,
      )}
      data-remote-uid={uid}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        onPointerDown={(e) => {
          if (zoomLevel <= 1) return;
          dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragStartRef.current) return;
          const dx = e.clientX - dragStartRef.current.x;
          const dy = e.clientY - dragStartRef.current.y;
          setPanX(dragStartRef.current.panX + dx);
          setPanY(dragStartRef.current.panY + dy);
        }}
        onPointerUp={(e) => {
          dragStartRef.current = null;
          try {
            (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }}
        onPointerCancel={() => {
          dragStartRef.current = null;
        }}
        onDoubleClick={() => {
          setZoomLevel(1);
          setPanX(0);
          setPanY(0);
        }}
      >
        <div className="absolute inset-0" style={transformStyle}>
          <div ref={containerRef} className="w-full h-full" />
        </div>
      </div>
      {showNoVideo ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 px-2 text-center text-xs text-muted-foreground">
          {videoTrack != null && !videoLive ? (
            <>
              <VideoOff className="size-7 opacity-80" aria-hidden />
              <span>Camera off</span>
            </>
          ) : (
            <span>No video</span>
          )}
        </div>
      ) : null}
      {audioTrack != null && !audioLive ? (
        <div
          className="pointer-events-none absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm"
          aria-label="Remote microphone muted"
        >
          <MicOff className="size-3.5" aria-hidden />
        </div>
      ) : null}

      <div className="absolute left-2 bottom-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/80 text-foreground shadow-sm hover:bg-background disabled:opacity-50"
          aria-label="Zoom out"
          onClick={() => {
            setZoomLevel((z) => Math.max(1, Number((z - 0.25).toFixed(2))));
          }}
          disabled={zoomLevel <= 1}
        >
          <ZoomOut className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/80 text-foreground shadow-sm hover:bg-background disabled:opacity-50"
          aria-label="Zoom in"
          onClick={() => {
            setZoomLevel((z) => Math.min(3, Number((z + 0.25).toFixed(2))));
          }}
          disabled={zoomLevel >= 3}
        >
          <ZoomIn className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="h-7 rounded-md border border-border bg-background/80 px-2 text-[11px] text-foreground shadow-sm hover:bg-background disabled:opacity-50"
          aria-label="Reset view"
          onClick={() => {
            setZoomLevel(1);
            setPanX(0);
            setPanY(0);
          }}
          disabled={zoomLevel === 1 && panX === 0 && panY === 0}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
