'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Video } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PremiumGate } from '@/components/subscription/premium-gate';
import { Button } from '@/components/ui/button';
import { DEFAULT_CLASS_PROVIDER, type ClassInstance } from '@/lib/fitness/class-providers';
import {
  ignoreClassReminderStorageKey,
  reminded15mStorageKey,
  reminded5mStorageKey,
} from '@/lib/reminder-storage-keys';
import { useLiveVideoStore } from '@/store/liveVideoStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import { parseLiveSessionInviteFromMessageMetadata } from '@/types/live-session-invite';
import type { Json } from '@/types/database';

const POLL_MS = 60_000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

type ReminderWindow = '15m' | '5m';

type ReminderPayload = {
  instance: ClassInstance;
  window: ReminderWindow;
};

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function formatStart(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** `class_instances.metadata`: invitee-only reminders require enrolled/waitlisted. Default public. */
function isReminderInviteeOnly(metadata: Json): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const o = metadata as Record<string, unknown>;
  if (o.reminder_invitee_only === true) return true;
  if (o.class_reminder_audience === 'invitees') return true;
  return false;
}

function passesEnrollmentAudience(inst: ClassInstance): boolean {
  if (!isReminderInviteeOnly(inst.metadata)) return true;
  const s = inst.my_enrollment_status;
  return s === 'enrolled' || s === 'waitlisted';
}

function getReminderWindow(inst: ClassInstance, now: Date): ReminderWindow | null {
  if (inst.status === 'cancelled' || inst.status === 'completed') return null;
  const t = new Date(inst.scheduled_at).getTime();
  const nowMs = now.getTime();
  const durationMs = Math.max(1, inst.offering.duration_min) * 60 * 1000;
  if (nowMs >= t - FIFTEEN_MIN_MS && nowMs < t - FIVE_MIN_MS) return '15m';
  if (nowMs >= t - FIVE_MIN_MS && nowMs <= t + durationMs) return '5m';
  return null;
}

function pickReminderCandidate(
  instances: ClassInstance[],
  now: Date,
  workspaceId: string,
): ReminderPayload | null {
  type Scored = { instance: ClassInstance; window: ReminderWindow; score: number };
  const scored: Scored[] = [];

  for (const inst of instances) {
    if (!passesEnrollmentAudience(inst)) continue;
    const win = getReminderWindow(inst, now);
    if (!win) continue;

    if (readFlag(ignoreClassReminderStorageKey(workspaceId, inst.id))) continue;
    if (win === '15m' && readFlag(reminded15mStorageKey(workspaceId, inst.id))) continue;
    if (win === '5m' && readFlag(reminded5mStorageKey(workspaceId, inst.id))) continue;

    const t = new Date(inst.scheduled_at).getTime();
    const score = win === '5m' ? t - 1e15 : t;
    scored.push({ instance: inst, window: win, score });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => a.score - b.score);
  const best = scored[0];
  return { instance: best.instance, window: best.window };
}

type Props = {
  workspaceId: string;
  /** When false, polling and modal are disabled (e.g. embed or non-fitness). */
  enabled?: boolean;
};

