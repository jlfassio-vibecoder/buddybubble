import { redirect } from 'next/navigation';

/** Pending approvals now live on the unified People & invites page. */
export default async function WaitingRoomPage({
  params,
}: {
  params: Promise<{ workspace_id: string }>;
}) {
  const { workspace_id } = await params;
  redirect(`/app/${workspace_id}/invites?tab=pending`);
}
