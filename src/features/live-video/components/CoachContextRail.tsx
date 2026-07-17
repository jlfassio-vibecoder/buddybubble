'use client';

import { useCallback, useEffect, useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import {
  COLLAPSED_COLUMN_WIDTH_CLASS,
  CollapsedColumnStrip,
} from '@/components/layout/collapsed-column-strip';
import { Button } from '@/components/ui/button';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { COACH_SLUG } from '@/lib/agents/coach/config';
import { isStandardTaskChatRailEnabled } from '@/lib/feature-flags/standardTaskChatRail';
import { asyncCoachRailCollapsedStorageKey } from '@/lib/layout-collapse-keys';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import { cn } from '@/lib/utils';

export type CoachContextRailProps = {
  workspaceId?: string;
  activeSnapshot: SessionDeckSnapshot | null;
  className?: string;
  /** Real write permission for the task thread; defaults to read-only to avoid exposing a composer to non-writers. */
  canPostMessages?: boolean;
};

function cueText(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  if (Array.isArray(value)) {
    const parts = value.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
  }
  return null;
}

function CoachNotesFallback({ activeSnapshot }: { activeSnapshot: SessionDeckSnapshot | null }) {
  if (!activeSnapshot) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        Select a workout card from the queue.
      </p>
    );
  }

  const exercises = parseWorkoutExercisesFromMetadata(activeSnapshot.task.metadata);
  const rows = exercises
    .map((ex) => {
      const form = cueText(ex.form_cues);
      const tips = cueText(ex.tips);
      const injury = cueText(ex.injury_prevention_tips);
      if (!form && !tips && !injury) return null;
      return { name: ex.name, form, tips, injury };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (rows.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">No coach notes for this workout.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-3 overflow-y-auto p-3">
      {rows.map((row) => (
        <li key={row.name} className="min-w-0 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-sm font-medium text-foreground">{row.name}</p>
          {row.form ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">Form: </span>
              {row.form}
            </p>
          ) : null}
          {row.tips ? (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">Tips: </span>
              {row.tips}
            </p>
          ) : null}
          {row.injury ? (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">Injury: </span>
              {row.injury}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function coachRailStorageId(workspaceId?: string): string {
  const trimmed = workspaceId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'default';
}

function readCoachRailCollapsed(workspaceId?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      localStorage.getItem(asyncCoachRailCollapsedStorageKey(coachRailStorageId(workspaceId))) ===
      '1'
    );
  } catch {
    return false;
  }
}

/**
 * Right-rail coach context for async VOD theater: task chat when enabled, else read-only cues.
 * Collapsible so the center video can reclaim horizontal space.
 * No Agora / live huddle dependencies.
 */
export function CoachContextRail({
  workspaceId,
  activeSnapshot,
  className,
  canPostMessages = false,
}: CoachContextRailProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  /** Read persisted preference after mount (SSR-safe) and whenever the workspace changes. */
  useEffect(() => {
    setIsCollapsed(readCoachRailCollapsed(workspaceId));
  }, [workspaceId]);

  const setCollapsed = useCallback(
    (next: boolean) => {
      setIsCollapsed(next);
      try {
        localStorage.setItem(
          asyncCoachRailCollapsedStorageKey(coachRailStorageId(workspaceId)),
          next ? '1' : '0',
        );
      } catch {
        /* ignore quota / private mode */
      }
    },
    [workspaceId],
  );

  const taskId = activeSnapshot?.originTaskId?.trim() ?? '';
  const bubbleId =
    typeof activeSnapshot?.task.bubble_id === 'string' ? activeSnapshot.task.bubble_id.trim() : '';
  const ws = workspaceId?.trim() ?? '';
  const showChat =
    Boolean(taskId && ws) && isStandardTaskChatRailEnabled() && Boolean(activeSnapshot);

  if (isCollapsed) {
    return (
      <>
        {/* Mobile / stacked: short expand bar so Coach is not lost when collapsed. */}
        <aside
          className={cn(
            'flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border bg-muted/10 px-3 py-2 lg:hidden',
            className,
          )}
          aria-label="Coach context"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Coach
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-muted-foreground"
            title="Expand Coach"
            aria-label="Expand Coach panel"
            aria-expanded={false}
            onClick={() => setCollapsed(false)}
          >
            <PanelRightOpen className="size-4" strokeWidth={2} aria-hidden />
            Expand
          </Button>
        </aside>
        {/* Desktop theater: narrow right strip; video reclaim width. */}
        <aside
          className={cn(
            'hidden min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/10 lg:flex',
            COLLAPSED_COLUMN_WIDTH_CLASS,
            className,
          )}
          aria-label="Coach context"
        >
          <CollapsedColumnStrip
            title="Coach"
            expandTitle="Expand Coach"
            expandAriaLabel="Expand Coach panel"
            onExpand={() => setCollapsed(false)}
            edge="right"
            variant="card"
            verticalAlign="bottom"
          />
        </aside>
      </>
    );
  }

  return (
    <aside
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/10',
        'min-h-[220px] lg:w-[min(100%,20rem)] lg:shrink-0',
        className,
      )}
      aria-label="Coach context"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Coach
        </h3>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0 text-muted-foreground"
          title="Collapse Coach"
          aria-label="Collapse Coach panel"
          aria-expanded
          onClick={() => setCollapsed(true)}
        >
          <PanelRightClose className="size-4" strokeWidth={2} aria-hidden />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showChat ? (
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-1">
            <StandardTaskChatRail
              key={taskId}
              workspaceId={ws}
              taskId={taskId}
              bubbleId={bubbleId || undefined}
              canPostMessages={canPostMessages}
              defaultAgentSlug={COACH_SLUG}
            />
          </div>
        ) : (
          <CoachNotesFallback activeSnapshot={activeSnapshot} />
        )}
      </div>
    </aside>
  );
}