export function LiveClassReminderModal({ workspaceId, enabled = true }: Props) {
  const [tick, setTick] = useState(0);
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ReminderPayload | null>(null);
  const payloadRef = useRef<ReminderPayload | null>(null);
  const skipRemindedOnDismissRef = useRef(false);

  const userId = useUserProfileStore((s) => s.profile?.id ?? null);
  const activeLiveSession = useLiveVideoStore((s) => s.activeSession);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const load = useCallback(async () => {
    if (!enabled || !userId) {
      setInstances([]);
      return;
    }
    try {
      const data = await DEFAULT_CLASS_PROVIDER.listInstances(workspaceId, userId);
      setInstances(data);
    } catch {
      setInstances([]);
    }
  }, [enabled, workspaceId, userId]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  const [nextCandidate, setNextCandidate] = useState<ReminderPayload | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setNextCandidate(null);
      return;
    }
    setNextCandidate(pickReminderCandidate(instances, new Date(), workspaceId));
  }, [enabled, userId, instances, workspaceId, tick]);

  useEffect(() => {
    if (!enabled || !userId) return;

    if (!nextCandidate) {
      if (open) {
        setOpen(false);
        setPayload(null);
      }
      return;
    }

    if (!open) {
      setPayload(nextCandidate);
      setOpen(true);
      return;
    }

    const current = payloadRef.current;
    if (current?.instance.id === nextCandidate.instance.id) {
      if (current.window !== nextCandidate.window) {
        setPayload(nextCandidate);
      }
      return;
    }
    setPayload(nextCandidate);
  }, [enabled, userId, nextCandidate, open]);

  const liveInvite = useMemo(
    () => (payload ? parseLiveSessionInviteFromMessageMetadata(payload.instance.metadata) : null),
    [payload],
  );

  const inLiveSession = useMemo(() => {
    if (!activeLiveSession || !liveInvite) return false;
    return (
      activeLiveSession.sessionId === liveInvite.sessionId &&
      activeLiveSession.channelId === liveInvite.channelId &&
      activeLiveSession.workspaceId === liveInvite.workspaceId
    );
  }, [activeLiveSession, liveInvite]);

  const canJoinLive = Boolean(userId && liveInvite && !liveInvite.endedAt && !inLiveSession);

  const dismissWithReminded = useCallback(() => {
    const p = payloadRef.current;
    if (!p) return;
    const key =
      p.window === '15m'
        ? reminded15mStorageKey(workspaceId, p.instance.id)
        : reminded5mStorageKey(workspaceId, p.instance.id);
    writeFlag(key, true);
  }, [workspaceId]);

  const setIgnoreForPayload = useCallback(() => {
    const p = payloadRef.current;
    if (!p) return;
    writeFlag(ignoreClassReminderStorageKey(workspaceId, p.instance.id), true);
  }, [workspaceId]);

  const handleJoin = useCallback(() => {
    const p = payloadRef.current;
    if (!p || !userId || !liveInvite || liveInvite.endedAt || inLiveSession) return;
    skipRemindedOnDismissRef.current = true;
    setIgnoreForPayload();
    useLiveVideoStore.getState().joinSession({
      workspaceId: liveInvite.workspaceId,
      sessionId: liveInvite.sessionId,
      channelId: liveInvite.channelId,
      hostUserId: liveInvite.hostUserId,
      mode: liveInvite.mode,
      sourceInstanceId: p.instance.id,
    });
    setPayload(null);
    setOpen(false);
  }, [userId, liveInvite, inLiveSession, setIgnoreForPayload]);

  const handleClose = useCallback(() => {
    skipRemindedOnDismissRef.current = true;
    dismissWithReminded();
    setPayload(null);
    setOpen(false);
  }, [dismissWithReminded]);

  const handleDoNotShowAgain = useCallback(() => {
    skipRemindedOnDismissRef.current = true;
    setIgnoreForPayload();
    setPayload(null);
    setOpen(false);
  }, [setIgnoreForPayload]);

  const onDialogOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        if (skipRemindedOnDismissRef.current) {
          skipRemindedOnDismissRef.current = false;
        } else if (payloadRef.current) {
          dismissWithReminded();
        }
        setPayload(null);
      }
      setOpen(next);
    },
    [dismissWithReminded],
  );

  if (!enabled || !userId) return null;

  const inst = payload?.instance;

  return (
    <Dialog open={open} onOpenChange={onDialogOpenChange}>
      <DialogContent className="max-w-md gap-4 sm:max-w-lg">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-xl font-bold">
            {payload?.window === '5m' ? 'Class starting soon' : 'Class reminder'}
          </DialogTitle>
          <DialogDescription className="sr-only">Class reminder details</DialogDescription>
        </DialogHeader>

        {inst ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-foreground">{inst.offering.name}</p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" aria-hidden />
              {formatStart(inst.scheduled_at)}
              {inst.offering.duration_min ? ` · ${inst.offering.duration_min} min` : ''}
            </p>
            {inst.instructor_notes ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {inst.instructor_notes}
              </p>
            ) : null}
            {!canJoinLive ? (
              <p className="text-xs text-muted-foreground">
                {inLiveSession
                  ? 'You are in this live session.'
                  : 'Live session link is not available yet. Check back closer to start time.'}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="relative z-10 flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
          {canJoinLive ? (
            <div className="relative z-0 shrink-0">
              <PremiumGate feature="live_video">
                <Button
                  type="button"
                  className="w-full gap-2 font-semibold sm:w-auto"
                  onClick={handleJoin}
                >
                  <Video className="h-4 w-4 shrink-0" aria-hidden />
                  Join live session
                </Button>
              </PremiumGate>
            </div>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="relative z-10 w-full sm:w-auto"
            onClick={handleClose}
          >
            Close
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="relative z-10 w-full text-muted-foreground hover:text-foreground sm:w-auto"
            onClick={handleDoNotShowAgain}
          >
            Do not see again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
