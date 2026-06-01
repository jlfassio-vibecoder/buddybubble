'use client';

import type { ReactNode } from 'react';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import type { SessionActions } from '@/features/live-video/hooks/useSessionState';
import { SessionHeader } from '@/features/live-video/shells/huddle/SessionHeader';
import { SessionClockMini } from '@/features/live-video/shells/huddle/SessionClockMini';
import { SessionControlsActions } from '@/features/live-video/shells/huddle/SessionControlsActions';
import { cn } from '@/lib/utils';

export type LiveSessionTopBarProps = {
  isSelectingFromBoard: boolean;
  uiMode: 'builder' | 'live';
  titleOverride?: string;
  subtitleOverride?: string;
  state: SessionState;
  actions: SessionActions;
  disableActions?: boolean;
  onHostEndLiveSessionForAll?: () => void | Promise<void>;
  onHostStartRecording?: (opts: {
    aspectRatio: SessionState['aspectRatio'];
  }) => void | Promise<void>;
  onLeaveDock?: () => void;
  liveDbReady?: boolean;
  hostClassRecordingPipelineBusy?: boolean;
  hostAsyncWorkoutEnabled?: boolean;
  hostNavActions?: ReactNode;
  hostDeckInjector?: ReactNode;
  className?: string;
};

export function LiveSessionTopBar({
  isSelectingFromBoard,
  uiMode,
  titleOverride,
  subtitleOverride,
  state,
  actions,
  disableActions,
  onHostEndLiveSessionForAll,
  onHostStartRecording,
  onLeaveDock,
  liveDbReady,
  hostClassRecordingPipelineBusy,
  hostAsyncWorkoutEnabled,
  hostNavActions,
  hostDeckInjector,
  className,
}: LiveSessionTopBarProps) {
  return (
    <div
      className={cn(
        'grid shrink-0 grid-cols-1 gap-3 border-b border-border pb-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4',
        className,
      )}
    >
      <SessionHeader
        className="min-w-0 border-b-0 pb-0 text-left"
        isSelectingFromBoard={isSelectingFromBoard}
        uiMode={uiMode}
        titleOverride={titleOverride}
        subtitleOverride={subtitleOverride}
      />

      <SessionClockMini state={state} compact className="mx-auto min-w-0 shrink-0 sm:mx-0" />

      <SessionControlsActions
        state={state}
        actions={actions}
        disableActions={disableActions}
        onHostEndLiveSessionForAll={onHostEndLiveSessionForAll}
        onHostStartRecording={onHostStartRecording}
        onLeaveDock={onLeaveDock}
        liveDbReady={liveDbReady}
        hostClassRecordingPipelineBusy={hostClassRecordingPipelineBusy}
        hostAsyncWorkoutEnabled={hostAsyncWorkoutEnabled}
        hostNavActions={hostNavActions}
        hostDeckInjector={hostDeckInjector}
        className="sm:justify-end"
      />
    </div>
  );
}
