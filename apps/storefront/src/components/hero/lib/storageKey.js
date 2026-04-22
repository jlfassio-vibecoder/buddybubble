/**
 * Shared sessionStorage helpers for the storefront hero.
 *
 * Schema is intentionally identical to the legacy `useWizardState.ts` payload so the
 * new hero reads/writes the same key without creating a second source of truth:
 *   { version: 1, storedSlug: string, phase: WizardPhase, profileDraft: object }
 */

const STORAGE_VERSION = 1;

export function storageKey(publicSlug) {
  return `buddybubble_storefront_trial_v1:${(publicSlug || '').trim().toLowerCase()}`;
}

/**
 * Normalize a persisted phase value. Handles legacy strings defensively even though
 * the current repo already uses the target 6-phase naming.
 */
export function normalizePhase(raw) {
  if (
    raw === 'idle' ||
    raw === 'profile' ||
    raw === 'outline' ||
    raw === 'refine' ||
    raw === 'email' ||
    raw === 'loading'
  ) {
    return raw;
  }
  if (raw === 'workout_refine') return 'refine';
  return 'idle';
}

export function readPersisted(publicSlug) {
  if (typeof window === 'undefined') return null;
  const slug = (publicSlug || '').trim().toLowerCase();
  if (!slug) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (parsed.version !== STORAGE_VERSION) return null;
    if (parsed.storedSlug && parsed.storedSlug !== slug) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Merge a partial update into the persisted payload. Preserves sibling slices. */
export function writePersisted(publicSlug, partial) {
  if (typeof window === 'undefined') return;
  const slug = (publicSlug || '').trim().toLowerCase();
  if (!slug) return;
  try {
    const existing = readPersisted(slug) || {};
    const next = {
      ...existing,
      version: STORAGE_VERSION,
      storedSlug: slug,
      ...partial,
    };
    window.sessionStorage.setItem(storageKey(slug), JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}
