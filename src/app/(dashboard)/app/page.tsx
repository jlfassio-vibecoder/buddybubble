import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { withDefaultDashboardChatView } from '@/lib/default-dashboard-chat-view';
import { BB_LAST_WORKSPACE_COOKIE } from '@/lib/workspace-cookies';
import { createClient } from '@utils/supabase/server';

function forwardedAppSearchString(sp: Record<string, string | string[] | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item) out.append(k, item);
      }
    } else if (v) {
      out.set(k, v);
    }
  }
  return out.toString();
}

export default async function AppHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: members, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !members?.length) {
    redirect('/onboarding');
  }

  const cookieStore = await cookies();
  const cookieWorkspaceId = cookieStore.get(BB_LAST_WORKSPACE_COOKIE)?.value;
  const allowed = new Set(members.map((m) => m.workspace_id));
  const qs = forwardedAppSearchString(await searchParams);
  const toWorkspace = (workspaceId: string) =>
    withDefaultDashboardChatView(qs ? `/app/${workspaceId}?${qs}` : `/app/${workspaceId}`);

  if (cookieWorkspaceId && allowed.has(cookieWorkspaceId)) {
    redirect(toWorkspace(cookieWorkspaceId));
  }

  redirect(toWorkspace(members[0].workspace_id));
}
