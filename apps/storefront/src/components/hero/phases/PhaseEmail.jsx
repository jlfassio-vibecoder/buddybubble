import { useEffect, useState } from 'react';
import styles from './PhaseEmail.module.css';
import { ensureTurnstileLoaded, isTurnstileConfigured } from '../lib/turnstile';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phase 5 — Email. Owns only local email input + client-side validation.
 * Actual POST + Turnstile token acquisition live in `StorefrontHero` via
 * `useSubmitState`, so this component can be a pure render target later.
 *
 * @param {{
 *   draft: Record<string, unknown>;
 *   onChange: (partial: Record<string, unknown>) => void;
 *   onSubmit: (args: { email: string }) => void;
 *   onBack: () => void;
 *   accentColor?: string;
 *   interrupted?: boolean;
 *   payloadGuardError?: string | null;
 * }} props
 */
export default function PhaseEmail({
  draft,
  onChange,
  onSubmit,
  onBack,
  accentColor,
  interrupted,
  payloadGuardError,
}) {
  const [email, setEmail] = useState(String(draft?.email ?? ''));
  const [fieldError, setFieldError] = useState(null);

  useEffect(() => {
    setEmail(String(draft?.email ?? ''));
  }, [draft?.email]);

  // Lazy-load the Turnstile script on first arrival at this phase so we don't
  // pay the network cost on the landing page. `useSubmitState` will call
  // `getTurnstileToken` which awaits this same load promise.
  useEffect(() => {
    if (!isTurnstileConfigured()) return;
    ensureTurnstileLoaded().catch((e) => {
      console.error('[storefront-hero] turnstile load', e);
    });
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setFieldError('Enter a valid email address.');
      return;
    }
    setFieldError(null);
    onChange({ email: trimmed });
    onSubmit({ email: trimmed });
  }

  const outline = draft?.fitnessAiPreview;
  const hasOutline =
    outline &&
    typeof outline === 'object' &&
    typeof outline.title === 'string' &&
    outline.title.trim().length > 0;
  const summaryTitle = hasOutline ? outline.title : 'Your 3-day preview';
  const summaryMeta = hasOutline
    ? `${outline.day_label || 'Day 1'} · ~${outline.estimated_minutes || '—'} min`
    : 'Set up after you save';

  return (
    <div className="hero-fade-in flex w-full flex-col items-center gap-5">
      <span className={styles.chip}>
        <span className={styles.chipDot} aria-hidden="true" />
        Last step
      </span>

      <div className="flex flex-col items-center gap-2">
        <h2 className={styles.headline}>Where should we save your plan?</h2>
        <p className={styles.subcopy}>
          We’ll email you a one-tap magic link. No password required.
        </p>
      </div>

      {interrupted ? (
        <div className={styles.interruptedNotice} role="status">
          Your previous submission didn’t complete. Please try again.
        </div>
      ) : null}

      {payloadGuardError ? (
        <div className={styles.interruptedNotice} role="alert">
          {payloadGuardError}
        </div>
      ) : null}

      <div className={styles.summaryCard}>
        <div className={styles.summaryBody}>
          <p className={styles.summaryTitle}>{summaryTitle}</p>
          <p className={styles.summaryMeta}>{summaryMeta}</p>
        </div>
        <button type="button" onClick={onBack} className={styles.editBtn}>
          Edit
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <label htmlFor="hero-email" className={styles.fieldLabel}>
          Email
        </label>
        <div className={styles.inputRow}>
          <input
            id="hero-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            placeholder="you@email.com"
            aria-invalid={fieldError ? 'true' : 'false'}
            aria-describedby={fieldError ? 'hero-email-error' : undefined}
            className={`${styles.input} ${fieldError ? styles.inputInvalid : ''}`}
          />
          <button
            type="submit"
            className={styles.submitBtn}
            style={accentColor ? { backgroundColor: accentColor } : undefined}
          >
            Save &amp; start preview →
          </button>
        </div>
        {fieldError ? (
          <p id="hero-email-error" className={styles.errorText} role="alert">
            {fieldError}
          </p>
        ) : null}
      </form>

      <p className={styles.finePrint}>
        By continuing you agree to our terms and privacy policy. Protected by Cloudflare Turnstile.
      </p>
    </div>
  );
}
