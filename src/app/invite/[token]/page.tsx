import Link from 'next/link';
import { createClient } from '@utils/supabase/server';
import { InviteJoinForm } from './invite-join-form';
import { InvitePreviewAuth } from './invite-preview-auth';
import { InviteThemeWrapper } from './invite-theme-wrapper';
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
  const cardShell = cn(
    'rounded-2xl border-2 border-border bg-card p-8 text-card-foreground shadow-lg backdrop-blur-[1px]',
  );

  return (
    <InviteThemeWrapper categoryType={preview.category_type}>
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
                {preview.requires_approval
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
              <div className="mt-8">
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
