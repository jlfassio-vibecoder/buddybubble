import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BB_LAST_WORKSPACE_COOKIE } from '@/lib/workspace-cookies';
import { createClient } from '@utils/supabase/server';

export default async function AppHomePage() {
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

  if (cookieWorkspaceId && allowed.has(cookieWorkspaceId)) {
    redirect(`/app/${cookieWorkspaceId}`);
  }

  redirect(`/app/${members[0].workspace_id}`);
}
