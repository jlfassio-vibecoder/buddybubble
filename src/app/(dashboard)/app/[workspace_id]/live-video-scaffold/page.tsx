import { LiveVideoScaffoldClient } from '@/app/(dashboard)/app/[workspace_id]/live-video-scaffold/LiveVideoScaffoldClient';

/**
 * Local scaffold route: content renders inside `DashboardShell` → `ThemeScope` as `{children}`.
 * Navigate: `/app/<workspace_id>/live-video-scaffold`
 */
export default async function LiveVideoScaffoldPage({
  params,
}: {
  params: Promise<{ workspace_id: string }>;
}) {
  const { workspace_id } = await params;

  return <LiveVideoScaffoldClient workspaceId={workspace_id} />;
}
