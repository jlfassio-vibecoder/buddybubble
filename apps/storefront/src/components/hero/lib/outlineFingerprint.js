/**
 * Pure helpers for the outline-generation cache.
 *
 * Fingerprint rules:
 *  - Only profile fields that feed the Vertex prompt participate.
 *  - Array fields (equipment) are sorted for stability (order doesn't matter
 *    to the model; we don't want order-change to invalidate the cache).
 *  - Missing fields normalize to empty string so partial drafts still hash.
 *
 * Deliberately excluded: refine-phase fields (`intensity_preference`,
 * `storefront_workout_notes`, `storefront_fitness_goals_text`). Those are
 * applied AFTER outline and don't affect the outline generation.
 */

export const OUTLINE_FINGERPRINT_FIELDS = [
  'primary_goal',
  'experience_level',
  'equipment',
  'unit_system',
];

export function outlineFingerprint(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return '';
  const normalized = {};
  for (const k of OUTLINE_FINGERPRINT_FIELDS) {
    const v = draft[k];
    if (Array.isArray(v)) {
      normalized[k] = [...v].map((x) => String(x)).sort();
    } else if (v === undefined || v === null) {
      normalized[k] = '';
    } else {
      normalized[k] = String(v);
    }
  }
  try {
    return JSON.stringify(normalized);
  } catch {
    return '';
  }
}

/**
 * The subset of the draft that should actually be sent to the preview endpoint.
 * Kept narrow so we don't accidentally leak email or other unrelated keys
 * to the Vertex prompt.
 */
export function buildOutlineProfile(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return {};
  const out = {};
  for (const k of OUTLINE_FINGERPRINT_FIELDS) {
    if (draft[k] !== undefined && draft[k] !== null) out[k] = draft[k];
  }
  return out;
}
