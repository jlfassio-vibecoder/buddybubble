'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import type { BubbleRow } from '@/types/database';
import {
  STOREFRONT_TRIAL_VIEWER_QUERY,
  STOREFRONT_TRIAL_VIEWER_WORKOUT,
} from '@/lib/storefront-trial-deeplink';
import { ALL_BUBBLES_BUBBLE_ID } from '@/lib/all-bubbles';
import type { OpenTaskOptions } from '@/components/modals/TaskModal';

// Copilot suggestion ignored: end-to-end tests for this hook (timers, router, Supabase) are not added in this pass to keep scope minimal.

const POLL_MS = 1000;
const MAX_WAIT_MS = 90_000;

function handoffSessionKey(workspaceId: string) {
  return `bb_workout_viewer_handoff_${workspaceId}`;
}

type FitnessScope = 'unknown' | 'yes' | 'no';

type Params = {
  workspaceId: string;
  /** Whether this route workspace is fitness (unknown while store hydrates). */
  fitnessScope: FitnessScope;
  layoutHydrated: boolean;
  userId: string | undefined;
  selectedBubbleId: string | null;
  bubbles: BubbleRow[];
  openTaskModal: (id: string, opts?: OpenTaskOptions) => void;
};

/**
 * Consumes `?viewer=workout` (storefront trial), strips it from the URL, then polls until
 * a workout task assigned to the current user exists on the trial bubble and opens TaskModal.
 */
export function useStorefrontTrialWorkoutAutoOpen({
  workspaceId,
  fitnessScope,
  layoutHydrated,
  userId,
  selectedBubbleId,
  bubbles,
  openTaskModal,
}: Params) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeHandoff, setActiveHandoff] = useState(false);
  const urlStripRef = useRef(false);
  const doneRef = useRef(false);
  const waitEpochRef = useRef(0);
  const findTaskInFlightRef = useRef(false);

  // Restore handoff after redirect strip (e.g. React Strict Mode remount) via sessionStorage.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(handoffSessionKey(workspaceId)) === '1') {
        setActiveHandoff(true);
        waitEpochRef.current = Date.now();
      }
    } catch {
      /* private mode */
    }
  }, [workspaceId]);

  // Strip `viewer=workout` once; remember handoff intent for this session.
  useEffect(() => {
    if (urlStripRef.current) return;
    const v = searchParams.get(STOREFRONT_TRIAL_VIEWER_QUERY);
    if (v !== STOREFRONT_TRIAL_VIEWER_WORKOUT) return;
    urlStripRef.current = true;
    const q = new URLSearchParams(searchParams.toString());
    q.delete(STOREFRONT_TRIAL_VIEWER_QUERY);
    const qs = q.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    router.replace(next, { scroll: false });
    setActiveHandoff(true);
    waitEpochRef.current = Date.now();
    try {
      sessionStorage.setItem(handoffSessionKey(workspaceId), '1');
    } catch {
      /* private mode */
    }
  }, [searchParams, pathname, router, workspaceId]);

  // If we stripped the flag but this Social Space is not fitness, do not wait or poll.
  useEffect(() => {
    if (!activeHandoff) return;
    if (fitnessScope === 'unknown') return;
    if (fitnessScope === 'no') {
      setActiveHandoff(false);
      doneRef.current = true;
      try {
        sessionStorage.removeItem(handoffSessionKey(workspaceId));
      } catch {
        /* ignore */
      }
    }
  }, [activeHandoff, fitnessScope, workspaceId]);

  // Copilot suggestion ignored: the poll still needs the latest `bubbles` to gate on the selected bubble’s `bubble_type` and to wait until the list is loaded.

  // Poll for workout task, then open modal.
  useEffect(() => {
    if (!activeHandoff || doneRef.current) return;
    if (fitnessScope !== 'yes') return;
    if (!layoutHydrated || !userId) return;
    if (!selectedBubbleId || selectedBubbleId === ALL_BUBBLES_BUBBLE_ID) return;

    if (!bubbles.length) return;
    const bubble = bubbles.find((b) => b.id === selectedBubbleId);
    if (bubble && bubble.bubble_type !== 'trial') {
      if (!doneRef.current) {
        doneRef.current = true;
        setActiveHandoff(false);
        try {
          sessionStorage.removeItem(handoffSessionKey(workspaceId));
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const supabase = createClient();
    let cancelled = false;
    const started = waitEpochRef.current;

    const findTaskId = async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, task_assignees!inner(user_id)')
        .eq('bubble_id', selectedBubbleId)
        .eq('item_type', 'workout')
        .is('archived_at', null)
        .eq('task_assignees.user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || cancelled) {
        return null;
      }
      if (!data || typeof data.id !== 'string' || !data.id) return null;
      return data.id;
    };

    const tick = async () => {
      if (cancelled || doneRef.current) return;
      if (findTaskInFlightRef.current) return;
      if (Date.now() - started > MAX_WAIT_MS) {
        doneRef.current = true;
        setActiveHandoff(false);
        try {
          sessionStorage.removeItem(handoffSessionKey(workspaceId));
        } catch {
          /* ignore */
        }
        toast.error(
          'We couldn’t open your trial workout. Open the card on the board when it appears.',
        );
        return;
      }
      findTaskInFlightRef.current = true;
      let taskId: string | null = null;
      try {
        taskId = await findTaskId();
      } finally {
        findTaskInFlightRef.current = false;
      }
      if (cancelled || doneRef.current) return;
      if (!taskId) return;
      doneRef.current = true;
      setActiveHandoff(false);
      try {
        sessionStorage.removeItem(handoffSessionKey(workspaceId));
      } catch {
        /* ignore */
      }
      openTaskModal(taskId, { openWorkoutViewer: true });
    };

    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    activeHandoff,
    fitnessScope,
    layoutHydrated,
    userId,
    selectedBubbleId,
    bubbles,
    openTaskModal,
    workspaceId,
  ]);
}
