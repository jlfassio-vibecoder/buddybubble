import { useState } from 'react';
import styles from './StorefrontHero.module.css';

/**
 * Phase 5: Email (static UI only; no Turnstile or API wiring yet).
 */
export default function PhaseEmail() {
  const [email, setEmail] = useState('');

  return (
    <div>
      <div className={styles.headline}>Save your preview</div>
      <p className={styles.subhead}>
        Enter your email to save your answers and start your preview in the app.
      </p>

      <div className={styles.divider} />

      <label className={styles.fieldLabel} htmlFor="storefront-hero-email">
        Email
      </label>
      <input
        id="storefront-hero-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@email.com"
        className={styles.input}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div className={styles.footer}>
        <button type="button" className={styles.primaryBtn}>
          Save & start preview
        </button>
      </div>
    </div>
  );
}
