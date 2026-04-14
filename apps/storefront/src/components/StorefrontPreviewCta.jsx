import { Turnstile } from '@marsidev/react-turnstile';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** useLayoutEffect is a no-op on the server; avoids reading sessionStorage during the initial state initializer (hydration mismatch). */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const STORAGE_VERSION = 1;
const MAX_PROFILE_JSON_BYTES = 95_000;

/** @param {string} slug */
function storageKey(slug) {
  return `buddybubble_storefront_trial_v1:${slug.toLowerCase()}`;
}

function utmParamsFromWindowSearch() {
  if (typeof window === 'undefined') return {};
  const sp = new URLSearchParams(window.location.search);
  const keys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'msclkid',
  ];
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of keys) {
    const v = sp.get(k);
    if (v) out[k] = v;
  }
  return out;
}

function storefrontSourceFromWindowSearch() {
  if (typeof window === 'undefined') return 'storefront_organic';
  const sp = new URLSearchParams(window.location.search);
  const medium = (sp.get('utm_medium') || '').toLowerCase();
  if (['cpc', 'ppc', 'paid', 'paidsearch', 'display'].includes(medium)) {
    return 'storefront_paid';
  }
  if (sp.get('gclid') || sp.get('fbclid') || sp.get('msclkid')) {
    return 'storefront_paid';
  }
  return 'storefront_organic';
}

/**
 * @typedef {{ id: string, title: string, fieldKey: string, type: 'single' | 'multi', options: { value: string; label: string }[] }} ProfileStepDef
 */

/** @type {ProfileStepDef[]} */
const FITNESS_PROFILE_STEPS = [
  {
    id: 'goal',
    title: 'What is your primary goal?',
    fieldKey: 'primary_goal',
    type: 'single',
    options: [
      { value: 'Lose weight', label: 'Lose weight' },
      { value: 'Build muscle', label: 'Build muscle' },
      { value: 'General fitness', label: 'General fitness' },
      { value: 'Sports performance', label: 'Sports performance' },
    ],
  },
  {
    id: 'experience',
    title: 'What is your experience level?',
    fieldKey: 'experience_level',
    type: 'single',
    options: [
      { value: 'beginner', label: 'Beginner' },
      { value: 'intermediate', label: 'Intermediate' },
      { value: 'advanced', label: 'Advanced' },
    ],
  },
  {
    id: 'equipment',
    title: 'What equipment do you have access to?',
    fieldKey: 'equipment',
    type: 'multi',
    options: [
      { value: 'Bodyweight', label: 'Bodyweight' },
      { value: 'Dumbbells', label: 'Dumbbells' },
      { value: 'Barbells', label: 'Barbells' },
      { value: 'Full gym', label: 'Full gym' },
      { value: 'Cardio machines', label: 'Cardio machines' },
    ],
  },
  {
    id: 'units',
    title: 'Preferred units?',
    fieldKey: 'unit_system',
    type: 'single',
    options: [
      { value: 'metric', label: 'Metric (kg, cm)' },
      { value: 'imperial', label: 'Imperial (lb, in)' },
    ],
  },
];

/** @type {ProfileStepDef[]} */
const BUSINESS_PROFILE_STEPS = [
  {
    id: 'goal',
    title: 'What is your main goal right now?',
    fieldKey: 'primary_goal',
    type: 'single',
    options: [
      { value: 'Grow revenue', label: 'Grow revenue' },
      { value: 'Streamline operations', label: 'Streamline operations' },
      { value: 'Improve client experience', label: 'Improve client experience' },
      { value: 'Explore the platform', label: 'Explore the platform' },
    ],
  },
  {
    id: 'size',
    title: 'How large is your team?',
    fieldKey: 'company_size',
    type: 'single',
    options: [
      { value: 'Solo', label: 'Just me' },
      { value: '2-10', label: '2–10 people' },
      { value: '11-50', label: '11–50 people' },
      { value: '50+', label: '50+ people' },
    ],
  },
  {
    id: 'focus',
    title: 'Which area do you want to focus on first?',
    fieldKey: 'focus_area',
    type: 'single',
    options: [
      { value: 'Operations', label: 'Operations' },
      { value: 'Sales', label: 'Sales' },
      { value: 'Marketing', label: 'Marketing' },
      { value: 'Other', label: 'Other' },
    ],
  },
  {
    id: 'timeline',
    title: 'When are you looking to get started?',
    fieldKey: 'timeline',
    type: 'single',
    options: [
      { value: 'This month', label: 'This month' },
      { value: 'Next quarter', label: 'Next quarter' },
      { value: 'Just exploring', label: 'Just exploring' },
    ],
  },
];

/**
 * @param {string} publicSlug
 * @param {string | null | undefined} workspaceCategory
 */
