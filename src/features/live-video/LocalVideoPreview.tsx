'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ILocalVideoTrack } from 'agora-rtc-sdk-ng';
import { MicOff, VideoOff, ZoomIn, ZoomOut } from 'lucide-react';
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
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

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
    if (!track || !el) return;
    track.play(el, { fit: 'cover', mirror: true });
    return () => {
      track.stop();
    };
  }, [track]);

  return (
    <div className={cn('group relative h-full w-full bg-black', className)}>
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

      <div className="absolute left-2 bottom-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/80 text-foreground shadow-sm hover:bg-background disabled:opacity-50"
          aria-label="Zoom out"
          onClick={() => {
            setZoomLevel((z) => Math.max(1, Number((z - 0.25).toFixed(2))));
          }}
          disabled={zoomLevel <= 1}
        >
          <ZoomOut className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/80 text-foreground shadow-sm hover:bg-background disabled:opacity-50"
          aria-label="Zoom in"
          onClick={() => {
            setZoomLevel((z) => Math.min(3, Number((z + 0.25).toFixed(2))));
          }}
          disabled={zoomLevel >= 3}
        >
          <ZoomIn className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="h-8 rounded-md border border-border bg-background/80 px-2 text-xs text-foreground shadow-sm hover:bg-background disabled:opacity-50"
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
