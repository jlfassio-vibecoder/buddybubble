'use client';

import { useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { BubbleRow, MemberRole, WorkspaceCategory } from '@/types/database';
import { isActiveSessionPathname } from '@/lib/active-session/build-active-session-url';
import { isWorkoutBuilderPathname } from '@/lib/workout-builder/build-workout-builder-url';
import { resolveEffectiveCategory, useThemeOverride } from '@/hooks/use-theme-override';
import { resolveWorkspaceCategoryForRoute } from '@/lib/theme-engine/resolve-workspace-category';
import { ThemeScope } from '@/components/theme/ThemeScope';
import { WorkspaceThemeProvider } from '@/components/theme/WorkspaceThemeProvider';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { DashboardShell } from './dashboard-shell';
import type { JoinRequestPreviewItem } from '@/lib/workspace-join-requests';

type Props = {
  workspaceId: string;
  initialRole: MemberRole;
  initialPendingJoinRequestCount?: number;
  initialJoinRequestPreview?: JoinRequestPreviewItem[];
  initialBubbles?: BubbleRow[];
  /** SSR-seeded `workspaces.category_type` for first paint / immersive routes. */
  initialCategoryType?: WorkspaceCategory | null;
  children: React.ReactNode;
};

/** Skips dashboard chrome (and `DashboardShellInner` hooks) on Active Session routes. */
export function WorkspaceShellGate({
  workspaceId,
  initialRole,
  initialPendingJoinRequestCount,
  initialJoinRequestPreview,
  initialBubbles,
  initialCategoryType = null,
  children,
}: Props) {
  const pathname = usePathname();
  const immersive = isActiveSessionPathname(pathname) || isWorkoutBuilderPathname(pathname);

  if (immersive) {
    return (
      <ImmersiveWorkspaceTheme workspaceId={workspaceId} initialCategoryType={initialCategoryType}>
        {children}
      </ImmersiveWorkspaceTheme>
    );
  }

  return (
    <DashboardShell
      workspaceId={workspaceId}
      initialRole={initialRole}
      initialPendingJoinRequestCount={initialPendingJoinRequestCount}
      initialJoinRequestPreview={initialJoinRequestPreview}
      initialBubbles={initialBubbles}
      initialCategoryType={initialCategoryType}
    >
      {children}
    </DashboardShell>
  );
}

function ImmersiveWorkspaceTheme({
  workspaceId,
  initialCategoryType,
  children,
}: {
  workspaceId: string;
  initialCategoryType: WorkspaceCategory | null;
  children: React.ReactNode;
}) {
  const userWorkspaces = useWorkspaceStore((s) => s.userWorkspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const { categoryOverride } = useThemeOverride();
  const lastKnownRef = useRef<WorkspaceCategory | null>(initialCategoryType);

  const workspaceCategory = useMemo(
    () =>
      resolveWorkspaceCategoryForRoute({
        workspaceId,
        userWorkspaces,
        activeWorkspace,
        initialCategoryType,
      }),
    [workspaceId, userWorkspaces, activeWorkspace, initialCategoryType],
  );

  if (workspaceCategory) lastKnownRef.current = workspaceCategory;
  const paintBase = workspaceCategory ?? lastKnownRef.current ?? 'business';
  const themeCategory = resolveEffectiveCategory(categoryOverride, paintBase);

  return (
    <WorkspaceThemeProvider workspaceCategory={workspaceCategory} themeCategory={themeCategory}>
      <ThemeScope category={themeCategory}>{children}</ThemeScope>
    </WorkspaceThemeProvider>
  );
}
