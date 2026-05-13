'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Clock, ListOrdered, MapPin, Pencil, Play, Users, Video } from 'lucide-react';

import { PremiumGate } from '@/components/subscription/premium-gate';
import { Button } from '@/components/ui/button';
import { useClassEnrollment } from '@/features/classes/hooks/useClassEnrollment';
import type { ClassInstance } from '@/lib/fitness/class-providers';
import { classRecordingMemberCta } from '@/lib/class-recording-metadata';
import { useLiveVideoStore } from '@/store/liveVideoStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import {
  parseAsyncSessionFromInstanceMetadata,
  parseClassRecordingFromInstanceMetadata,
  parseLiveSessionInviteFromMessageMetadata,
} from '@/types/live-session-invite';
import type { ClassEnrollmentStatus } from '@/types/database';

// Copilot suggestion ignored: [DEBUG] console logs in this file are intentional enrollment-gate tripwires until replaced by product telemetry.

function getLocalYmd(dateInput: string | number | Date): string {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function NotEligibleNotice({ status }: { status: ClassEnrollmentStatus | null }) {
  useEffect(() => {
    console.log('[DEBUG] Join button disabled/hidden - user status is:', status);
  }, [status]);
  return (
    <div className="mt-3 flex flex-col gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 w-full gap-2 text-xs shadow-sm"
        disabled
      >
        <Video className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {status === 'waitlisted' ? 'Waitlisted - cannot join' : 'Enroll to join live'}
      </Button>
    </div>
  );
}

export type ClassCardProps = {
  classInstance: ClassInstance;
  todayYmd: string;
  canManageClasses?: boolean;
  onOpenClassEditor?: (instanceId: string) => void;
  onOpenManageRoster?: (instance: ClassInstance) => void;
  onEnrollmentChanged?: () => void;
};

export function ClassCard({
  classInstance,
  todayYmd: todayYmdProp,
  canManageClasses = false,
  onOpenClassEditor,
  onOpenManageRoster,
  onEnrollmentChanged,
}: ClassCardProps) {
  const instance = classInstance;

  useEffect(() => {
    console.log('[DEBUG] ClassCard extracted and mounted for instance:', classInstance.id);
  }, [classInstance.id]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const liveDockActive = useLiveVideoStore((s) => s.activeSession);
  const { offering } = instance;
  const enrolled = instance.my_enrollment_status === 'enrolled';
  const waitlisted = instance.my_enrollment_status === 'waitlisted';
  const isFull = instance.capacity !== null && instance.enrollment_count >= instance.capacity;
  const isPast =
    getLocalYmd(instance.scheduled_at) < todayYmdProp ||
    instance.status === 'completed' ||
    instance.status === 'cancelled';

  const liveInvite = useMemo(
    () => parseLiveSessionInviteFromMessageMetadata(instance.metadata),
    [instance.metadata],
  );
  const asyncDeckMeta = useMemo(
    () => parseAsyncSessionFromInstanceMetadata(instance.metadata),
    [instance.metadata],
  );
  const classRecordingMeta = useMemo(
    () => parseClassRecordingFromInstanceMetadata(instance.metadata),
    [instance.metadata],
  );
  const recordingCta = classRecordingMemberCta(classRecordingMeta);
  const activeLiveSession = useLiveVideoStore((s) => s.activeSession);
  const currentUserId = useUserProfileStore((s) => s.profile?.id ?? null);
  const asyncRecordingPlayBlocked =
    !currentUserId ||
    recordingCta === 'recording' ||
    recordingCta === 'uploading' ||
    recordingCta === 'editorProcessing';
  const { enroll, waitlist, unenroll, isMutating, error } = useClassEnrollment({
    classInstanceId: instance.id,
    workspaceId: instance.workspace_id,
    currentUserId,
    enrollmentId: instance.my_enrollment_id,
  });
  const inLiveSession = useMemo(() => {
    if (!activeLiveSession || !liveInvite) return false;
    return (
      activeLiveSession.sessionId === liveInvite.sessionId &&
      activeLiveSession.channelId === liveInvite.channelId &&
      activeLiveSession.workspaceId === liveInvite.workspaceId
    );
  }, [activeLiveSession, liveInvite]);

  const isClassHost = !!currentUserId && liveInvite?.hostUserId === currentUserId;
  const myEnrollmentStatus = instance.my_enrollment_status;
  const canJoinClassLive = isClassHost || myEnrollmentStatus === 'enrolled';

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="min-w-0 font-medium leading-snug text-foreground">{offering.name}</p>
        {enrolled && (
          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
            Enrolled
          </span>
        )}
        {waitlisted && (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            Waitlist
          </span>
        )}
        {instance.status === 'cancelled' && (
          <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
            Cancelled
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" aria-hidden />
          {formatTime(instance.scheduled_at)}
          {offering.duration_min ? ` · ${offering.duration_min} min` : ''}
        </span>
        {offering.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            {offering.location}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3 shrink-0" aria-hidden />
          {instance.enrollment_count}
          {instance.capacity !== null ? `/${instance.capacity}` : ''} enrolled
        </span>
      </div>

      {offering.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{offering.description}</p>
      )}

      {instance.instructor_notes && (
        <p className="mt-1.5 text-xs italic text-muted-foreground">
          &ldquo;{instance.instructor_notes}&rdquo;
        </p>
      )}

      {!isPast && canManageClasses && onOpenClassEditor ? (
        <div className="mt-3 flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 w-full gap-2 text-xs shadow-sm"
            onClick={() => onOpenClassEditor(instance.id)}
          >
            <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Edit
          </Button>
          {!liveDockActive ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 w-full gap-2 text-xs shadow-sm"
              onClick={() => {
                const q = new URLSearchParams(searchParams.toString());
                q.set('class_deck_builder', instance.id);
                router.replace(`${pathname}?${q.toString()}`, { scroll: false });
              }}
            >
              <ListOrdered className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Workout Builder
            </Button>
          ) : null}
        </div>
      ) : null}
      {!isPast && liveInvite && !liveInvite.endedAt ? (
        canJoinClassLive ? (
          <div className="mt-3 flex flex-col gap-2">
            {inLiveSession || !currentUserId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full gap-2 text-xs shadow-sm"
                disabled
              >
                <Video className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {inLiveSession
                  ? 'Joined'
                  : !currentUserId
                    ? 'Sign in to join'
                    : 'Join live session'}
              </Button>
            ) : (
              <PremiumGate feature="live_video">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-full gap-2 text-xs shadow-sm"
                  onClick={() => {
                    if (!liveInvite) return;
                    useLiveVideoStore.getState().joinSession({
                      workspaceId: liveInvite.workspaceId,
                      sessionId: liveInvite.sessionId,
                      channelId: liveInvite.channelId,
                      hostUserId: liveInvite.hostUserId,
                      mode: liveInvite.mode,
                      sourceInstanceId: instance.id,
                    });
                  }}
                >
                  <Video className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Join live session
                </Button>
              </PremiumGate>
            )}
          </div>
        ) : (
          <NotEligibleNotice status={myEnrollmentStatus} />
        )
      ) : null}

      {!isPast && asyncDeckMeta && !liveDockActive ? (
        <div className="mt-3 flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 w-full gap-2 text-xs shadow-sm"
            disabled={asyncRecordingPlayBlocked}
            onClick={() => {
              if (asyncRecordingPlayBlocked) {
                return;
              }
              const q = new URLSearchParams(searchParams.toString());
              q.set('class_async_player', instance.id);
              router.replace(`${pathname}?${q.toString()}`, { scroll: false });
            }}
          >
            <Play className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {!currentUserId
              ? 'Sign in to play'
              : recordingCta === 'recording'
                ? 'Recording in progress…'
                : recordingCta === 'uploading'
                  ? 'Recording processing…'
                  : recordingCta === 'editorProcessing'
                    ? 'Preparing recording…'
                    : recordingCta === 'failed'
                      ? 'Open workout'
                      : 'Play Workout'}
          </Button>
        </div>
      ) : null}

      {!isPast &&
        (canManageClasses ? (
          <div className="mt-3">
            <Button
              size="sm"
              className="h-7 text-xs"
              type="button"
              onClick={() => onOpenManageRoster?.(instance)}
            >
              Manage Roster
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            {enrolled ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={isMutating}
                onClick={async () => {
                  const res = await unenroll();
                  if (res.ok) onEnrollmentChanged?.();
                }}
              >
                {isMutating ? 'Updating…' : 'Cancel Enrollment'}
              </Button>
            ) : waitlisted ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={isMutating}
                onClick={async () => {
                  const res = await unenroll();
                  if (res.ok) onEnrollmentChanged?.();
                }}
              >
                {isMutating ? 'Updating…' : 'Leave Waitlist'}
              </Button>
            ) : isFull ? (
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={isMutating || !currentUserId}
                onClick={async () => {
                  console.log(
                    '[DEBUG] Client clicked Join Waitlist for instance:',
                    classInstance.id,
                  );
                  const res = await waitlist();
                  if (res.ok) onEnrollmentChanged?.();
                }}
              >
                {isMutating ? 'Joining…' : 'Join Waitlist'}
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={isMutating || !currentUserId}
                onClick={async () => {
                  const res = await enroll();
                  if (res.ok) onEnrollmentChanged?.();
                }}
              >
                {isMutating ? 'Enrolling…' : 'Enroll'}
              </Button>
            )}
            {error ? <p className="mt-1.5 text-[11px] text-destructive">{error}</p> : null}
          </div>
        ))}
    </div>
  );
}