function readInitialWizard(publicSlug, workspaceCategory) {
  const slug = (publicSlug || '').trim().toLowerCase();
  const cat = workspaceCategory === 'fitness' ? 'fitness' : 'business';
  const stepList = cat === 'fitness' ? FITNESS_PROFILE_STEPS : BUSINESS_PROFILE_STEPS;
  const empty = {
    phase: /** @type {'idle' | 'profile' | 'email'} */ ('idle'),
    profileStep: 0,
    profileDraft: /** @type {Record<string, unknown>} */ ({}),
    email: '',
  };
  if (!slug) return empty;
  try {
    const raw = sessionStorage.getItem(storageKey(slug));
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== STORAGE_VERSION || parsed?.storedSlug !== slug) return empty;
    const phase =
      parsed.phase === 'profile' || parsed.phase === 'email' || parsed.phase === 'idle'
        ? parsed.phase
        : 'idle';
    let profileStep = typeof parsed.profileStep === 'number' ? parsed.profileStep : 0;
    profileStep = Math.max(0, Math.min(profileStep, stepList.length - 1));
    const profileDraft =
      parsed.profileDraft &&
      typeof parsed.profileDraft === 'object' &&
      !Array.isArray(parsed.profileDraft)
        ? parsed.profileDraft
        : {};
    const email = typeof parsed.emailDraft === 'string' ? parsed.emailDraft : '';
    return { phase, profileStep, profileDraft, email };
  } catch {
    return empty;
  }
}

const inputClass =
  'w-full rounded-xl border border-white/30 bg-white/10 px-3 py-2.5 text-sm text-white shadow-inner outline-none ring-white/20 placeholder:text-white/50 focus:border-white/50 focus:ring-2';

const ghostBtnClass =
  'rounded-xl border border-white/30 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10';

const choiceBtnClass = (active) =>
  [
    'rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition',
    active
      ? 'border-white bg-white/20 text-white'
      : 'border-white/25 bg-white/5 text-white/90 hover:bg-white/10',
  ].join(' ');

/**
 * @param {{ publicSlug: string; accent: string; workspaceCategory?: string | null; turnstileSiteKey?: string }} props
 */
