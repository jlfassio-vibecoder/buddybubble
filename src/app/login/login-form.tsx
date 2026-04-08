'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { getAuthAppOrigin } from '@/lib/auth-app-origin';
import { authCallbackAbsoluteUrl } from '@/lib/auth-callback-url';
import { formatLoginAuthError } from '@/lib/format-error';
import { safeNextPath } from '@/lib/safe-next-path';
import { persistInviteHandoffToken } from '@/app/(dashboard)/onboarding/actions';
import { cn } from '@/lib/utils';

const inputClass =
  'w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-amber-950 outline-none transition placeholder:text-amber-400/80 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25';

const primaryBtnClass =
  'h-11 w-full rounded-xl border-0 bg-amber-500 text-base font-semibold text-white shadow-lg shadow-amber-200/80 hover:bg-amber-600 focus-visible:ring-amber-500/40';

const outlineBtnClass =
  'h-11 w-full rounded-xl border-amber-200 bg-white text-amber-950 hover:bg-amber-50 hover:text-amber-950';

const secondaryBtnClass =
  'h-11 w-full rounded-xl border-amber-200/80 bg-amber-100/90 text-amber-950 hover:bg-amber-100';

type LoginFormProps = {
  titleFontClassName: string;
};

export function LoginForm({ titleFontClassName }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next')) ?? '/app';
  const inviteToken = searchParams.get('invite_token')?.trim() || null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectTo =
    typeof window !== 'undefined'
      ? authCallbackAbsoluteUrl(getAuthAppOrigin(), next, inviteToken)
      : '';

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(formatLoginAuthError(err, 'sign-in'));
      return;
    }
    if (inviteToken) {
      const handoff = await persistInviteHandoffToken(inviteToken);
      if ('error' in handoff) {
        setError(handoff.error);
        return;
      }
    }
    router.push(next);
    router.refresh();
  }

  async function signInGoogle() {
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    setLoading(false);
    if (err) setError(formatLoginAuthError(err, 'sign-in'));
  }

  async function signUp() {
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });
    setLoading(false);
    if (err) {
      setError(formatLoginAuthError(err, 'sign-up'));
      return;
    }
    if (data.session) {
      if (inviteToken) {
        const handoff = await persistInviteHandoffToken(inviteToken);
        if ('error' in handoff) {
          setError(handoff.error);
          return;
        }
      }
      router.push(next);
      router.refresh();
      return;
    }
    setInfo(
      'Account created. If email confirmation is enabled, check your inbox and spam folder, then sign in.',
    );
  }

  return (
    <main className="min-h-screen bg-amber-50 text-amber-950 antialiased">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="text-left">
            <p className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
              Community Engagement Forum
            </p>
            <h1
              className={cn(
                titleFontClassName,
                'mt-6 max-w-xl text-balance text-4xl font-medium tracking-tight text-amber-950 sm:text-5xl lg:text-6xl',
              )}
            >
              Sign in to BuddyBubble
            </h1>
            <p className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-amber-900 sm:text-xl">
              Access your workspaces, channels, and boards—the same warm, local-first experience as
              our public site, now for members.
            </p>
          </div>

          <div className="w-full lg:justify-self-end">
            <div className="mx-auto w-full max-w-md rounded-2xl border border-amber-200/90 bg-white p-8 shadow-xl shadow-amber-950/[0.06] lg:mx-0 lg:max-w-none">
              <div className="mb-6 border-b border-amber-100 pb-6">
                <h2 className="text-lg font-semibold text-amber-950">Member sign-in</h2>
                <p className="mt-1 text-sm text-amber-800/90">Email and password or Google</p>
              </div>

              {searchParams.get('error') && (
                <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  Authentication failed. Try again.
                </p>
              )}

              {error && (
                <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              )}

              {info && (
                <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  {info}
                </p>
              )}

              <form onSubmit={signInEmail} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-medium text-amber-900"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-sm font-medium text-amber-900"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                <Button type="submit" className={primaryBtnClass} disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>

              <div className="mt-4 space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className={outlineBtnClass}
                  onClick={() => void signUp()}
                  disabled={loading}
                >
                  Create account
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className={secondaryBtnClass}
                  onClick={() => void signInGoogle()}
                  disabled={loading}
                >
                  Continue with Google
                </Button>
              </div>

              <p className="mt-8 text-center text-sm text-amber-800/90">
                <Link
                  href="/"
                  className="font-medium text-amber-900 underline decoration-amber-300 underline-offset-4 transition hover:text-amber-950 hover:decoration-amber-500"
                >
                  Back to home
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
