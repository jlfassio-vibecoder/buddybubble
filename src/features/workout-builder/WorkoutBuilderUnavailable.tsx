import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { safeNextPath } from '@/lib/safe-next-path';

/** Keep reasons local — avoid importing from the App Router page folder into features. */
export type WorkoutBuilderUnavailableReason =
  | 'disabled'
  | 'unauthenticated'
  | 'not_member'
  | 'task_not_found'
  | 'not_workout'
  | 'workspace_mismatch';

const MESSAGES: Record<WorkoutBuilderUnavailableReason, string> = {
  disabled:
    'The structure builder is temporarily turned off for this environment. Ask an admin to enable it, or return to the board.',
  unauthenticated: 'You need to sign in to open the structure builder.',
  not_member: 'You are not a member of this socialspace, so this builder cannot be opened.',
  task_not_found: 'That workout card could not be found or you do not have access to it.',
  not_workout: 'Structure builder only works for workout cards.',
  workspace_mismatch: 'That workout does not belong to this socialspace.',
};

type Props = {
  workspaceId: string;
  taskId?: string;
  reason: WorkoutBuilderUnavailableReason;
  /** Optional same-origin return path from ?return= */
  returnPath?: string | null;
};

export function WorkoutBuilderUnavailable({ workspaceId, taskId, reason, returnPath }: Props) {
  const backHref = safeNextPath(returnPath) ?? `/app/${encodeURIComponent(workspaceId)}`;
  const message = MESSAGES[reason];

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold text-foreground">Structure builder unavailable</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <p className="font-mono text-xs text-muted-foreground/80">
        reason={reason}
        {taskId ? ` · task=${taskId}` : ''}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Button asChild variant="default">
          <Link href={backHref}>Back</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/app/${encodeURIComponent(workspaceId)}`}>Socialspace home</Link>
        </Button>
      </div>
    </main>
  );
}
