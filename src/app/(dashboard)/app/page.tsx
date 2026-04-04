import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { NoWorkspaces } from './no-workspaces';

export default async function AppHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: members } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name, category_type, created_at)')
    .eq('user_id', user.id);

  const first = members?.[0];
  const ws = first?.workspaces;
  if (
    ws &&
    typeof ws === 'object' &&
    !Array.isArray(ws) &&
    'id' in ws &&
    typeof (ws as { id: unknown }).id === 'string'
  ) {
    redirect(`/app/${(ws as { id: string }).id}`);
  }

  return <NoWorkspaces />;
}
