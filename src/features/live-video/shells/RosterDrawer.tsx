'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { toast } from 'sonner';

import { useAgoraSession } from '@/features/live-video/agora-session-context';
import {
  useLiveSessionRoster,
  type RosterParticipant,
} from '@/features/live-video/hooks/useLiveSessionRoster';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type RosterDrawerProps = {
  /** Supabase auth user id for this session (same as `LiveSessionView` / runtime provider). */
  localUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCountChange?: (n: number) => void;
  /**
   * When set, uses this roster instance from the parent (e.g. hoisted `useLiveSessionRoster` in
   * `LiveSessionView`) instead of subscribing inside the drawer.
   */
  managedRoster?: {
    participants: RosterParticipant[];
    sendRemoteMute: (targetUid: number) => void;
  };
};

type RosterParticipantRowProps = {
  participant: RosterParticipant;
  isLocalHost: boolean;
  localUid: number;
  onMute: (uid: number) => void;
};

function RosterParticipantRow({
  participant,
  isLocalHost,
  localUid,
  onMute,
}: RosterParticipantRowProps) {
  const isHostRow = participant.role === 'host';
  const showMute = isLocalHost && !isHostRow && participant.agoraUid !== localUid;

  const initial = (participant.displayName?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
        aria-hidden
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {participant.displayName}
        </div>
        <div className="text-xs text-muted-foreground">{isHostRow ? 'Host' : 'Participant'}</div>
      </div>
      <div
        className="flex shrink-0 items-center gap-1.5 text-muted-foreground"
        title={`${participant.hasAudio ? 'Mic on' : 'Mic off'}, ${participant.hasVideo ? 'Camera on' : 'Camera off'}`}
      >
        {participant.hasAudio ? (
          <Mic className="size-4 text-foreground" aria-hidden />
        ) : (
          <MicOff className="size-4 text-destructive" aria-hidden />
        )}
        {participant.hasVideo ? (
          <Video className="size-4 text-foreground" aria-hidden />
        ) : (
          <VideoOff className="size-4 text-destructive" aria-hidden />
        )}
      </div>
      {showMute ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={!participant.hasAudio}
          title={!participant.hasAudio ? 'Already muted' : undefined}
          onClick={() => {
            onMute(participant.agoraUid);
          }}
        >
          Mute
        </Button>
      ) : null}
    </li>
  );
}

function RosterDrawerInternalRoster({
  open,
  onOpenChange,
  onCountChange,
  localUserId,
}: Pick<RosterDrawerProps, 'open' | 'onOpenChange' | 'onCountChange'> & { localUserId: string }) {
  const { sessionId, supabase, hostUserId, workspaceId, realtimeChannel, isHost } =
    useLiveSessionRuntime();
  const { client, isMicMuted, isCameraOff, toggleMic } = useAgoraSession();

  const localUid = useMemo(() => agoraUidFromUuid(localUserId), [localUserId]);

  const localMediaState = useMemo(
    () => ({ hasAudio: !isMicMuted, hasVideo: !isCameraOff }),
    [isMicMuted, isCameraOff],
  );

  const onLocalMuteRequested = useCallback(() => {
    if (!isMicMuted) {
      toggleMic();
    }
    toast('Microphone muted', {
      description: 'The host has muted your microphone.',
    });
  }, [isMicMuted, toggleMic]);

  const { participants, sendRemoteMute } = useLiveSessionRoster({
    sessionId,
    workspaceId,
    localUserId,
    hostUserId,
    supabase,
    client,
    channel: realtimeChannel,
    localMediaState,
    onLocalMuteRequested,
  });

  useEffect(() => {
    onCountChange?.(participants.length);
  }, [participants.length, onCountChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[min(100vw-1rem,22rem)] flex-col gap-3 p-4">
        <SheetTitle>People ({participants.length})</SheetTitle>
        {participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No participants yet.</p>
        ) : (
          <ul className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1')}>
            {participants.map((p) => (
              <RosterParticipantRow
                key={p.userId}
                participant={p}
                isLocalHost={isHost}
                localUid={localUid}
                onMute={sendRemoteMute}
              />
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RosterDrawerManagedRoster({
  open,
  onOpenChange,
  onCountChange,
  localUserId,
  managedRoster,
}: Pick<RosterDrawerProps, 'open' | 'onOpenChange' | 'onCountChange' | 'managedRoster'> & {
  localUserId: string;
  managedRoster: NonNullable<RosterDrawerProps['managedRoster']>;
}) {
  const { isHost } = useLiveSessionRuntime();
  const localUid = useMemo(() => agoraUidFromUuid(localUserId), [localUserId]);
  const { participants, sendRemoteMute } = managedRoster;

  useEffect(() => {
    onCountChange?.(participants.length);
  }, [participants.length, onCountChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[min(100vw-1rem,22rem)] flex-col gap-3 p-4">
        <SheetTitle>People ({participants.length})</SheetTitle>
        {participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No participants yet.</p>
        ) : (
          <ul className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1')}>
            {participants.map((p) => (
              <RosterParticipantRow
                key={p.userId}
                participant={p}
                isLocalHost={isHost}
                localUid={localUid}
                onMute={sendRemoteMute}
              />
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RosterDrawerWithProfile({
  open,
  onOpenChange,
  onCountChange,
  localUserId,
  managedRoster,
}: RosterDrawerProps & { localUserId: string }) {
  if (managedRoster) {
    return (
      <RosterDrawerManagedRoster
        open={open}
        onOpenChange={onOpenChange}
        onCountChange={onCountChange}
        localUserId={localUserId}
        managedRoster={managedRoster}
      />
    );
  }
  return (
    <RosterDrawerInternalRoster
      open={open}
      onOpenChange={onOpenChange}
      onCountChange={onCountChange}
      localUserId={localUserId}
    />
  );
}

function RosterDrawerNoProfile({
  open,
  onOpenChange,
  onCountChange,
}: Pick<RosterDrawerProps, 'open' | 'onOpenChange' | 'onCountChange'>) {
  useEffect(() => {
    onCountChange?.(0);
  }, [onCountChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[min(100vw-1rem,22rem)] flex-col gap-3 p-4">
        <SheetTitle>People</SheetTitle>
        <p className="text-sm text-muted-foreground">Sign in required to view the roster.</p>
      </SheetContent>
    </Sheet>
  );
}

export function RosterDrawer({
  localUserId,
  open,
  onOpenChange,
  onCountChange,
  managedRoster,
}: RosterDrawerProps) {
  const trimmed = localUserId.trim();

  if (!trimmed) {
    return (
      <RosterDrawerNoProfile
        open={open}
        onOpenChange={onOpenChange}
        onCountChange={onCountChange}
      />
    );
  }

  return (
    <RosterDrawerWithProfile
      open={open}
      onOpenChange={onOpenChange}
      onCountChange={onCountChange}
      localUserId={trimmed}
      managedRoster={managedRoster}
    />
  );
}
