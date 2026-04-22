import styles from './PhaseOutline.module.css';
import { useOutlineGeneration } from '../hooks/useOutlineGeneration';

const MAX_EXERCISES_PREVIEW = 4;

/**
 * Phase 3 — Outline.
 *
 * Fitness workspaces fetch a single-day preview from `/api/storefront-preview`
 * (Vertex), cache it on `draft.fitnessAiPreview` keyed by a profile fingerprint,
 * and render what comes back. The shape is one-day, not multi-session — see
 * `validateStorefrontPreviewPayload` in the runner for the source of truth.
 *
 * Business workspaces reach this phase but the preview endpoint is fitness-
 * shaped, so we skip the fetch and show a minimal card that advances to email.
 * Flagged in pass-3 notes for a possible future `profile → email` direct edge.
 *
 * @param {{
 *   draft: Record<string, unknown>;
 *   updateDraft: (partial: Record<string, unknown>) => void;
 *   onNext: () => void;
 *   onBack: () => void;
 *   accentColor?: string;
 *   categoryType: 'business' | 'fitness';
 * }} props
 */
export default function PhaseOutline({
  draft,
  updateDraft,
  onNext,
  onBack,
  accentColor,
  categoryType,
}) {
  const isFitness = categoryType === 'fitness';
  const { status, error, preview, regenerate } = useOutlineGeneration({
    enabled: isFitness,
    draft,
    updateDraft,
  });

  if (!isFitness) {
    return (
      <div className="hero-fade-in flex w-full flex-col items-center gap-5">
        <span className={styles.chip}>
          <span className={styles.chipDot} aria-hidden="true" />
          Your preview
        </span>
        <h2 className={styles.headline}>Ready when you are.</h2>
        <p className={styles.subcopy}>We’ll set up your 3-day preview in the app after you save.</p>
        <div className={`${styles.actionsRow} mt-2`}>
          <button type="button" onClick={onBack} className={styles.backBtn}>
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className={styles.primaryBtn}
            style={accentColor ? { backgroundColor: accentColor } : undefined}
          >
            Save &amp; start preview →
          </button>
        </div>
      </div>
    );
  }

  const isInitialLoading = status === 'loading' && !preview;
  const isRegenerating = status === 'loading' && Boolean(preview);
  const showOutlineCard = Boolean(preview) && (status === 'ready' || isRegenerating);
  const showErrorCard = status === 'error';

  return (
    <div className="hero-fade-in flex w-full flex-col items-center gap-5">
      {showErrorCard ? (
        <span className={`${styles.chip} ${styles.chipError}`}>
          <span className={styles.chipDot} aria-hidden="true" />
          Something went wrong
        </span>
      ) : isInitialLoading ? (
        <span className={styles.chip}>
          <span className={`${styles.chipDot} ${styles.chipDotPulse}`} aria-hidden="true" />
          Generating your preview
        </span>
      ) : (
        <span className={styles.chip}>
          <span className={styles.chipDot} aria-hidden="true" />
          Your preview is ready
        </span>
      )}

      <h2 className={styles.headline}>
        {showOutlineCard
          ? preview.title
          : isInitialLoading
            ? 'Creating your plan…'
            : showErrorCard
              ? 'We couldn’t generate your preview'
              : 'Your preview'}
      </h2>

      {showOutlineCard && preview.tagline ? (
        <p className={styles.subcopy}>{preview.tagline}</p>
      ) : isInitialLoading ? (
        <p className={styles.subcopy}>This usually takes a few seconds.</p>
      ) : null}

      {isInitialLoading ? (
        <div className={styles.skeletonCard} aria-live="polite">
          <div
            className={`${styles.skeletonRow} ${styles.skeletonRowTall}`}
            style={{ width: '40%' }}
          />
          <div className="mt-3">
            <div className={`${styles.skeletonRow} ${styles.skeletonRowTall}`} />
          </div>
          <div className="mt-2">
            <div className={`${styles.skeletonRow} ${styles.skeletonRowShort}`} />
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <div
              className={`${styles.skeletonRow} ${styles.skeletonRowTall}`}
              style={{ width: '80%' }}
            />
            <div
              className={`${styles.skeletonRow} ${styles.skeletonRowTall}`}
              style={{ width: '70%' }}
            />
            <div
              className={`${styles.skeletonRow} ${styles.skeletonRowTall}`}
              style={{ width: '75%' }}
            />
          </div>
        </div>
      ) : null}

      {showErrorCard ? (
        <div className={styles.errorCard} role="alert">
          <p>{error || "We couldn't generate your preview — please try again."}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={regenerate}
              className={styles.primaryBtn}
              style={accentColor ? { backgroundColor: accentColor } : undefined}
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {showOutlineCard ? (
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}>
            <p className={styles.dayLabel}>{preview.day_label}</p>
            <p className={styles.duration}>~{preview.estimated_minutes} min</p>
          </div>
          <hr className={styles.divider} />
          <p className={styles.summary}>{preview.summary}</p>
          <ol className={`${styles.exerciseList} mt-5`}>
            {preview.main_exercises.slice(0, MAX_EXERCISES_PREVIEW).map((ex, i) => (
              <li key={`${ex.name}-${i}`} className={styles.exerciseRow}>
                <span className={styles.exerciseNum}>{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <span className={styles.exerciseName}>{ex.name}</span>
                  <span className={styles.exerciseDetail}>{ex.detail}</span>
                </span>
              </li>
            ))}
            {preview.main_exercises.length > MAX_EXERCISES_PREVIEW ? (
              <li className={styles.exerciseMore}>
                +{preview.main_exercises.length - MAX_EXERCISES_PREVIEW} more in the app
              </li>
            ) : null}
          </ol>
          {preview.coach_tip ? (
            <p className={styles.pullquote}>
              <span className={styles.pullquoteLabel}>Coach tip</span>
              {preview.coach_tip}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actionsRow}>
        <button type="button" onClick={onBack} className={styles.backBtn}>
          Back
        </button>
        <div className={styles.actionsRight}>
          {status === 'ready' ? (
            <button type="button" onClick={regenerate} className={styles.ghostBtn}>
              Regenerate
            </button>
          ) : null}
          {isRegenerating ? (
            <button
              type="button"
              disabled
              className={`${styles.ghostBtn} ${styles.ghostBtnDisabled}`}
            >
              Regenerating…
            </button>
          ) : null}
          {status === 'ready' ? (
            <button
              type="button"
              onClick={onNext}
              className={styles.primaryBtn}
              style={accentColor ? { backgroundColor: accentColor } : undefined}
            >
              Fine-tune this plan →
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
