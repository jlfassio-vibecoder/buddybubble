import Link from 'next/link';
import { createClient } from '@utils/supabase/server';
import { InviteJoinForm } from './invite-join-form';
import { LeadVisitTracker } from './lead-visit-tracker';
import { InvitePreviewAuth } from './invite-preview-auth';
import { InviteQrInstantAuth } from './invite-qr-instant-auth';
import { InviteThemeWrapper } from './invite-theme-wrapper';
import { insertInviteJourneyByToken } from '@/lib/analytics/invite-journey-server';
import { invitePreviewUserMessage, parseInvitePreviewRpc } from '@/lib/invite-preview-parse';
import { cn } from '@/lib/utils';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: previewRaw, error: rpcError } = await supabase.rpc('get_invite_preview', {
    p_token: token,
  });

  if (rpcError) {
    console.error('[invite] get_invite_preview rpc failed', {
      code: rpcError.code,
      message: rpcError.message,
    });
    await insertInviteJourneyByToken(token, 'invite_preview_rpc_error', {
      rpc_code: rpcError.code ?? 'unknown',
    });
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&apos;t load this invitation right now. Try again in a moment or sign in below.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent('/onboarding')}&invite_token=${encodeURIComponent(token)}`}
            className="mt-6 inline-block text-sm font-medium text-primary underline underline-offset-4"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const parsed = parseInvitePreviewRpc(previewRaw);
  if (!parsed.valid) {
    await insertInviteJourneyByToken(token, 'invite_preview_invalid', {
      error: parsed.error,
    });
    const invalidMsg = invitePreviewUserMessage(parsed.error);
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
            <div className="text-center">
              <h1 className="text-xl font-semibold text-foreground">{invalidMsg.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{invalidMsg.body}</p>
            </div>
            <p className="mt-8 text-center text-sm text-muted-foreground">
              <Link href="/" className="underline underline-offset-4 hover:text-foreground">
                Back to home
              </Link>
            </p>
          </div>
        </div>
      </main>
    );
  }

  const preview = parsed;
  await insertInviteJourneyByToken(token, 'invite_landing_shown', {
    signed_in: Boolean(user),
    requires_approval: preview.requires_approval,
    invite_type: preview.invite_type,
    max_uses: preview.max_uses,
  });
  const trackLeads =
    preview.workspace_id.length > 0 &&
    (preview.category_type === 'business' || preview.category_type === 'fitness');
  /** Same URL for Link vs QR in the dashboard — only `invite_type` differs; both get the guest instant path. */
  const showInstantGuestInvite = preview.invite_type === 'qr' || preview.invite_type === 'link';
  const cardShell = cn(
    'rounded-2xl border-2 border-border bg-card p-8 text-card-foreground shadow-lg backdrop-blur-[1px]',
  );

  return (
    <InviteThemeWrapper categoryType={preview.category_type}>
      {trackLeads ? (
        <LeadVisitTracker workspaceId={preview.workspace_id} inviteToken={token} />
      ) : null}
      <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6">
          <div className={cardShell}>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                BuddyBubble invite
              </p>
              <h1 className="mt-3 text-2xl font-bold leading-snug text-foreground">
                <span style={{ color: 'var(--invite-accent)' }}>{preview.host_name}</span> invited
                you to join{' '}
                <span className="text-foreground">{preview.workspace_name || 'a workspace'}</span>
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {showInstantGuestInvite
                  ? preview.requires_approval
                    ? preview.invite_type === 'qr'
                      ? 'This QR invite is for in-person sharing. Continue as a guest to request access, or sign in with Google or email below.'
                      : 'This invite needs host approval. Continue as a guest to request access, or sign in with Google or email below.'
                    : preview.invite_type === 'qr'
                      ? 'Built for when you are together in person: join as a guest in one tap, or use Google or email below if you prefer.'
                      : 'Join as a guest in one tap (no email for this step), or sign in with Google or email below if you prefer.'
                  : preview.requires_approval
                    ? 'After you sign in, a host will approve your request before you can enter.'
                    : 'Sign in once to accept and open this BuddyBubble.'}
              </p>
            </div>

            {user ? (
              <div className="mt-8 space-y-4">
                <p className="text-center text-sm text-muted-foreground">
                  Signed in as{' '}
                  <span className="font-medium text-foreground">
                    {user.email ?? 'your account'}
                  </span>
                  .
                </p>
                <InviteJoinForm token={token} />
                <p className="text-center text-sm text-muted-foreground">
                  <Link href="/app" className="underline underline-offset-4 hover:text-foreground">
                    Back to app
                  </Link>
                </p>
              </div>
            ) : (
              <div className="mt-8 space-y-6">
                {showInstantGuestInvite ? (
                  <div className="space-y-3">
                    <InviteQrInstantAuth
                      token={token}
                      requiresApproval={preview.requires_approval}
                    />
                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center" aria-hidden>
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase tracking-wide">
                        <span className="bg-card px-2 text-muted-foreground">Or</span>
                      </div>
                    </div>
                  </div>
                ) : null}
                <InvitePreviewAuth token={token} />
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">
              <Link href="/" className="underline underline-offset-4 hover:text-foreground">
                Back to home
              </Link>
            </p>
          </div>
        </div>
      </main>
    </InviteThemeWrapper>
  );
}
