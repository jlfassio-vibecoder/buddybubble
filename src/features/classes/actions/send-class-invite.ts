'use server';

import { createClient } from '@utils/supabase/server';
import { getClassUrl } from '@/lib/class-links';
import { sendClassInviteEmail } from '@/lib/resend-class-invite';
import { createServiceRoleClient } from '@/lib/supabase-service-role';

type Result = { ok: true } | { ok: false; error: string };

export async function sendClassInviteEmailAction(input: {
  workspaceId: string;
  classInstanceId: string;
  targetUserId: string;
}): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const callerId = user?.id;
  if (!callerId) {
    return { ok: false, error: 'Not authenticated.' };
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', callerId)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== 'owner' && role !== 'admin') {
    return { ok: false, error: 'Not authorized.' };
  }

  const { data: enrollment } = await supabase
    .from('class_enrollments')
    .select('id')
    .eq('instance_id', input.classInstanceId)
    .eq('user_id', input.targetUserId)
    .eq('status', 'enrolled')
    .maybeSingle();
  if (!enrollment) {
    return { ok: false, error: 'Target user is not enrolled in this class.' };
  }

  let targetUser: { email?: string | null; full_name?: string | null } | null = null;
  try {
    const service = createServiceRoleClient();
    const { data, error: userErr } = await service
      .from('users')
      .select('id, email, full_name')
      .eq('id', input.targetUserId)
      .maybeSingle();
    if (userErr) {
      return { ok: false, error: 'Failed to retrieve user profile data.' };
    }
    targetUser = data as { email?: string | null; full_name?: string | null } | null;
  } catch {
    return { ok: false, error: 'Failed to retrieve user profile data.' };
  }

  const toEmail = targetUser?.email?.trim();
  if (!toEmail) {
    return { ok: false, error: 'Target user has no email on file.' };
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', input.workspaceId)
    .maybeSingle();

  const classUrl = getClassUrl(input.workspaceId, input.classInstanceId);

  try {
    const res = await sendClassInviteEmail({
      to: toEmail,
      classUrl,
      workspaceName: (workspace as { name?: string } | null)?.name ?? undefined,
      recipientName: targetUser?.full_name?.trim() || undefined,
    });
    if (res.error) {
      return { ok: false, error: 'Email could not be sent.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Email could not be sent.' };
  }
}
