import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './StorefrontHero.module.css';
import HeroNav from './HeroNav';
import HeroShell from './HeroShell';
import PhaseIdle from './phases/PhaseIdle';
import PhaseProfile from './phases/PhaseProfile';
import PhaseOutline from './phases/PhaseOutline';
import PhaseRefine from './phases/PhaseRefine';
import PhaseEmail from './phases/PhaseEmail';
import PhaseLoading from './phases/PhaseLoading';
import { useHeroPhase } from './hooks/useHeroPhase';
import { useWizardDraft } from './hooks/useWizardDraft';
import { useSubmitState } from './hooks/useSubmitState';
import { nextAfter, previousOf } from './lib/phaseTransitions';
import { getCurrentAttribution } from './lib/attribution';
import { isValidOutline } from './lib/fetchOutline';
import { storageKey } from './lib/storageKey';

/** Mirrors `MAX_PROFILE_JSON_BYTES` in `src/app/api/leads/storefront-trial/route.ts`. */
const MAX_STOREFRONT_PROFILE_JSON_BYTES = 100_000;

/**
 * Top-level orchestrator. Owns the submit lifecycle so PhaseEmail stays thin and
 * PhaseLoading is a pure render of `submitState`.
 *
 * @param {{
 *   publicSlug: string;
 *   categoryType: 'business' | 'fitness';
 *   workspaceName?: string;
 *   workspaceId?: string;
 *   accentColor?: string;
 *   joinHref: string;
 * }} props
 */
export default function StorefrontHero({
  publicSlug,
  categoryType,
  workspaceName,
  workspaceId,
  accentColor,
  joinHref,
}) {
  const slug = useMemo(() => (publicSlug || '').trim().toLowerCase(), [publicSlug]);
  const { phase, setPhase, forcePhase } = useHeroPhase(slug, categoryType);
  const { draft, updateDraft } = useWizardDraft(slug);
  const { submitState, submit, retry, reset } = useSubmitState();

  const [interrupted, setInterrupted] = useState(false);
  const [profilePayloadError, setProfilePayloadError] = useState(null);

  // Reload during `loading`: the Turnstile token is single-use and we have no
  // active submit in-flight, so bounce back to email and prompt a retry.
  useEffect(() => {
    if (phase === 'loading' && submitState.status === 'idle' && !interrupted) {
      setInterrupted(true);
      forcePhase('email');
    }
  }, [phase, submitState.status, interrupted, forcePhase]);

  // Leaving `loading` via any path other than resolution (back nav from email,
  // user clicks "edit email" after error, etc.) must clear in-flight timers.
  useEffect(() => {
    if (phase !== 'loading' && submitState.status !== 'idle') {
      reset();
    }
  }, [phase, submitState.status, reset]);

  useEffect(() => {
    if (phase !== 'email') setProfilePayloadError(null);
  }, [phase]);

  useEffect(() => {
    if (submitState.status !== 'success' && submitState.status !== 'already_member') return;
    if (!slug || typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(storageKey(slug));
    } catch {
      // ignore
    }
  }, [slug, submitState.status]);

  const goNext = useCallback(
    () => setPhase(nextAfter(phase, categoryType)),
    [setPhase, phase, categoryType],
  );
  const goBack = useCallback(
    () => setPhase(previousOf(phase, categoryType)),
    [setPhase, phase, categoryType],
  );

  const handleEmailSubmit = useCallback(
    ({ email }) => {
      const trimmed = String(email || '')
        .trim()
        .toLowerCase();
      if (!trimmed) return;
      setProfilePayloadError(null);
      const { source, utmParams } = getCurrentAttribution();

      // Fitness-only: include cachedWorkoutData when PhaseOutline has populated a
      // valid Vertex preview on the draft (pass 3). Business flows never populate
      // `fitnessAiPreview`, so this naturally omits the key.
      const outline = draft?.fitnessAiPreview;
      const hasOutline = categoryType === 'fitness' && isValidOutline(outline);

      const profile = { ...draft, email: trimmed };
      let profileBytes = 0;
      try {
        profileBytes = new TextEncoder().encode(JSON.stringify(profile)).length;
      } catch {
        setProfilePayloadError(
          'Something in your profile could not be saved. Remove unusual values and try again.',
        );
        return;
      }
      if (profileBytes > MAX_STOREFRONT_PROFILE_JSON_BYTES) {
        setProfilePayloadError(
          'Your answers use too much space. Shorten notes or goals and try again.',
        );
        return;
      }

      const payload = {
        publicSlug: slug,
        email: trimmed,
        source,
        utmParams,
        profile,
        ...(hasOutline ? { cachedWorkoutData: outline } : {}),
      };

      setInterrupted(false);
      forcePhase('loading');
      submit(payload, { fallbackWorkspaceId: workspaceId });
    },
    [slug, draft, categoryType, workspaceId, forcePhase, submit],
  );

  const handleEditEmail = useCallback(() => {
    reset();
    forcePhase('email');
  }, [reset, forcePhase]);

  let body = null;
  switch (phase) {
    case 'idle':
      body = <PhaseIdle onNext={goNext} accentColor={accentColor} workspaceName={workspaceName} />;
      break;
    case 'profile':
      body = (
        <PhaseProfile
          draft={draft}
          onChange={updateDraft}
          onNext={goNext}
          onBack={goBack}
          accentColor={accentColor}
        />
      );
      break;
    case 'outline':
      body = (
        <PhaseOutline
          draft={draft}
          updateDraft={updateDraft}
          onNext={goNext}
          onBack={goBack}
          accentColor={accentColor}
          categoryType={categoryType}
        />
      );
      break;
    case 'refine':
      body = (
        <PhaseRefine
          draft={draft}
          onChange={updateDraft}
          onNext={goNext}
          onBack={goBack}
          accentColor={accentColor}
        />
      );
      break;
    case 'email':
      body = (
        <PhaseEmail
          draft={draft}
          onChange={updateDraft}
          onSubmit={handleEmailSubmit}
          onBack={goBack}
          accentColor={accentColor}
          interrupted={interrupted}
          payloadGuardError={profilePayloadError}
        />
      );
      break;
    case 'loading':
    default:
      body = (
        <PhaseLoading submitState={submitState} onRetry={retry} onEditEmail={handleEditEmail} />
      );
      break;
  }

  const strongGlow = phase === 'email' || phase === 'loading';

  return (
    <div className={styles.heroWrap}>
      <div className={styles.radialGlow} aria-hidden="true" />
      {strongGlow ? <div className={styles.radialGlowStrong} aria-hidden="true" /> : null}
      <HeroNav workspaceName={workspaceName} joinHref={joinHref} accentColor={accentColor} />
      <HeroShell>{body}</HeroShell>
    </div>
  );
}
