import { useMemo, useState } from 'react';
import styles from './StorefrontHero.module.css';

/**
 * Phase 2: Profile (4-step wizard)
 *
 * @param {{
 *   profileDraft: Record<string, unknown>;
 *   updateProfile: (partial: Record<string, unknown>) => void;
 *   onBackToIdle: () => void;
 *   onAdvanceToOutline: () => void;
 * }} props
 */
export default function PhaseProfile({
  profileDraft,
  updateProfile,
  onBackToIdle,
  onAdvanceToOutline,
}) {
  const [step, setStep] = useState(0); // 0..3

  const steps = useMemo(
    () => [
      {
        id: 'goal',
        title: 'What is your primary goal?',
        key: 'primary_goal',
        options: ['Lose weight', 'Build muscle', 'General fitness', 'Sports performance'],
      },
      {
        id: 'experience',
        title: 'What is your experience level?',
        key: 'experience_level',
        options: ['beginner', 'intermediate', 'advanced'],
      },
      {
        id: 'equipment',
        title: 'What equipment do you have access to?',
        key: 'equipment',
        options: ['Bodyweight', 'Dumbbells', 'Barbells', 'Full gym', 'Cardio machines'],
      },
      {
        id: 'units',
        title: 'Preferred units?',
        key: 'unit_system',
        options: ['metric', 'imperial'],
      },
    ],
    [],
  );

  const current = steps[step];
  const currentValue = profileDraft?.[current.key];

  function goBack() {
    if (step <= 0) {
      onBackToIdle();
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  }

  function pickOption(opt) {
    if (current.key === 'equipment') {
      updateProfile({ equipment: [opt] });
    } else {
      updateProfile({ [current.key]: opt });
    }

    const isLast = step >= steps.length - 1;
    if (isLast) {
      onAdvanceToOutline();
      return;
    }
    setStep((s) => Math.min(steps.length - 1, s + 1));
  }

  return (
    <div>
      <div className={styles.headline}>Quick setup</div>
      <p className={styles.subhead}>Step {step + 1} of 4</p>

      <div className={styles.pipRow} aria-hidden="true">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`${styles.pip} ${i <= step ? styles.pipFilled : styles.pipEmpty}`}
          />
        ))}
      </div>

      <div className={styles.stepTitle}>{current.title}</div>
      <div className={styles.options}>
        {current.options.map((opt) => {
          const selected =
            current.key === 'equipment'
              ? Array.isArray(currentValue) && currentValue.includes(opt)
              : String(currentValue ?? '') === String(opt);
          return (
            <button
              key={opt}
              type="button"
              className={`${styles.optionCard} ${selected ? styles.optionCardSelected : ''}`}
              onClick={() => pickOption(opt)}
            >
              <span className={styles.radioDot} aria-hidden="true">
                <span className={styles.radioDotInner} />
              </span>
              <span style={{ textTransform: current.id === 'experience' ? 'capitalize' : 'none' }}>
                {current.id === 'units'
                  ? opt === 'metric'
                    ? 'Metric (kg, cm)'
                    : 'Imperial (lb, in)'
                  : current.id === 'experience'
                    ? opt[0].toUpperCase() + opt.slice(1)
                    : opt}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.secondaryBtn} onClick={goBack}>
          Back
        </button>
      </div>
    </div>
  );
}
