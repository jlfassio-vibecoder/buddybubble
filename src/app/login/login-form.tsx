'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { getAuthAppOrigin } from '@/lib/auth-app-origin';
import { authCallbackAbsoluteUrl } from '@/lib/auth-callback-url';
import { formatLoginAuthError, formatUserFacingError } from '@/lib/format-error';
import { BB_INVITE_HANDOFF_SESSION_KEY } from '@/lib/invite-handoff-storage';
import { safeNextPath } from '@/lib/safe-next-path';
import { persistInviteHandoffToken } from '@/app/(dashboard)/onboarding/actions';
import { reportInviteJourneyClient } from '@/lib/analytics/invite-journey-client';
import { cn } from '@/lib/utils';
import { checkUserIdentityAction } from '@/app/login/actions';

/** Prefer `/onboarding` when an invite handoff is waiting (sessionStorage or query). */
function resolvePostLoginPath(next: string, inviteFromQuery?: string | null): string {
  try {
    if (sessionStorage.getItem(BB_INVITE_HANDOFF_SESSION_KEY)?.trim()) {
      return '/onboarding';
    }
  } catch {
    /* private mode / quota */
  }
  if (inviteFromQuery?.trim()) return '/onboarding';
  return next;
}

const inputClass =
  'w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-amber-950 outline-none transition placeholder:text-amber-400/80 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25';

const primaryBtnClass =
  'h-11 w-full rounded-xl border-0 bg-amber-500 text-base font-semibold text-white shadow-lg shadow-amber-200/80 hover:bg-amber-600 focus-visible:ring-amber-500/40';

const secondaryBtnClass =
  'h-11 w-full rounded-xl border border-amber-200/80 bg-amber-100/90 text-amber-950 hover:bg-amber-100';

/** Match [`src/app/login/actions.ts`](src/app/login/actions.ts) — client-side gate only. */
const EMAIL_MAX_LEN = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidLoginEmail(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t || t.length > EMAIL_MAX_LEN) return false;
  return EMAIL_PATTERN.test(t);
}

type LoginStep = 'email' | 'password' | 'check_email' | 'oauth_google';

type LoginFormProps = {
  titleFontClassName: string;
};

