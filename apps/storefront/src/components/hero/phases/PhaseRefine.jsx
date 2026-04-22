import styles from './PhaseRefine.module.css';

const FOCUS_OPTIONS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
const AVOID_OPTIONS = ['High impact', 'Overhead press', 'Deep squat', 'Running'];

const DURATION_MIN = 15;
const DURATION_MAX = 90;

function OptionChips({ label, options, selected, onToggle }) {
  return (
    <section>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.chipRow}>
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              aria-pressed={on}
              className={`${styles.optionChip} ${on ? styles.optionChipSelected : ''}`}
            >
              {on ? (
                <span className={styles.chipCheck} aria-hidden="true">
                  ✓
                </span>
              ) : null}
              {o}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Phase 4 — Refine. Fitness-only (skipped for business by StorefrontHero).
 * "Skip" and "Apply & continue" both advance; draft is preserved either way.
 */
export default function PhaseRefine({ draft, onChange, onNext, onBack, accentColor }) {
  const focus = Array.isArray(draft?.refine_focus) ? draft.refine_focus : [];
  const avoid = Array.isArray(draft?.refine_avoid) ? draft.refine_avoid : [];
  const duration = Number(draft?.refine_duration_min ?? 45);
  const notes = String(draft?.storefront_workout_notes ?? '');

  const toggle = (key, current, opt) =>
    onChange({
      [key]: current.includes(opt) ? current.filter((v) => v !== opt) : [...current, opt],
    });

  const fillPct = ((duration - DURATION_MIN) / (DURATION_MAX - DURATION_MIN)) * 100;

  return (
    <div className="hero-fade-in flex w-full flex-col items-center gap-5">
      <span className={styles.chip}>
        <span className={styles.chipDot} aria-hidden="true" />
        Refine your plan
      </span>

      <div className="flex flex-col items-center gap-2">
        <h2 className={styles.headline}>Make it yours.</h2>
        <p className={styles.subcopy}>Optional — skip if the first pass already looks right.</p>
      </div>

      <div className={styles.formCard}>
        <OptionChips
          label="Focus areas"
          options={FOCUS_OPTIONS}
          selected={focus}
          onToggle={(o) => toggle('refine_focus', focus, o)}
        />
        <OptionChips
          label="Avoid"
          options={AVOID_OPTIONS}
          selected={avoid}
          onToggle={(o) => toggle('refine_avoid', avoid, o)}
        />

        <section>
          <label className={styles.fieldLabel} htmlFor="refine-duration">
            Session duration
          </label>
          <div className={styles.durationRow}>
            <input
              id="refine-duration"
              type="range"
              min={DURATION_MIN}
              max={DURATION_MAX}
              step={5}
              value={duration}
              onChange={(e) => onChange({ refine_duration_min: Number(e.target.value) })}
              className={styles.rangeInput}
              style={{ ['--hero-range-fill']: `${fillPct}%` }}
              aria-valuemin={DURATION_MIN}
              aria-valuemax={DURATION_MAX}
              aria-valuenow={duration}
            />
            <span className={styles.rangeValue} aria-hidden="true">
              {duration} min
            </span>
          </div>
        </section>

        <section>
          <label className={styles.fieldLabel} htmlFor="refine-notes">
            Notes
          </label>
          <textarea
            id="refine-notes"
            rows={3}
            value={notes}
            onChange={(e) => onChange({ storefront_workout_notes: e.target.value })}
            placeholder="Anything else we should know?"
            className={styles.textarea}
          />
        </section>
      </div>

      <div className={styles.actionsRow}>
        <button type="button" onClick={onBack} className={styles.backBtn}>
          Back
        </button>
        <div className={styles.actionsRight}>
          <button type="button" onClick={onNext} className={styles.skipBtn}>
            Skip
          </button>
          <button
            type="button"
            onClick={onNext}
            className={styles.primaryBtn}
            style={accentColor ? { backgroundColor: accentColor } : undefined}
          >
            Apply &amp; continue →
          </button>
        </div>
      </div>
    </div>
  );
}
