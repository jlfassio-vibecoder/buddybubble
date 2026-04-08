import { useCallback, useEffect, useMemo, useState } from 'react';
import { createStorefrontBrowserClient } from '../lib/supabase-browser';
import { authCallbackAbsoluteUrl, redirectAppWithSession } from '../lib/app-auth-handoff';

const inputClass =
  'w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-amber-950 outline-none transition placeholder:text-amber-400/80 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25';

const primaryBtnClass =
  'inline-flex h-11 w-full items-center justify-center rounded-xl border-0 bg-amber-500 text-base font-semibold text-white shadow-lg shadow-amber-200/80 transition hover:bg-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:pointer-events-none disabled:opacity-60';

const outlineBtnClass =
  'inline-flex h-11 w-full items-center justify-center rounded-xl border border-amber-200 bg-white text-base font-semibold text-amber-950 transition hover:bg-amber-50 disabled:pointer-events-none disabled:opacity-60';

const mutedBtnClass =
  'inline-flex h-11 w-full items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100/90 text-base font-semibold text-amber-950 transition hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-60';

/**
 * @param {{ appOrigin: string; appLoginHref: string }} props
 */
export default function StorefrontHeroLogin({ appOrigin, appLoginHref }) {
  const supabase = useMemo(() => createStorefrontBrowserClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [info, setInfo] = useState(/** @type {string | null} */ (null));
  const [loading, setLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setInviteToken(new URLSearchParams(window.location.search).get('invite_token')?.trim() || null);
  }, []);

  const nextPath = inviteToken ? `/invite/${inviteToken}` : '/app';

  const redirectToEmail = useMemo(
    () => authCallbackAbsoluteUrl(appOrigin, nextPath, inviteToken),
    [appOrigin, nextPath, inviteToken],
  );

  const handoffAfterSession = useCallback(
    (session) => {
      redirectAppWithSession(appOrigin, nextPath, session);
    },
    [appOrigin, nextPath],
  );

  async function signInEmail(e) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message || 'Could not sign in.');
      return;
    }
    if (data.session) {
      handoffAfterSession(data.session);
    }
  }

  async function signUp() {
    if (!supabase) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectToEmail },
    });
    setLoading(false);
    if (err) {
      setError(err.message || 'Could not create account.');
      return;
    }
    if (data.session) {
      handoffAfterSession(data.session);
      return;
    }
    setInfo(
      'Account created. If email confirmation is enabled, check your inbox and spam folder, then sign in.',
    );
  }

  function goAppLogin() {
    window.location.assign(appLoginHref);
  }

  if (!supabase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-lg shadow-amber-100 sm:p-8">
        <h2 className="font-display text-xl font-medium text-amber-950">Sign in to BuddyBubble</h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-800">
          Add real{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">PUBLIC_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">PUBLIC_SUPABASE_ANON_KEY</code>{' '}
          in <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">apps/storefront/.env</code>{' '}
          to use the embedded form here, or continue on the app.
        </p>
        <button type="button" className={`${primaryBtnClass} mt-6`} onClick={goAppLogin}>
          Open sign in
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-lg shadow-amber-100 sm:p-8">
      <h2 className="font-display text-xl font-medium text-amber-950">Sign in to BuddyBubble</h2>
      <p className="mt-1 text-sm text-amber-700">
        Use your BuddyBubble account — you’ll continue in the app.
      </p>

      <form className="mt-6 space-y-4" onSubmit={signInEmail}>
        <div>
          <label
            className="mb-1.5 block text-sm font-medium text-amber-900"
            htmlFor="storefront-login-email"
          >
            Email
          </label>
          <input
            id="storefront-login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label
            className="mb-1.5 block text-sm font-medium text-amber-900"
            htmlFor="storefront-login-password"
          >
            Password
          </label>
          <input
            id="storefront-login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {info ? <p className="text-sm text-amber-800">{info}</p> : null}
        <button type="submit" className={primaryBtnClass} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-4 space-y-3">
        <button type="button" className={outlineBtnClass} onClick={signUp} disabled={loading}>
          Create account
        </button>
        <button type="button" className={mutedBtnClass} onClick={goAppLogin} disabled={loading}>
          Continue with Google
        </button>
      </div>

      <p className="mt-6 text-center text-sm">
        <a
          href="/"
          className="font-medium text-amber-800 underline decoration-amber-300 underline-offset-4 hover:text-amber-950"
        >
          Back to home
        </a>
      </p>
    </div>
  );
}
