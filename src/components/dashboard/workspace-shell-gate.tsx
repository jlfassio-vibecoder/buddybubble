'use client';

import { usePathname } from 'next/navigation';
import type { BubbleRow, MemberRole } from '@/types/database';
import { isActiveSessionPathname } from '@/lib/active-session/build-active-session-url';
import { DashboardShell } from './dashboard-shell';
import type { JoinRequestPreviewItem } from '@/lib/workspace-join-requests';

type Props = {
  workspaceId: string;
  initialRole: MemberRole;
  initialPendingJoinRequestCount?: number;
  initialJoinRequestPreview?: JoinRequestPreviewItem[];
  initialBubbles?: BubbleRow[];
  children: React.ReactNode;
};

/** Skips dashboard chrome (and `DashboardShellInner` hooks) on Active Session routes. */
export function WorkspaceShellGate({
  workspaceId,
  initialRole,
  initialPendingJoinRequestCount,
  initialJoinRequestPreview,
  initialBubbles,
  children,
}: Props) {
  const pathname = usePathname();

  if (isActiveSessionPathname(pathname)) {
    return <>{children}</>;
  }

  return (
    <DashboardShell
      workspaceId={workspaceId}
      initialRole={initialRole}
      initialPendingJoinRequestCount={initialPendingJoinRequestCount}
      initialJoinRequestPreview={initialJoinRequestPreview}
      initialBubbles={initialBubbles}
    >
      {children}
    </DashboardShell>
  );
}
