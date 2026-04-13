import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { insertInviteJourneyByToken } from '@/lib/analytics/invite-journey-server';
import { BB_INVITE_TOKEN_COOKIE } from '@/lib/invite-cookies';
import { isPlausibleInviteTokenForCookie } from '@/lib/invite-token';
import { createClient } from '@utils/supabase/server';
import NoWorkspaces from '../app/no-workspaces';
import { InviteHandoffRecovery } from './invite-handoff-recovery';
import { InviteOnboardingGate } from './invite-onboarding-gate';
import { InvitePendingPanel } from './invite-pending-panel';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const onboardingNext = invite === 'pending' ? '/onboarding?invite=pending' : '/onboarding';
    const cookieStore = await cookies();
    const rawInvite = cookieStore.get(BB_INVITE_TOKEN_COOKIE)?.value?.trim() ?? '';
    if (rawInvite && isPlausibleInviteTokenForCookie(rawInvite)) {
      await insertInviteJourneyByToken(rawInvite, 'onboarding_no_user_redirect_login', {
        redirect_target: '/login',
        onboarding_next: onboardingNext,
      });
    }
    redirect(`/login?next=${encodeURIComponent(onboardingNext)}`);
  }

  const { data: members, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1);

  if (!error && members && members.length > 0) {
    redirect('/app');
  }

  if (invite === 'pending') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8">
        <InvitePendingPanel />
      </main>
    );
  }

  const cookieStore = await cookies();
  const hasInviteCookie = Boolean(cookieStore.get(BB_INVITE_TOKEN_COOKIE)?.value?.trim());

  if (hasInviteCookie) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-center text-lg font-semibold">Join BuddyBubble</h1>
          <InviteOnboardingGate />
        </div>
      </main>
    );
  }

  return (
    <InviteHandoffRecovery>
      <NoWorkspaces />
    </InviteHandoffRecovery>
  );
}
