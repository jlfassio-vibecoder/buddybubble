'use client';

import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { COACH_SLUG } from '@/lib/agents/coach/config';
import { isStandardTaskChatRailEnabled } from '@/lib/feature-flags/standardTaskChatRail';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import { cn } from '@/lib/utils';

export type CoachContextRailProps = {
  workspaceId?: string;
  activeSnapshot: SessionDeckSnapshot | null;
  className?: string;
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

/**
 * Right-rail coach context for async VOD theater: task chat when enabled, else read-only cues.
 * No Agora / live huddle dependencies.
 */
export function CoachContextRail({
  workspaceId,
  activeSnapshot,
  className,
}: CoachContextRailProps) {
  const taskId = activeSnapshot?.originTaskId?.trim() ?? '';
  const bubbleId =
    typeof activeSnapshot?.task.bubble_id === 'string' ? activeSnapshot.task.bubble_id.trim() : '';
  const ws = workspaceId?.trim() ?? '';
  const showChat =
    Boolean(taskId && ws) && isStandardTaskChatRailEnabled() && Boolean(activeSnapshot);

  return (
    <aside
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/10',
        className,
      )}
      aria-label="Coach context"
    >
      <div className="shrink-0 border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Coach
        </h3>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showChat ? (
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-1">
            <StandardTaskChatRail
              key={taskId}
              workspaceId={ws}
              taskId={taskId}
              bubbleId={bubbleId || undefined}
              canPostMessages
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