export default function StorefrontPreviewCta({
  publicSlug,
  accent,
  workspaceCategory = null,
  turnstileSiteKey = '',
}) {
  const slug = useMemo(() => (publicSlug || '').trim().toLowerCase(), [publicSlug]);
  const category = workspaceCategory === 'fitness' ? 'fitness' : 'business';

  const steps = useMemo(
    () => (category === 'fitness' ? FITNESS_PROFILE_STEPS : BUSINESS_PROFILE_STEPS),
    [category],
  );

  /** Must match SSR — never read sessionStorage in the initializer or hydration will mismatch. */
  const [snap, setSnap] = useState(() => ({
    phase: /** @type {'idle' | 'profile' | 'email'} */ ('idle'),
    profileStep: 0,
    profileDraft: /** @type {Record<string, unknown>} */ ({}),
    email: '',
  }));
  const { phase, profileStep, profileDraft, email } = snap;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [turnstileToken, setTurnstileToken] = useState(/** @type {string | null} */ (null));
  /** Cloudflare widget error code + hint; button stays disabled until onSuccess clears this + sets token. */
  const [turnstileWidgetError, setTurnstileWidgetError] = useState(
    /** @type {string | null} */ (null),
  );

  useIsoLayoutEffect(() => {
    setSnap(readInitialWizard(publicSlug, workspaceCategory));
  }, [publicSlug, workspaceCategory]);

  /** Skip the first run so we do not overwrite sessionStorage with idle before restore runs. */
  const persistBootRef = useRef(true);

  /** Persist draft on every meaningful change */
  useEffect(() => {
    if (typeof window === 'undefined' || !slug) return;
    if (persistBootRef.current) {
      persistBootRef.current = false;
      return;
    }
    try {
      sessionStorage.setItem(
        storageKey(slug),
        JSON.stringify({
          version: STORAGE_VERSION,
          storedSlug: slug,
          phase: snap.phase,
          profileStep: snap.profileStep,
          profileDraft: snap.profileDraft,
          emailDraft: snap.email,
        }),
      );
    } catch {
      /* private mode etc. */
    }
  }, [slug, snap]);

  const clearStorage = useCallback(() => {
    if (typeof window === 'undefined' || !slug) return;
    try {
      sessionStorage.removeItem(storageKey(slug));
    } catch {
      /* ignore */
    }
  }, [slug]);

  const startWizard = useCallback(() => {
    setError(null);
    setTurnstileToken(null);
    setTurnstileWidgetError(null);
    setSnap((prev) => ({ ...prev, phase: 'profile', profileStep: 0 }));
  }, []);

  const closeToIdle = useCallback(() => {
    setError(null);
    setSnap((prev) => ({ ...prev, phase: 'idle' }));
  }, []);

  const currentStepDef = steps[profileStep] ?? null;

  const setFieldValue = useCallback((fieldKey, value) => {
    setSnap((prev) => ({
      ...prev,
      profileDraft: { ...prev.profileDraft, [fieldKey]: value },
    }));
  }, []);

  const toggleMultiValue = useCallback((fieldKey, value) => {
    setSnap((prev) => {
      const p = prev.profileDraft;
      const raw = p[fieldKey];
      const arr = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
      const has = arr.includes(value);
      const next = has ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, profileDraft: { ...p, [fieldKey]: next } };
    });
  }, []);

  const canAdvanceProfile = useMemo(() => {
    if (!currentStepDef) return false;
    const v = profileDraft[currentStepDef.fieldKey];
    if (currentStepDef.type === 'multi') {
      return Array.isArray(v) && v.length > 0;
    }
    return typeof v === 'string' && v.trim().length > 0;
  }, [currentStepDef, profileDraft]);

  const goNextProfile = useCallback(() => {
    if (!canAdvanceProfile) return;
    setSnap((prev) => {
      if (prev.profileStep >= steps.length - 1) {
        setTurnstileToken(null);
        setTurnstileWidgetError(null);
        return { ...prev, phase: 'email' };
      }
      return { ...prev, profileStep: prev.profileStep + 1 };
    });
  }, [canAdvanceProfile, steps.length]);

  const goBackProfile = useCallback(() => {
    setSnap((prev) => {
      if (prev.profileStep <= 0) {
        return { ...prev, phase: 'idle' };
      }
      return { ...prev, profileStep: prev.profileStep - 1 };
    });
  }, []);

  const goBackFromEmail = useCallback(() => {
    setSnap((prev) => ({
      ...prev,
      phase: 'profile',
      profileStep: Math.max(0, steps.length - 1),
    }));
  }, [steps.length]);

  const onEmailSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError(null);
      const trimmed = email.trim();
      if (!trimmed.includes('@')) {
        setError('Please enter a valid email.');
        return;
      }
      const profilePayload = { ...profileDraft };
      try {
        const encoded = new TextEncoder().encode(JSON.stringify(profilePayload)).length;
        if (encoded > MAX_PROFILE_JSON_BYTES) {
          setError('Profile data is too large. Please clear storage and try again.');
          return;
        }
      } catch {
        setError('Could not validate profile. Please try again.');
        return;
      }

      if (!slug) {
        setError('Missing workspace.');
        return;
      }

      const siteKey = typeof turnstileSiteKey === 'string' ? turnstileSiteKey.trim() : '';
      if (siteKey && !turnstileToken) {
        setError('Please complete the security check.');
        return;
      }

      setBusy(true);
      try {
        const res = await fetch('/api/storefront-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicSlug: slug,
            email: trimmed,
            source: storefrontSourceFromWindowSearch(),
            utmParams: utmParamsFromWindowSearch(),
            profile: profilePayload,
            ...(turnstileToken ? { turnstileToken } : {}),
          }),
        });
        const data = /** @type {{ error?: string; next?: string }} */ (
          await res.json().catch(() => ({}))
        );
        if (!res.ok) {
          const raw = typeof data.error === 'string' ? data.error : '';
          if (res.status === 503 && /temporarily unavailable/i.test(raw)) {
            setError(
              'Signup is unavailable: the app server needs TURNSTILE_SECRET_KEY (Cloudflare Turnstile secret) on the CRM Vercel project — then redeploy.',
            );
            return;
          }
          if (res.status === 400 && raw === 'turnstileToken is required') {
            setError(
              'Complete the security check above, or ask your admin to set PUBLIC_TURNSTILE_SITE_KEY on the storefront Vercel project and redeploy.',
            );
            return;
          }
          if (res.status === 403 && /verify client/i.test(raw)) {
            setError('Could not verify your connection. Try again in a moment.');
            return;
          }
          setError(raw || 'Could not start preview.');
          return;
        }
        if (typeof data.next === 'string' && data.next.length > 0) {
          clearStorage();
          window.location.assign(data.next);
          return;
        }
        setError('Unexpected response. Please try again.');
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [clearStorage, email, profileDraft, slug, turnstileSiteKey, turnstileToken],
  );

  if (phase === 'idle') {
    return (
      <div className="flex w-full max-w-xl flex-col items-stretch gap-2 sm:items-end">
        <button
          type="button"
          onClick={startWizard}
          className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-base font-semibold text-white shadow-lg ring-2 ring-white/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ backgroundColor: accent }}
        >
          Start 3-Day Preview
        </button>
      </div>
    );
  }

  if (phase === 'profile' && currentStepDef) {
    const fieldKey = currentStepDef.fieldKey;
    const rawVal = profileDraft[fieldKey];

    return (
      <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-black/35 p-4 shadow-xl backdrop-blur-md sm:max-w-md">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">
            Step {profileStep + 1} of {steps.length}
          </p>
          <button type="button" onClick={closeToIdle} className={ghostBtnClass}>
            Close
          </button>
        </div>
        <h2 className="text-base font-semibold text-white">{currentStepDef.title}</h2>
        <div className="mt-4 flex flex-col gap-2">
          {currentStepDef.type === 'single'
            ? currentStepDef.options.map((opt) => {
                const active = rawVal === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFieldValue(fieldKey, opt.value)}
                    className={choiceBtnClass(active)}
                  >
                    {opt.label}
                  </button>
                );
              })
            : currentStepDef.options.map((opt) => {
                const arr = Array.isArray(rawVal)
                  ? rawVal.filter((x) => typeof x === 'string')
                  : [];
                const active = arr.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleMultiValue(fieldKey, opt.value)}
                    className={choiceBtnClass(active)}
                  >
                    {opt.label}
                  </button>
                );
              })}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={goBackProfile} className={ghostBtnClass}>
            Back
          </button>
          <button
            type="button"
            onClick={goNextProfile}
            disabled={!canAdvanceProfile}
            className="ml-auto inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white opacity-100 ring-2 ring-white/20 transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {profileStep >= steps.length - 1 ? 'Continue to email' : 'Next'}
          </button>
        </div>
        {error ? (
          <p className="mt-3 text-xs text-red-200" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (phase === 'email') {
    const siteKeyOk = typeof turnstileSiteKey === 'string' && turnstileSiteKey.trim().length > 0;
    const prodMissingSiteKey = import.meta.env.PROD && !siteKeyOk;

    return (
      <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-black/35 p-4 shadow-xl backdrop-blur-md sm:max-w-md">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">Almost there</p>
          <button type="button" onClick={goBackFromEmail} className={ghostBtnClass}>
            Back
          </button>
        </div>
        <h2 className="text-base font-semibold text-white">
          Enter your email to view your custom plan
        </h2>
        <p className="mt-1 text-xs text-white/70">
          {"We'll save your answers and start your 3-day preview in the app."}
        </p>
        {prodMissingSiteKey ? (
          <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-100">
            Storefront is missing{' '}
            <span className="font-mono text-[0.7rem]">PUBLIC_TURNSTILE_SITE_KEY</span> in the
            storefront Vercel project. Add your Turnstile <strong>site</strong> key, redeploy, then
            reload this page.
          </p>
        ) : null}
        <form onSubmit={onEmailSubmit} className="mt-4 flex flex-col gap-3">
          {typeof turnstileSiteKey === 'string' && turnstileSiteKey.trim() ? (
            <div className="flex min-h-[72px] w-full max-w-[320px] flex-col items-center justify-center gap-2 self-center">
              <Turnstile
                siteKey={turnstileSiteKey.trim()}
                options={{ appearance: 'always', size: 'normal', theme: 'auto' }}
                onSuccess={(token) => {
                  setTurnstileWidgetError(null);
                  setTurnstileToken(token);
                }}
                onExpire={() => {
                  setTurnstileToken(null);
                  setTurnstileWidgetError(
                    'Security check expired. It will refresh automatically, or reload the page.',
                  );
                }}
                onError={(code) => {
                  setTurnstileToken(null);
                  setTurnstileWidgetError(
                    `Turnstile could not run (code ${code ?? 'unknown'}). In Cloudflare → Turnstile → your widget: add this site’s exact hostname under Hostnames (include www vs apex), confirm the site key matches PUBLIC_TURNSTILE_SITE_KEY, then redeploy the storefront.`,
                  );
                }}
              />
              {turnstileWidgetError ? (
                <p className="text-center text-xs text-amber-100" role="alert">
                  {turnstileWidgetError}
                </p>
              ) : (
                <p className="text-center text-[0.65rem] text-white/50">
                  Complete the check above to enable the submit button.
                </p>
              )}
            </div>
          ) : null}
          <label className="sr-only" htmlFor="storefront-preview-email">
            Email
          </label>
          <input
            id="storefront-preview-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(ev) => setSnap((prev) => ({ ...prev, email: ev.target.value }))}
            className={inputClass}
          />
          {error ? (
            <p className="text-xs text-red-200" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={
              busy ||
              prodMissingSiteKey ||
              (typeof turnstileSiteKey === 'string' &&
                turnstileSiteKey.trim().length > 0 &&
                !turnstileToken)
            }
            className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg ring-2 ring-white/20 transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
            style={{ backgroundColor: accent }}
          >
            {busy ? 'Starting…' : 'Save & start preview'}
          </button>
        </form>
      </div>
    );
  }

  return null;
}
