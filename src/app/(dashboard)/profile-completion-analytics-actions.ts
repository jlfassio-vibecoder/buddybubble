'use server';

import { createClient } from '@utils/supabase/server';
import type { ProfileCompletionInviteJourneyStep } from '@/lib/analytics/invite-journey';
import { insertInviteJourneyForWorkspaceMember } from '@/lib/analytics/invite-journey-server';

/**
 * Records invite-funnel rows for the post-cookie dashboard gate, scoped by workspace membership.
 * No-op without a workspace id or signed-in user.
 */
export async function reportProfileCompletionJourneyStepAction(input: {
  workspaceId: string | null | undefined;
  step: ProfileCompletionInviteJourneyStep;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const ws = input.workspaceId?.trim();
  if (!ws) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await insertInviteJourneyForWorkspaceMember(ws, user.id, input.step, input.detail ?? {});
}
