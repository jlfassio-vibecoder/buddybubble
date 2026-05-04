import { useState } from 'react';

const inputClass =
  'w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-amber-950 outline-none transition placeholder:text-amber-400/80 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25';

const primaryBtnClass =
  'inline-flex h-11 w-full items-center justify-center rounded-xl border-0 bg-amber-500 text-base font-semibold text-white shadow-lg shadow-amber-200/80 transition hover:bg-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600';

const mutedBtnClass =
  'inline-flex h-11 w-full items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100/90 text-base font-semibold text-amber-950 transition hover:bg-amber-100';

function getInviteTokenFromLocation() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('invite_token')?.trim() || null;
}

/**
 * Merge query params into the CRM login URL without throwing on a misconfigured base href.
 *
 * @param {string} baseHref
 * @param {Record<string, string>} params
 */
function buildHandoffUrl(baseHref, params) {
  try {
    const u = new URL(baseHref);
    for (const [k, v] of Object.entries(params)) {
      if (v) u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    console.error('[StorefrontHeroLogin] Invalid appLoginHref for handoff');
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    if (!qs) return baseHref;
    return `${baseHref}${baseHref.includes('?') ? '&' : '?'}${qs}`;
  }
}

/**
 * Email-first handoff to the Next.js app `/login` (no local Supabase auth).
 *
 * @param {{ appLoginHref: string }} props
 */
export default function StorefrontHeroLogin({ appLoginHref }) {
  const [email, setEmail] = useState('');

  function onContinue(e) {
    e.preventDefault();
    const invite = getInviteTokenFromLocation();
    window.location.assign(
      buildHandoffUrl(appLoginHref, {
        email: email.trim(),
        ...(invite ? { invite_token: invite } : {}),
      }),
    );
  }

  // Copilot suggestion ignored: Google OAuth runs on the Next.js /login page after this handoff; label matches the app login.
  function onGoogle() {
    const invite = getInviteTokenFromLocation();
    window.location.assign(
      invite ? buildHandoffUrl(appLoginHref, { invite_token: invite }) : appLoginHref,
    );
  }

  function onSignup() {
    const invite = getInviteTokenFromLocation();
    window.location.assign(
      buildHandoffUrl(appLoginHref, {
        signup: '1',
        ...(invite ? { invite_token: invite } : {}),
      }),
    );
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
        <button
          type="button"
          className="font-medium text-amber-900 underline decoration-amber-300 underline-offset-4 transition hover:text-amber-950 hover:decoration-amber-500"
          onClick={onSignup}
        >
          New to BuddyBubble? Create an account
        </button>
      </p>
    </div>
  );
}
