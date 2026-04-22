import { useEffect, useState } from 'react';
import styles from './PhaseLoading.module.css';

const STEPS_TRIAL = [
  { id: 'saving', label: 'Saving your preferences' },
  { id: 'workspace', label: 'Creating your workspace' },
  { id: 'workout', label: 'Generating your workout' },
  { id: 'open', label: 'Opening the app' },
];

const STEPS_WELCOME = [
  { id: 'verifying', label: 'Verifying your account' },
  { id: 'open', label: 'Opening the app' },
];

const SUCCESS_BEAT_MS = 400;

/**
 * Phase 6 — Loading. Pure render target for `submitState`. The only timers here
 * are:
 *  - a cosmetic step-advance schedule while status is pending/taking_longer
 *  - the 400ms success "beat" before redirect
 *
 * The 8s "taking longer" and 20s retry transitions live in `useSubmitState`.
 *
 * @param {{
 *   submitState: {
 *     status: 'pending' | 'taking_longer' | 'success' | 'already_member' | 'error';
 *     next?: string;
 *     workspaceId?: string;
 *     error?: string;
 *   };
 *   onRetry: () => void;
 *   onEditEmail: () => void;
 * }} props
 */
export default function PhaseLoading({ submitState, onRetry, onEditEmail }) {
  const status = submitState?.status ?? 'pending';
  const steps = status === 'already_member' ? STEPS_WELCOME : STEPS_TRIAL;
  const [reached, setReached] = useState(0);

  useEffect(() => {
    if (status === 'pending') setReached(0);
  }, [status]);

  // Cosmetic step progression while we wait on the network.
  useEffect(() => {
    if (status !== 'pending' && status !== 'taking_longer') return;
    const t1 = setTimeout(() => setReached((r) => Math.max(r, 1)), 2000);
    const t2 = setTimeout(() => setReached((r) => Math.max(r, 2)), 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [status]);

  // Success / already_member: mark all steps done, beat, then redirect.
  useEffect(() => {
    if (status === 'success' && typeof submitState.next === 'string' && submitState.next) {
      setReached(steps.length);
      const t = setTimeout(() => window.location.assign(submitState.next), SUCCESS_BEAT_MS);
      return () => clearTimeout(t);
    }
    if (status === 'already_member') {
      setReached(steps.length);
      const path = submitState.workspaceId
        ? `/login?next=${encodeURIComponent(`/app/${submitState.workspaceId}`)}`
        : '/login';
      const t = setTimeout(() => window.location.assign(path), SUCCESS_BEAT_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status, submitState.next, submitState.workspaceId, steps.length]);

  const heading =
    status === 'already_member'
      ? 'Welcome back'
      : status === 'error'
        ? 'We hit a snag'
        : 'Setting up your preview…';
  const subhead =
    status === 'already_member'
      ? 'You already have access — opening the app…'
      : status === 'error'
        ? submitState.error || 'Something went wrong — please try again.'
        : null;
  const showTakingLonger = status === 'taking_longer';

  return (
    <div className="hero-fade-in flex w-full flex-col items-center gap-5">
      {status !== 'error' ? (
        <div className={styles.pulseCircle} aria-hidden="true">
          <div className={styles.pulseDot} />
        </div>
      ) : null}

      <h2 className={styles.headline}>{heading}</h2>
      {subhead ? <p className={styles.subcopy}>{subhead}</p> : null}

      {status !== 'error' ? (
        <ul className={styles.stepList} aria-live="polite">
          {steps.map((s, i) => {
            const isDone = i < reached || status === 'success' || status === 'already_member';
            const isActive = !isDone && i === reached;
            const iconClass = isDone
              ? styles.stepIconDone
              : isActive
                ? styles.stepIconActive
                : styles.stepIconPending;
            const labelClass = isDone
              ? styles.stepLabelDone
              : isActive
                ? styles.stepLabelActive
                : styles.stepLabelPending;
            return (
              <li key={s.id} className={styles.stepRow}>
                <span className={styles.stepIconWrap}>
                  <span className={iconClass} aria-hidden="true">
                    {isDone ? '✓' : null}
                  </span>
                </span>
                <span className={`${styles.stepLabel} ${labelClass}`}>{s.label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showTakingLonger ? (
        <p className={styles.takingLonger}>This is taking longer than usual — hang tight.</p>
      ) : null}

      {status === 'error' ? (
        <div className={styles.errorActions}>
          <button type="button" onClick={onRetry} className={styles.primaryBtn}>
            Try again
          </button>
          <button type="button" onClick={onEditEmail} className={styles.ghostLink}>
            Go back and edit email
          </button>
        </div>
      ) : null}
    </div>
  );
}
