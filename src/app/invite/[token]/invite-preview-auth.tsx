'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@utils/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { authCallbackAbsoluteUrl } from '@/lib/auth-callback-url';
import { BB_INVITE_HANDOFF_SESSION_KEY } from '@/lib/invite-handoff-storage';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-error';

/** Post-auth: consume invite cookie on `/onboarding` (not `/app` — invitees may have no workspace yet). */
const POST_AUTH_PATH = '/onboarding';

export function InvitePreviewAuth({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = token.trim();
      if (t) sessionStorage.setItem(BB_INVITE_HANDOFF_SESSION_KEY, t);
    } catch {
      // ignore quota / private mode
    }
  }, [token]);

  async function signInGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const redirectTo = authCallbackAbsoluteUrl(origin, POST_AUTH_PATH, token);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    setLoading(false);
    if (err) setError(formatUserFacingError(err));
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      <Button
        type="button"
        className="w-full shadow-sm"
        onClick={() => void signInGoogle()}
        disabled={loading}
      >
        {loading ? 'Redirecting…' : 'Continue with Google'}
      </Button>
      <Link
        href={`/login?next=${encodeURIComponent(POST_AUTH_PATH)}&invite_token=${encodeURIComponent(token.trim())}`}
        className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
      >
        Sign in with email
      </Link>
      <p className="text-center text-[11px] text-muted-foreground">
        The invite link is saved for this browser session so sign-in can finish safely.
      </p>
    </div>
  );
}