export function LoginForm({ titleFontClassName }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next')) ?? '/app';
  const inviteToken = searchParams.get('invite_token')?.trim() || null;
  const pkceCode = searchParams.get('code')?.trim() || null;
  const signupMode = searchParams.get('signup') === '1';
  const emailFromUrl = (searchParams.get('email') ?? '').trim();
  const emailFromUrlNormalized = emailFromUrl.toLowerCase();
  const emailFromUrlValid = isValidLoginEmail(emailFromUrl);

  const signupHref = useMemo(() => {
    const q = new URLSearchParams();
    q.set('signup', '1');
    const n = searchParams.get('next');
    if (n?.trim()) q.set('next', n.trim());
    const inv = searchParams.get('invite_token');
    if (inv?.trim()) q.set('invite_token', inv.trim());
    return `/login?${q.toString()}`;
  }, [searchParams]);

  const signinHref = useMemo(() => {
    const q = new URLSearchParams();
    const n = searchParams.get('next');
    if (n?.trim()) q.set('next', n.trim());
    const inv = searchParams.get('invite_token');
    if (inv?.trim()) q.set('invite_token', inv.trim());
    const s = q.toString();
    return s ? `/login?${s}` : '/login';
  }, [searchParams]);

  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [suppressServerAuthError, setSuppressServerAuthError] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash.includes('access_token')) return;

    setSuppressServerAuthError(true);
  }, []);

  useEffect(() => {
    if (!inviteToken?.trim()) return;
    reportInviteJourneyClient(inviteToken, 'login_with_invite_token_opened', {
      next_query: next,
    });
  }, [inviteToken, next]);

  /** `?email=` prefill + one-shot identity routing (storefront / campaigns); skip PKCE and magic-link hash flows. */
  useEffect(() => {
    if (signupMode) return;
    if (typeof window === 'undefined') return;
    if (pkceCode) return;
    if (window.location.hash.includes('access_token')) return;
    if (!emailFromUrlValid || !emailFromUrlNormalized) return;

    setEmail(emailFromUrlNormalized);

    let cancelled = false;
    setLoading(true);
    setError(null);
    void checkUserIdentityAction({
      email: emailFromUrlNormalized,
      inviteToken,
    }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.flow === 'reveal_password') {
        setEmail(res.email);
        setStep('password');
        return;
      }
      if (res.flow === 'oauth_google') {
        setEmail(emailFromUrlNormalized);
        setStep('oauth_google');
        return;
      }
      setStep('check_email');
    });

    return () => {
      cancelled = true;
    };
  }, [signupMode, pkceCode, emailFromUrlValid, emailFromUrlNormalized, inviteToken]);

  /** PKCE: `?code=` may land on `/login` depending on Supabase / redirect configuration. */
  useEffect(() => {
    if (!pkceCode) return;
    const supabase = createClient();
    let done = false;

    const stripCodeFromUrl = () => {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete('code');
        window.history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
      } catch {
        /* ignore */
      }
    };

    void supabase.auth
      .exchangeCodeForSession(pkceCode)
      .then(({ error }) => {
        if (done) return;
        if (error) {
          done = true;
          setError(formatLoginAuthError(error, 'sign-in'));
          stripCodeFromUrl();
          return;
        }
        done = true;
        const path = resolvePostLoginPath(next, inviteToken);
        window.location.assign(`${window.location.origin}${path}`);
      })
      .catch((err) => {
        if (done) return;
        done = true;
        setError(
          formatUserFacingError(err) || 'Sign-in link expired or invalid. Request a new link.',
        );
        stripCodeFromUrl();
      });
  }, [pkceCode, next, inviteToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash.includes('access_token')) return;

    const supabase = createClient();
    let finished = false;

    const finishMagicLinkSession = (
      session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>,
    ) => {
      if (finished) return;
      finished = true;
      const path = resolvePostLoginPath(next, inviteToken);
      let handoffTok = inviteToken;
      if (!handoffTok) {
        try {
          handoffTok = sessionStorage.getItem(BB_INVITE_HANDOFF_SESSION_KEY)?.trim() || null;
        } catch {
          handoffTok = null;
        }
      }
      if (handoffTok) {
        reportInviteJourneyClient(handoffTok, 'login_magic_link_session_resolved', {
          resolved_path: path,
          next_query: next,
          had_invite_in_url: Boolean(inviteToken),
        });
      }
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      window.location.assign(`${window.location.origin}${path}`);
    };

    const trySetSessionFromHash = async () => {
      try {
        const hash = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.hash;
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token')?.trim();
        const refreshToken = params.get('refresh_token')?.trim();
        if (!accessToken || !refreshToken) return;
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error && data.session) {
          finishMagicLinkSession(data.session);
        }
      } catch {
        // Fallback handlers below (getSession + auth state listener) still run.
      }
    };
    void trySetSessionFromHash();

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finishMagicLinkSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return;
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
      finishMagicLinkSession(session);
    });

    return () => subscription.unsubscribe();
  }, [next, inviteToken]);

  const redirectTo =
    typeof window !== 'undefined'
      ? authCallbackAbsoluteUrl(getAuthAppOrigin(), next, inviteToken)
      : '';

  async function onContinueEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Enter your email address.');
      return;
    }
    setLoading(true);
    const res = await checkUserIdentityAction({
      email: trimmed,
      inviteToken,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.flow === 'reveal_password') {
      setEmail(res.email);
      setStep('password');
      return;
    }
    if (res.flow === 'oauth_google') {
      setEmail(trimmed);
      setStep('oauth_google');
      return;
    }
    setStep('check_email');
  }

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (err) {
      setError(formatLoginAuthError(err, 'sign-in'));
      return;
    }
    const destination = resolvePostLoginPath(next, inviteToken);
    if (inviteToken) {
      const handoff = await persistInviteHandoffToken(inviteToken);
      if ('error' in handoff) {
        setError(handoff.error);
        return;
      }
    }
    router.push(destination);
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

  async function signUpLegacy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: redirectTo },
    });
    setLoading(false);
    if (err) {
      setError(formatLoginAuthError(err, 'sign-up'));
      return;
    }
    if (data.session) {
      const destination = resolvePostLoginPath(next, inviteToken);
      if (inviteToken) {
        const handoff = await persistInviteHandoffToken(inviteToken);
        if ('error' in handoff) {
          setError(handoff.error);
          return;
        }
      }
      router.push(destination);
      router.refresh();
      return;
    }
    setInfo(
      'Account created. If email confirmation is enabled, check your inbox and spam folder, then sign in.',
    );
  }

  const cardSubline = signupMode
    ? 'Create an account with email and password or Google.'
    : step === 'email'
      ? 'Enter your email to continue, or use Google.'
      : step === 'password'
        ? 'Enter your password for this email.'
        : step === 'oauth_google'
          ? 'This email is linked to Google sign-in.'
          : 'Next steps for your inbox.';

  if (signupMode) {
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
                Join BuddyBubble
              </h1>
              <p className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-amber-900 sm:text-xl">
                Create your member account to access workspaces, channels, and boards.
              </p>
            </div>

            <div className="w-full lg:justify-self-end">
              <div className="mx-auto w-full max-w-md rounded-2xl border border-amber-200/90 bg-white p-8 shadow-xl shadow-amber-950/[0.06] lg:mx-0 lg:max-w-none">
                <div className="mb-6 border-b border-amber-100 pb-6">
                  <h2 className="text-lg font-semibold text-amber-950">Create account</h2>
                  <p className="mt-1 text-sm text-amber-800/90">{cardSubline}</p>
                </div>

                {searchParams.get('error') &&
                  !(suppressServerAuthError && searchParams.get('error') === 'auth') && (
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

                <form onSubmit={signUpLegacy} className="space-y-4">
                  <div>
                    <label
                      htmlFor="signup-email"
                      className="mb-1.5 block text-sm font-medium text-amber-900"
                    >
                      Email
                    </label>
                    <input
                      id="signup-email"
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
                      htmlFor="signup-password"
                      className="mb-1.5 block text-sm font-medium text-amber-900"
                    >
                      Password
                    </label>
                    <input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className={inputClass}
                    />
                  </div>
                  <Button type="submit" className={primaryBtnClass} disabled={loading}>
                    {loading ? 'Creating…' : 'Create account'}
                  </Button>
                </form>

                <div className="mt-4 space-y-3">
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
                    href={signinHref}
                    className="font-medium text-amber-900 underline decoration-amber-300 underline-offset-4 transition hover:text-amber-950 hover:decoration-amber-500"
                  >
                    Sign in instead
                  </Link>
                  {' · '}
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
                <p className="mt-1 text-sm text-amber-800/90">{cardSubline}</p>
              </div>

              {searchParams.get('error') &&
                !(suppressServerAuthError && searchParams.get('error') === 'auth') && (
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

              {step === 'email' ? (
                <form onSubmit={onContinueEmail} className="space-y-4">
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
                  <Button type="submit" className={primaryBtnClass} disabled={loading}>
                    {loading ? 'Continuing…' : 'Continue'}
                  </Button>
                </form>
              ) : null}

              {step === 'password' ? (
                <form onSubmit={signInPassword} className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm text-amber-800">
                      <span className="font-medium text-amber-950">{email}</span>
                      <button
                        type="button"
                        className="ml-2 text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-950"
                        onClick={() => {
                          setStep('email');
                          setPassword('');
                          setError(null);
                        }}
                      >
                        Change
                      </button>
                    </p>
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
              ) : null}

              {step === 'check_email' ? (
                <div className="space-y-4">
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                    If an account exists for this email, we sent a secure link to verify it and set
                    a password. Check your inbox and spam folder.
                  </p>
                  <button
                    type="button"
                    className="text-sm font-medium text-amber-800 underline decoration-amber-300 underline-offset-4 hover:text-amber-950"
                    onClick={() => {
                      setStep('email');
                      setError(null);
                    }}
                  >
                    Use a different email
                  </button>
                </div>
              ) : null}

              {step === 'oauth_google' ? (
                <div className="space-y-4">
                  <p className="text-sm text-amber-900">
                    This email signs in with Google. Continue with Google below.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    className={secondaryBtnClass}
                    onClick={() => void signInGoogle()}
                    disabled={loading}
                  >
                    Continue with Google
                  </Button>
                  <button
                    type="button"
                    className="block text-sm font-medium text-amber-800 underline decoration-amber-300 underline-offset-4 hover:text-amber-950"
                    onClick={() => {
                      setStep('email');
                      setError(null);
                    }}
                  >
                    Use a different email
                  </button>
                </div>
              ) : null}

              {step === 'email' ? (
                <div className="mt-4 space-y-3">
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
              ) : null}

              {step === 'email' ? (
                <p className="mt-6 text-center text-sm text-amber-800/90">
                  <Link
                    href={signupHref}
                    className="font-medium text-amber-900 underline decoration-amber-300 underline-offset-4 transition hover:text-amber-950 hover:decoration-amber-500"
                  >
                    New to BuddyBubble? Create an account
                  </Link>
                </p>
              ) : null}

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
