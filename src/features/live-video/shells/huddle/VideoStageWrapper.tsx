'use client';

import { type ReactNode } from 'react';
import { BaseVideoHarness } from '@/features/live-video/BaseVideoHarness';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { useLiveTheaterLayoutPlanContext } from '@/features/live-video/theater/live-theater-layout-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type VideoStageWrapperProps = {
  className?: string;
  /** Passed to `BaseVideoHarness` so WebRTC Leave can clear dashboard session state. */
  onAfterLeave?: () => void;
  localUserId: string;
  hostUserId: string;
  /** When set, that Agora uid’s tile shows a placeholder instead of live video (wrapper-driven). */
  excludeUidForTiles?: string | null;
  /** Injected above video (`pointer-events-none` shell); cards use `pointer-events-auto`. */
  videoOverlays?: ReactNode;
  stageBottomOverlay?: ReactNode;
  localRailPipOverlay?: ReactNode;
  renderRemoteRailBottomOverlay?: (agoraUidStr: string) => ReactNode;
  /** Shown in `FloatingMediaBar` after mic/camera (e.g. roster trigger). */
  floatingMediaExtras?: ReactNode;
  /** Solo studio: omit multi-party participant rail. */
  hideParticipantRail?: boolean;
};

const ASPECT_RATIO_OPTIONS: ReadonlyArray<{ id: '16:9' | '9:16' | '1:1'; label: string }> = [
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
];

/**
 * Claims the flex-1 main stage row below the Top App Bar and Tier 1 queue. Owns the
 * local aspect ratio selector so the video frame stays structurally static when the
 * session clock starts (no phase-driven height changes).
 */
export function VideoStageWrapper({
  className,
  onAfterLeave,
  localUserId,
  hostUserId,
  excludeUidForTiles,
  videoOverlays,
  stageBottomOverlay,
  localRailPipOverlay,
  renderRemoteRailBottomOverlay,
  floatingMediaExtras,
  hideParticipantRail = false,
}: VideoStageWrapperProps) {
  const runtime = useLiveSessionRuntime();
  const { huddle } = useLiveTheaterLayoutPlanContext();
  const aspectRatio = runtime.aspectRatio;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div className="flex min-h-0 w-full flex-1 flex-col items-stretch justify-stretch">
        <BaseVideoHarness
          fullWidth
          compactChrome={huddle.compactVideoPadding}
          onAfterLeave={onAfterLeave}
          localUserId={localUserId}
          hostUserId={hostUserId}
          excludeUidForTiles={excludeUidForTiles}
          videoOverlays={videoOverlays}
          stageBottomOverlay={stageBottomOverlay}
          localRailPipOverlay={localRailPipOverlay}
          renderRemoteRailBottomOverlay={renderRemoteRailBottomOverlay}
          floatingMediaExtras={floatingMediaExtras}
          hideParticipantRail={hideParticipantRail}
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
