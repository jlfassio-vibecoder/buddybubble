import styles from './PhaseIdle.module.css';

/**
 * Phase 1 — Idle. Headline + primary CTA + microproof.
 *
 * @param {{ onNext: () => void; accentColor?: string; workspaceName?: string }} props
 */
export default function PhaseIdle({ onNext, accentColor, workspaceName }) {
  return (
    <div className="hero-fade-in flex w-full flex-col items-center gap-5">
      <span className={styles.eyebrow}>
        <span className={styles.eyebrowDot} aria-hidden="true" />
        BuddyBubble · AI workout generator
      </span>

      <h1 className={styles.headline}>
        Your next workout,
        <br />
        <span className={styles.headlineAccent}>built for you in 60 seconds.</span>
      </h1>

      <p className={styles.subcopy}>
        {workspaceName
          ? `A quick 3-day preview for ${workspaceName} members. No signup needed to see your plan.`
          : 'A quick 3-day preview tailored to you. No signup needed to see your plan.'}
      </p>

      <button
        type="button"
        onClick={onNext}
        className={styles.primaryCta}
        style={accentColor ? { backgroundColor: accentColor } : undefined}
      >
        Start 3-day preview <span aria-hidden="true">→</span>
      </button>

      <div className={styles.microproof}>
        <span>No signup to preview</span>
        <span className={styles.microproofSep} aria-hidden="true">
          •
        </span>
        <span>Free 3-day outline</span>
        <span className={styles.microproofSep} aria-hidden="true">
          •
        </span>
        <span>Email only at the end</span>
      </div>
    </div>
  );
}
