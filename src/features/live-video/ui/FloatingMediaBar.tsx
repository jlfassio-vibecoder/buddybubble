'use client';

import type { ReactNode } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FloatingMediaBarProps = {
  isMicMuted: boolean;
  isCameraOff: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  /** Optional slot (e.g. host layout control) after camera controls */
  children?: ReactNode;
  micDisabled?: boolean;
  cameraDisabled?: boolean;
  className?: string;
};

export function FloatingMediaBar({
  isMicMuted,
  isCameraOff,
  onToggleMic,
  onToggleCamera,
  children,
  micDisabled,
  cameraDisabled,
  className,
}: FloatingMediaBarProps) {
  const showSlot = children != null;

  return (
    <div
      className={cn(
        'absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3 py-2 shadow-lg shadow-black/25 backdrop-blur-md focus-within:ring-2 focus-within:ring-white/25',
        className,
      )}
      role="toolbar"
      aria-label="Live video controls"
    >
      <button
        type="button"
        aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
        aria-pressed={isMicMuted}
        disabled={micDisabled}
        onClick={onToggleMic}
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:pointer-events-none disabled:opacity-40',
          isMicMuted ? 'bg-red-600/90 hover:bg-red-600' : 'bg-white/10 hover:bg-white/15',
        )}
      >
        {isMicMuted ? (
          <MicOff className="size-5" aria-hidden />
        ) : (
          <Mic className="size-5" aria-hidden />
        )}
      </button>

      <button
        type="button"
        aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
        aria-pressed={isCameraOff}
        disabled={cameraDisabled}
        onClick={onToggleCamera}
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:pointer-events-none disabled:opacity-40',
          isCameraOff ? 'bg-red-600/90 hover:bg-red-600' : 'bg-white/10 hover:bg-white/15',
        )}
      >
        {isCameraOff ? (
          <VideoOff className="size-5" aria-hidden />
        ) : (
          <Video className="size-5" aria-hidden />
        )}
      </button>

      {showSlot ? (
        <>
          <div className="mx-1 hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
          <div className="flex max-w-[min(100vw-8rem,14rem)] items-center gap-2 overflow-x-auto sm:max-w-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}
