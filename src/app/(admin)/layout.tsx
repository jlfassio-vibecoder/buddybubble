import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';

/**
 * Admin layout — guards all routes under /admin.
 * Requires `users.is_admin = true`; redirects non-admins to /app.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const db = createServiceRoleClient();
  const { data: userRow } = await db
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!(userRow as { is_admin?: boolean } | null)?.is_admin) {
    redirect('/app');
  }

  return <>{children}</>;
}
