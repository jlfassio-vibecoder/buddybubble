import { useMemo } from 'react';
import { useWizardState } from './useWizardState';
import PhaseIdle from './PhaseIdle';
import PhaseProfile from './PhaseProfile';
import PhaseEmail from './PhaseEmail';
import styles from './StorefrontHero.module.css';

/**
 * Master hero container for the redesigned 6-phase storefront wizard.
 *
 * NOTE: Outline/refine/loading phases are intentionally not implemented yet (Step 2 scope).
 *
 * @param {{ publicSlug: string }} props
 */
export default function StorefrontHeroCTA({ publicSlug }) {
  const slug = useMemo(() => (publicSlug || '').trim().toLowerCase(), [publicSlug]);
  const wizard = useWizardState(slug);

  let body = null;
  switch (wizard.phase) {
    case 'idle':
      body = <PhaseIdle onStart={() => wizard.setPhase('profile')} />;
      break;
    case 'profile':
      body = (
        <PhaseProfile
          profileDraft={wizard.profileDraft}
          updateProfile={wizard.updateProfile}
          onBackToIdle={() => wizard.setPhase('idle')}
          onAdvanceToOutline={() => wizard.setPhase('outline')}
        />
      );
      break;
    case 'email':
      body = <PhaseEmail />;
      break;
    // Not implemented yet (Step 2): outline/refine/loading.
    // Keep container stable so swapping content doesn't jump layout.
    case 'outline':
    case 'refine':
    case 'loading':
    default:
      body = (
        <div>
          <div className={styles.headline}>Coming next</div>
          <p className={styles.subhead}>
            Outline, Refine, and Loading phases will be implemented in the next step.
          </p>
          <div className={styles.divider} />
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => wizard.setPhase('idle')}
            >
              Back to start
            </button>
          </div>
        </div>
      );
      break;
  }

  return (
    <div className={styles.heroWrap}>
      <div className={styles.radialGlow} aria-hidden="true" />
      <div className={styles.heroCard}>{body}</div>
    </div>
  );
}
