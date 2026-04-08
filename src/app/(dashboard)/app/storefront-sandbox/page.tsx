import { redirect } from 'next/navigation';
import { StorefrontSandboxConsole } from '@/components/storefront-sandbox/StorefrontSandboxConsole';
import { createClient } from '@utils/supabase/server';

function parseModeratorIds(): string[] {
  const raw = process.env.STOREFRONT_SANDBOX_OWNER_USER_IDS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function StorefrontSandboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/app/storefront-sandbox');
  }

  const moderators = parseModeratorIds();
  const canReply = moderators.length > 0 && moderators.includes(user.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <StorefrontSandboxConsole canReply={canReply} />
    </main>
  );
}
