import styles from './StorefrontHero.module.css';

/**
 * Phase 1: Idle
 *
 * @param {{ onStart: () => void }} props
 */
export default function PhaseIdle({ onStart }) {
  return (
    <div>
      <div className={styles.headline}>A 3‑day preview, built around your goals</div>
      <p className={styles.subhead}>
        Answer 4 quick questions. We’ll prep your preview experience and continue in the BuddyBubble
        app.
      </p>
      <div className={styles.divider} />
      <div className={styles.footer}>
        <button type="button" className={styles.primaryBtn} onClick={onStart}>
          Start 3-day preview
        </button>
      </div>
    </div>
  );
}
