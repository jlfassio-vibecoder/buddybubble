import { useEffect, useMemo, useState } from 'react';

const inputClass =
  'w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-amber-950 outline-none transition placeholder:text-amber-400/80 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25';

const primaryBtnClass =
  'inline-flex h-11 w-full items-center justify-center rounded-xl border-0 bg-amber-500 text-base font-semibold text-white shadow-lg shadow-amber-200/80 transition hover:bg-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600';

const mutedBtnClass =
  'inline-flex h-11 w-full items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100/90 text-base font-semibold text-amber-950 transition hover:bg-amber-100';

/**
 * Email-first handoff to the Next.js app `/login` (no local Supabase auth).
 *
 * @param {{ appLoginHref: string }} props
 */
export default function StorefrontHeroLogin({ appLoginHref }) {
  const [email, setEmail] = useState('');
  const [inviteToken, setInviteToken] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setInviteToken(new URLSearchParams(window.location.search).get('invite_token')?.trim() || null);
  }, []);

  const signupHref = useMemo(() => {
    const u = new URL(appLoginHref);
    u.searchParams.set('signup', '1');
    if (inviteToken) u.searchParams.set('invite_token', inviteToken);
    return u.toString();
  }, [appLoginHref, inviteToken]);

  function appendInviteIfPresent(urlString) {
    if (!inviteToken) return urlString;
    const u = new URL(urlString);
    u.searchParams.set('invite_token', inviteToken);
    return u.toString();
  }

  function onContinue(e) {
    e.preventDefault();
    const u = new URL(appLoginHref);
    u.searchParams.set('email', email.trim());
    if (inviteToken) u.searchParams.set('invite_token', inviteToken);
    window.location.assign(u.toString());
  }

  function onGoogle() {
    window.location.assign(appendInviteIfPresent(appLoginHref));
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-lg shadow-amber-100 sm:p-8">
      <h2 className="font-display text-xl font-medium text-amber-950">Member sign-in</h2>
      <p className="mt-1 text-sm text-amber-700">Enter your email to continue, or use Google.</p>

      <form className="mt-6 space-y-4" onSubmit={onContinue}>
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
        <button type="submit" className={primaryBtnClass}>
          Continue
        </button>
      </form>

      <div className="mt-4">
        <button type="button" className={mutedBtnClass} onClick={onGoogle}>
          Continue with Google
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-amber-800/90">
        <a
          href={signupHref}
          className="font-medium text-amber-900 underline decoration-amber-300 underline-offset-4 transition hover:text-amber-950 hover:decoration-amber-500"
        >
          New to BuddyBubble? Create an account
        </a>
      </p>
    </div>
  );
}
