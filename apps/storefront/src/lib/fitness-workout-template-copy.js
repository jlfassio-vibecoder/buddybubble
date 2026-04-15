/**
 * Client-side copy for the post-questionnaire "workout template" step (no extra AI round-trip).
 * Final AI personalization still runs server-side when the trial workout is created.
 *
 * @param {Record<string, unknown>} draft
 * @returns {{ headline: string; focusLine: string; equipmentLine: string | null }}
 */
export function getFitnessWorkoutTemplateCopy(draft) {
  const goal =
    typeof draft.primary_goal === 'string' && draft.primary_goal.trim()
      ? draft.primary_goal.trim()
      : 'your goals';
  const exp =
    typeof draft.experience_level === 'string' && draft.experience_level.trim()
      ? draft.experience_level.trim()
      : 'your level';
  const equip = Array.isArray(draft.equipment)
    ? draft.equipment.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
    : [];

  let focusLine = '';
  if (exp === 'beginner') {
    focusLine =
      'We’ll bias toward technique, manageable volume, and clear progressions—great for building habits safely.';
  } else if (exp === 'advanced') {
    focusLine =
      'We can layer more density and complexity while keeping structure clear so you can execute with intent.';
  } else {
    focusLine =
      'We’ll balance solid work capacity with enough recovery between efforts for sustainable progress.';
  }

  const equipmentLine =
    equip.length > 0
      ? `You listed: ${equip.join(', ')}. We’ll shape the session to fit what you have available.`
      : null;

  return {
    headline: `Suggested direction: sessions aligned to “${goal}”`,
    focusLine,
    equipmentLine,
  };
}

/** Short prompts shown above the freeform textarea. */
export const WORKOUT_REFINE_PROMPTS = [
  'Any injuries, joint issues, or areas that are sore today?',
  'Equipment or space limits (e.g. home vs gym, dumbbells only)?',
  'Anything else your coach should know before you start?',
];
