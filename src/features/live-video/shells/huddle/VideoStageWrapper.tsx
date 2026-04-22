'use client';

import { type ReactNode } from 'react';
import { BaseVideoHarness } from '@/features/live-video/BaseVideoHarness';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type VideoStageWrapperProps = {
  className?: string;
  /** Passed to `BaseVideoHarness` so WebRTC Leave can clear dashboard session state. */
  onAfterLeave?: () => void;
  localUserId: string;
  hostUserId: string;
  /** Injected above video (`pointer-events-none` shell); cards use `pointer-events-auto`. */
  videoOverlays?: ReactNode;
};

const ASPECT_RATIO_OPTIONS: ReadonlyArray<{ id: '16:9' | '9:16' | '1:1'; label: string }> = [
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
];

/**
 * Claims the flex-1 row between Header and SessionControls. Owns the local aspect
 * ratio selector so the video frame stays structurally static when the session
 * clock starts (no phase-driven height changes).
 */
export function VideoStageWrapper({
  className,
  onAfterLeave,
  localUserId,
  hostUserId,
  videoOverlays,
}: VideoStageWrapperProps) {
  const runtime = useLiveSessionRuntime();
  const aspectRatio = runtime.aspectRatio;

  if (process.env.NODE_ENV === 'development') {
    console.log(
      '[DEBUG] VideoStageWrapper render: aspectRatio=%s isHost=%s connection=%s',
      aspectRatio,
      runtime.isHost,
      runtime.connectionStatus,
    );
  }

  return (
    <div className={cn('flex min-h-0 w-full flex-col items-center overflow-hidden', className)}>
      <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center">
        <BaseVideoHarness
          fullWidth
          onAfterLeave={onAfterLeave}
          localUserId={localUserId}
          hostUserId={hostUserId}
          videoOverlays={videoOverlays}
          aspectRatio={aspectRatio}
          className="w-full flex-1 min-h-0"
        />
      </div>

      {runtime.isHost ? (
        <div
          className="flex shrink-0 items-center justify-center gap-1 pb-2"
          role="radiogroup"
          aria-label="Video aspect ratio"
        >
          {ASPECT_RATIO_OPTIONS.map((opt) => {
            const active = opt.id === aspectRatio;
            const disabled = runtime.connectionStatus !== 'connected';
            return (
              <Button
                key={opt.id}
                type="button"
                size="xs"
                variant={active ? 'secondary' : 'outline'}
                role="radio"
                aria-checked={active}
                disabled={disabled}
                className={cn(
                  'min-w-[3rem] font-mono text-xs',
                  active && 'ring-1 ring-primary ring-offset-1 ring-offset-background',
                )}
                onClick={() => {
                  if (disabled) return;
                  runtime.actions.setAspectRatio(opt.id);
                }}
              >
                {opt.label}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
