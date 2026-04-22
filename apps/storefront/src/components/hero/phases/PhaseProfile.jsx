import { useState } from 'react';
import styles from './PhaseProfile.module.css';

const STEPS = [
  {
    key: 'primary_goal',
    title: 'What is your primary goal?',
    options: ['Lose weight', 'Build muscle', 'General fitness', 'Sports performance'],
  },
  {
    key: 'experience_level',
    title: 'What is your experience level?',
    options: ['beginner', 'intermediate', 'advanced'],
  },
  {
    key: 'equipment',
    title: 'What equipment do you have?',
    options: ['Bodyweight', 'Dumbbells', 'Barbells', 'Full gym'],
    multi: true,
  },
  {
    key: 'unit_system',
    title: 'Preferred units?',
    options: ['metric', 'imperial'],
  },
];

/**
 * Phase 2 — Profile (4-step wizard).
 *
 * @param {{
 *   draft: Record<string, unknown>;
 *   onChange: (partial: Record<string, unknown>) => void;
 *   onNext: () => void;
 *   onBack: () => void;
 *   accentColor?: string;
 * }} props
 */
export default function PhaseProfile({ draft, onChange, onNext, onBack, accentColor }) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const value = draft?.[step.key];
  const canAdvance = step.multi
    ? Array.isArray(value) && value.length > 0
    : value !== undefined && value !== null && String(value).length > 0;

  function pick(opt) {
    if (step.multi) {
      const prev = Array.isArray(value) ? value : [];
      const next = prev.includes(opt) ? prev.filter((v) => v !== opt) : [...prev, opt];
      onChange({ [step.key]: next });
    } else {
      onChange({ [step.key]: opt });
    }
  }

  function handleBack() {
    if (stepIdx === 0) onBack();
    else setStepIdx((i) => Math.max(0, i - 1));
  }
  function handleNext() {
    if (!canAdvance) return;
    if (stepIdx === STEPS.length - 1) onNext();
    else setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  }

  const oddLastOption =
    step.options.length % 2 === 1 ? step.options[step.options.length - 1] : null;

  return (
    <div className="hero-fade-in flex w-full flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-2">
        <span className={styles.eyebrow}>
          Step {stepIdx + 1} of {STEPS.length}
        </span>
        <div className={styles.pipRow} aria-hidden="true">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`${styles.pip} ${i < stepIdx ? styles.pipDone : ''} ${i === stepIdx ? styles.pipActive : ''}`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <h2 className={styles.header}>Tell us about you.</h2>
        <p className={styles.subcopy}>Answers stay local until you save your preview.</p>
      </div>

      <div className={styles.formCard}>
        <p className={styles.question}>{step.title}</p>
        <div className={`${styles.optionsGrid} mt-5`}>
          {step.options.map((opt) => {
            const selected = step.multi
              ? Array.isArray(value) && value.includes(opt)
              : value === opt;
            const span2 = opt === oddLastOption;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => pick(opt)}
                aria-pressed={selected}
                className={`${styles.optionCard} ${selected ? styles.optionCardSelected : ''} ${span2 ? styles.optionSpan2 : ''} ${styles.capitalize}`}
              >
                <span className={styles.radioDot} aria-hidden="true" />
                <span>{opt}</span>
              </button>
            );
          })}
        </div>
        <div className={`${styles.actionsRow} mt-6`}>
          <button type="button" onClick={handleBack} className={styles.backBtn}>
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance}
            className={styles.continueBtn}
            style={accentColor ? { backgroundColor: accentColor } : undefined}
          >
            {stepIdx === STEPS.length - 1 ? 'Generate plan →' : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  );
}
