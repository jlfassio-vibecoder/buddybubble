'use client';

import { useMemo, useState } from 'react';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import { COACH_SLUG } from '@/lib/agents/coach/config';
import { ORGANIZER_SLUG } from '@/lib/agents/organizer/config';

type SlugChoice = '' | typeof COACH_SLUG | typeof ORGANIZER_SLUG;

/** Dev-only shell for the task-scoped chat rail. */
export function DevTaskChatRailSandbox() {
  const workspaceId = process.env.NEXT_PUBLIC_DEV_SANDBOX_WORKSPACE_ID ?? '';
  const taskId = process.env.NEXT_PUBLIC_DEV_SANDBOX_TASK_ID ?? '';
  const bubbleId = process.env.NEXT_PUBLIC_DEV_SANDBOX_BUBBLE_ID ?? '';
  const [slugChoice, setSlugChoice] = useState<SlugChoice>(COACH_SLUG);

  const defaultAgentSlug = useMemo(() => {
    if (slugChoice === '') return undefined;
    return slugChoice;
  }, [slugChoice]);

  const missing =
    !workspaceId.trim() || !taskId.trim() || !bubbleId.trim()
      ? 'Set NEXT_PUBLIC_DEV_SANDBOX_WORKSPACE_ID, NEXT_PUBLIC_DEV_SANDBOX_TASK_ID, and NEXT_PUBLIC_DEV_SANDBOX_BUBBLE_ID in .env.local (with NEXT_PUBLIC_DEV_SANDBOXES=1).'
      : null;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-lg font-semibold">Task chat rail (dev sandbox)</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Gated by <code className="rounded bg-muted px-1">NEXT_PUBLIC_DEV_SANDBOXES=1</code>. Uses
        real Supabase when env IDs are set.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">defaultAgentSlug</span>
          <select
            className="rounded border border-border bg-background px-2 py-1 text-sm"
            value={slugChoice}
            onChange={(e) => setSlugChoice(e.target.value as SlugChoice)}
          >
            <option value="">(omit / human-only)</option>
            <option value={COACH_SLUG}>{COACH_SLUG}</option>
            <option value={ORGANIZER_SLUG}>{ORGANIZER_SLUG}</option>
          </select>
        </label>
      </div>

      {missing ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          {missing}
        </p>
      ) : (
        <div className="h-[600px] min-h-0 overflow-hidden rounded-lg border border-border bg-card">
          <StandardTaskChatRail
            workspaceId={workspaceId.trim()}
            taskId={taskId.trim()}
            bubbleId={bubbleId.trim()}
            canPostMessages
            defaultAgentSlug={defaultAgentSlug}
            onCollapse={() => undefined}
          />
        </div>
      )}
    </div>
  );
}
